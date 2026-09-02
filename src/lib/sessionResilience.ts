import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

/**
 * Rede corporativa: vários usuários saem pelo mesmo IP. O endpoint de refresh do
 * backend aplica limite por IP e devolve 429, o que faz o SDK derrubar a sessão
 * ("logout automático") e as consultas falharem ("erro ao carregar listas").
 *
 * Aqui guardamos uma cópia da última sessão válida e, quando um SIGNED_OUT não
 * foi pedido pelo usuário, tentamos restaurar a sessão com backoff antes de
 * realmente deslogar.
 */
const BACKUP_KEY = 'cotarme.session.backup';

let userInitiatedSignOut = false;
let recovering = false;

export const markUserSignOut = () => {
  userInitiatedSignOut = true;
  try { localStorage.removeItem(BACKUP_KEY); } catch { /* noop */ }
};

export const saveSessionBackup = (session: Session | null) => {
  if (!session?.refresh_token) return;
  userInitiatedSignOut = false;
  try {
    localStorage.setItem(
      BACKUP_KEY,
      JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
    );
  } catch { /* noop */ }
};

const readBackup = (): { access_token: string; refresh_token: string } | null => {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tenta restaurar a sessão após um SIGNED_OUT inesperado.
 * Retorna true se a sessão foi recuperada.
 */
export const tryRecoverSession = async (): Promise<boolean> => {
  if (userInitiatedSignOut || recovering) return false;
  const backup = readBackup();
  if (!backup) return false;

  recovering = true;
  try {
    for (const delay of [1500, 4000, 10000]) {
      await sleep(delay);
      if (userInitiatedSignOut) return false;
      const { data, error } = await supabase.auth.setSession(backup);
      if (!error && data.session) {
        saveSessionBackup(data.session);
        return true;
      }
      const msg = (error?.message || '').toLowerCase();
      // Token realmente inválido/revogado: não adianta insistir.
      if (msg.includes('invalid') || msg.includes('revoked') || msg.includes('not found')) break;
    }
    try { localStorage.removeItem(BACKUP_KEY); } catch { /* noop */ }
    return false;
  } finally {
    recovering = false;
  }
};

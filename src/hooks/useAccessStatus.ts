import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AccessStatus {
  ativo: boolean;
  admin: boolean;
  aprovado: boolean;
  bloqueado: boolean;
  motivo: string | null;
  expira_em: string | null;
}

export const diasRestantes = (expira: string | null) => {
  if (!expira) return null;
  const ms = new Date(expira).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
};

export const useAccessStatus = () => {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setStatus(null); setLoading(false); return; }
    const { data } = await supabase.rpc('meu_status_acesso' as any);
    setStatus((data as any) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    void refresh();
  }, [authLoading, refresh]);

  return { status, loading, refresh, dias: diasRestantes(status?.expira_em ?? null) };
};

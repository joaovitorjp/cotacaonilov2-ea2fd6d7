import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_ESTADOS } from '@/lib/estados';

/** Estados (UFs) que o usuário cadastrou para trabalhar nas cotações. */
export function useEstadosUsuario() {
  const { user } = useAuth();
  const [estados, setEstados] = useState<string[]>(DEFAULT_ESTADOS);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('estados').eq('user_id', user.id).maybeSingle();
    const list = ((data as any)?.estados as string[] | null) ?? null;
    setEstados(list && list.length > 0 ? list : DEFAULT_ESTADOS);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (next: string[]) => {
    if (!user?.id) return { error: new Error('Sem usuário') } as any;
    const list = [...new Set(next)].filter(Boolean);
    const { error } = await supabase.from('profiles').update({ estados: list } as any).eq('user_id', user.id);
    if (!error) setEstados(list.length ? list : DEFAULT_ESTADOS);
    return { error };
  }, [user?.id]);

  return { estados, setEstados, save, loading, reload: load };
}

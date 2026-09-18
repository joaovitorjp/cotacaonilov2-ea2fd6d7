import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'user';

export const useUserRole = () => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (cancelled) return;
      const roles = (data ?? []).map((r: any) => r.role as AppRole);
      let admin = roles.includes('admin');

      // Fallback: em alguns domínios a leitura direta de user_roles pode falhar
      // (RLS/cache). A RPC de status também informa se o usuário é admin.
      if (!admin) {
        const { data: status } = await supabase.rpc('meu_status_acesso' as any);
        if (cancelled) return;
        admin = (status as any)?.admin === true;
      }

      setRole(admin ? 'admin' : 'user');
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, authLoading]);

  return { role, loading, isAdmin: role === 'admin' };
};

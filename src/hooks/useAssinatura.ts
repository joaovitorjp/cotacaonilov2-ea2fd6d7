import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AssinaturaStatus = 'trial' | 'active' | 'lifetime' | 'past_due' | 'canceled';

export interface Assinatura {
  status: AssinaturaStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

export const useAssinatura = () => {
  const { user, loading: authLoading } = useAuth();
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setAssinatura(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('assinaturas')
      .select('status, trial_ends_at, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();
    setAssinatura((data as Assinatura) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  const trialDaysLeft = assinatura?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(assinatura.trial_ends_at).getTime() - Date.now()) / 864e5))
    : 0;

  const hasAccess =
    assinatura?.status === 'lifetime' ||
    assinatura?.status === 'active' ||
    (assinatura?.status === 'trial' && trialDaysLeft > 0);

  return { assinatura, loading, hasAccess, trialDaysLeft, refresh: load };
};

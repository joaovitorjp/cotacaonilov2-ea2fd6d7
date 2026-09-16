import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_BRAND, getBrand, setBrand, subscribeBrand, type Brand } from '@/lib/branding';

/**
 * Marca exibida no sistema: nome e logo da rede do usuário logado.
 * Sem rede (ou rede sem personalização) volta ao padrão COTARME.
 */
export const useBranding = (): Brand => {
  const { user } = useAuth();
  const [brand, setLocal] = useState<Brand>(getBrand());

  useEffect(() => subscribeBrand(setLocal), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) { setBrand(null); return; }
      const { data: profile } = await supabase
        .from('profiles')
        .select('network_id')
        .eq('user_id', user.id)
        .maybeSingle();
      const networkId = (profile as any)?.network_id as string | null | undefined;
      if (cancelled) return;
      if (!networkId) { setBrand(null); return; }
      const { data: rede } = await supabase
        .from('networks')
        .select('name,display_name,logo_url')
        .eq('id', networkId)
        .maybeSingle();
      if (cancelled) return;
      if (!rede) { setBrand(null); return; }
      setBrand({
        nome: ((rede as any).display_name || (rede as any).name || DEFAULT_BRAND.nome) as string,
        logo: ((rede as any).logo_url || DEFAULT_BRAND.logo) as string,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return brand;
};

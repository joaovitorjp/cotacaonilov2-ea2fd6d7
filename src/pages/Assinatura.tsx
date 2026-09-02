import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAssinatura } from '@/hooks/useAssinatura';
import { getAppOrigin } from '@/lib/oauth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Check, Crown, Infinity, LogOut } from 'lucide-react';
import AetherFlowBackground from '@/components/ui/aether-flow-background';
import adrLogo from '@/assets/adr-logo.jpeg';

const FEATURES = [
  'Cotações ilimitadas com fornecedores',
  'Links de resposta para os estados que você cadastrar',
  'Análise comparativa de preços e exportação em PDF/Excel',
  'Suporte prioritário',
];

const Assinatura = () => {
  const { user, signOut } = useAuth();
  const { assinatura, trialDaysLeft, hasAccess, refresh } = useAssinatura();
  const [loading, setLoading] = useState(false);
  const [plano, setPlano] = useState<'mensal' | 'vitalicio'>('mensal');

  const [syncing, setSyncing] = useState(false);

  const handleSubscribe = async (plano: 'mensal' | 'vitalicio' = 'mensal') => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mp-checkout', {
        body: { origin: window.location.origin, plano },
      });
      if (error || !data?.init_point) {
        throw new Error(data?.error || error?.message || 'Falha ao iniciar checkout');
      }
      window.location.assign(data.init_point);
    } catch (err: any) {
      toast.error(`Erro ao iniciar pagamento: ${err?.message || 'tente novamente'}`);
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('mp-status');
      if (error) throw new Error(error.message);
      await refresh();
      if (data?.status === 'active' || data?.status === 'lifetime') {
        toast.success('Pagamento confirmado! Acesso liberado.');
        setTimeout(() => (window.location.href = '/'), 800);
      } else {
        toast.info('Ainda não identificamos a confirmação do pagamento.');
      }
    } catch (err: any) {
      toast.error(`Não foi possível verificar: ${err?.message || 'tente novamente'}`);
    } finally {
      setSyncing(false);
    }
  };

  const statusLabel: Record<string, string> = {
    trial: `Teste grátis — ${trialDaysLeft} dia(s) restante(s)`,
    active: 'Assinatura ativa',
    lifetime: 'Acesso vitalício',
    past_due: 'Pagamento pendente',
    canceled: 'Assinatura cancelada',
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-background p-4">
      <AetherFlowBackground />
      <div className="relative z-10 w-full max-w-lg mx-auto p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/50 shadow-2xl shadow-primary/5">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3">
            <img src={adrLogo} alt="COTARME" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">COTARME</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {assinatura ? statusLabel[assinatura.status] : 'Assine para continuar'}
          </p>
        </div>

        <div className="grid gap-3 mb-6">
          <button
            type="button"
            onClick={() => setPlano('mensal')}
            className={`text-left rounded-2xl border p-5 transition-colors ${
              plano === 'mensal' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Assinatura mensal</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              R$ 49,99<span className="text-base font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Cobrança recorrente — cancele quando quiser</p>
          </button>

          <button
            type="button"
            onClick={() => setPlano('vitalicio')}
            className={`text-left rounded-2xl border p-5 transition-colors relative ${
              plano === 'vitalicio' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
              Melhor custo
            </span>
            <div className="flex items-center gap-2 mb-1">
              <Infinity className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Licença vitalícia</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              R$ 159,90<span className="text-base font-normal text-muted-foreground"> à vista</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pagamento único por usuário — acesso para sempre</p>
          </button>
        </div>

        {assinatura?.status === 'lifetime' ? (
          <Button className="w-full" onClick={() => (window.location.href = '/')}>
            Acessar o sistema
          </Button>
        ) : (
          <Button className="w-full" onClick={() => void handleSubscribe(plano)} disabled={loading}>
            {loading
              ? 'Abrindo checkout...'
              : plano === 'vitalicio'
                ? 'Comprar acesso vitalício — R$ 159,90'
                : 'Assinar mensal — R$ 49,99/mês'}
          </Button>
        )}

        {hasAccess && assinatura?.status !== 'lifetime' && (
          <Button variant="outline" className="w-full mt-2" onClick={() => (window.location.href = '/')}>
            Continuar com meu período atual
          </Button>
        )}

        {assinatura?.status !== 'lifetime' && (
          <Button variant="ghost" className="w-full mt-2" onClick={() => void handleSync()} disabled={syncing}>
            {syncing ? 'Verificando pagamento...' : 'Já paguei — verificar agora'}
          </Button>
        )}

        <div className="flex items-center justify-between mt-6 text-xs text-muted-foreground">
          <span>{user?.email}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => void signOut()}
          >
            <LogOut className="h-3 w-3" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
};

export default Assinatura;

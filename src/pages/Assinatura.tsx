import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAssinatura } from '@/hooks/useAssinatura';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Check, Crown, LogOut } from 'lucide-react';
import AetherFlowBackground from '@/components/ui/aether-flow-background';
import adrLogo from '@/assets/adr-logo.jpeg.asset.json';

const FEATURES = [
  'Cotações ilimitadas com fornecedores',
  'Links de resposta por estado (MT e GO)',
  'Análise comparativa de preços e exportação em PDF/Excel',
  'Suporte prioritário',
];

const Assinatura = () => {
  const { user, signOut } = useAuth();
  const { assinatura, trialDaysLeft, hasAccess, refresh } = useAssinatura();
  const [loading, setLoading] = useState(false);

  const [syncing, setSyncing] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('mp-checkout', {
        body: { origin: window.location.origin },
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
      <div className="relative z-10 w-full max-w-md mx-auto p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/50 shadow-2xl shadow-primary/5">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3">
            <img src={adrLogo.url} alt="ADR-SYSTEM" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">ADR-SYSTEM</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {assinatura ? statusLabel[assinatura.status] : 'Assine para continuar'}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 mb-6 text-center">
          <Crown className="h-8 w-8 mx-auto text-primary mb-2" />
          <p className="text-4xl font-bold text-foreground">
            R$ 49,99<span className="text-base font-normal text-muted-foreground">/mês</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Cobrança mensal via Mercado Pago — cancele quando quiser</p>
        </div>

        <ul className="space-y-2 mb-6">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>

        {assinatura?.status === 'lifetime' ? (
          <Button className="w-full" onClick={() => (window.location.href = '/')}>
            Acessar o sistema
          </Button>
        ) : (
          <Button className="w-full" onClick={handleSubscribe} disabled={loading}>
            {loading ? 'Abrindo checkout...' : 'Assinar com Mercado Pago'}
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

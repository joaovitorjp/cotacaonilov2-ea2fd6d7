import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssinatura } from '@/hooks/useAssinatura';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Crown, Infinity, KeyRound, LogOut, MessageCircle } from 'lucide-react';
import AetherFlowBackground from '@/components/ui/aether-flow-background';
import adrLogo from '@/assets/adr-logo.jpeg';
import { PRECOS, SUPORTE_WHATSAPP_LABEL, whatsappLink } from '@/lib/chaves';

const Assinatura = () => {
  const { user, signOut } = useAuth();
  const { assinatura, trialDaysLeft, hasAccess, refresh } = useAssinatura();
  const [chave, setChave] = useState('');
  const [ativando, setAtivando] = useState(false);

  const statusLabel: Record<string, string> = {
    trial: `Teste grátis — ${trialDaysLeft} dia(s) restante(s)`,
    active: 'Chave mensal ativa',
    lifetime: 'Chave vitalícia ativa',
    past_due: 'Pagamento pendente',
    canceled: 'Acesso cancelado',
  };

  const handleAtivar = async (e: React.FormEvent) => {
    e.preventDefault();
    const valor = chave.trim();
    if (!valor) {
      toast.error('Informe a chave de acesso.');
      return;
    }
    setAtivando(true);
    const { error } = await supabase.rpc('resgatar_chave', { _chave: valor });
    setAtivando(false);
    if (error) {
      toast.error(error.message.replace(/^.*Chave/, 'Chave') || 'Não foi possível ativar a chave.');
      return;
    }
    toast.success('Chave ativada! Acesso liberado.');
    await refresh();
    setTimeout(() => (window.location.href = '/'), 700);
  };

  const msg = `Olá! Quero solicitar minha chave de acesso do COTARME. Meu e-mail é ${user?.email ?? ''}.`;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden bg-background p-4">
      <AetherFlowBackground />
      <div className="relative z-10 w-full max-w-lg mx-auto p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-white/50 shadow-2xl shadow-primary/5">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3">
            <img src={adrLogo} alt="COTARME" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">COTARME</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {assinatura ? statusLabel[assinatura.status] : 'Ative sua chave para continuar'}
          </p>
        </div>

        <form onSubmit={handleAtivar} className="space-y-3 mb-6">
          <Label htmlFor="chave" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Chave de acesso
          </Label>
          <Input
            id="chave"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="cole aqui sua chave de 64 caracteres"
            className="font-mono text-xs"
            autoComplete="off"
          />
          <Button type="submit" className="w-full" disabled={ativando}>
            {ativando ? 'Ativando...' : 'Ativar chave'}
          </Button>
        </form>

        <div className="grid gap-3 mb-6">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Chave mensal</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {PRECOS.mensal}<span className="text-base font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Acesso liberado por 30 dias a cada renovação</p>
          </div>
          <div className="rounded-2xl border border-primary bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Infinity className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-foreground">Chave vitalícia</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {PRECOS.vitalicio}<span className="text-base font-normal text-muted-foreground"> à vista</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pagamento único — acesso para sempre</p>
          </div>
        </div>

        <a href={whatsappLink(msg)} target="_blank" rel="noopener noreferrer" className="block">
          <Button variant="outline" className="w-full gap-2">
            <MessageCircle className="h-4 w-4" />
            Solicitar chave no WhatsApp {SUPORTE_WHATSAPP_LABEL}
          </Button>
        </a>

        {hasAccess && (
          <Button variant="ghost" className="w-full mt-2" onClick={() => (window.location.href = '/')}>
            Continuar usando o sistema
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

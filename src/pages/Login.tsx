import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { buildExternalGoogleOAuthUrl, isLovableHosted } from '@/lib/oauth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AetherFlowBackground from '@/components/ui/aether-flow-background';
import adrLogo from '@/assets/adr-logo.jpeg.asset.json';
import { Check, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';

const PLAN_FEATURES = [
  'Cotações ilimitadas com fornecedores',
  'Links de resposta por estado (MT e GO)',
  'Análise comparativa e exportação PDF/Excel',
  'Chat global entre a equipe',
  'Controle de estoques e cobertura por loja',
];


const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error');
    if (!oauthError) return;

    toast.error(decodeURIComponent(oauthError));
    navigate('/login', { replace: true });
  }, [navigate, searchParams]);

  const rawNext = searchParams.get('next') || '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';
  const goNext = () => navigate(safeNext || '/');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha email e senha.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error('Credenciais inválidas.');
    } else {
      goNext();
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !nome) {
      toast.error('Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: window.location.origin + (safeNext || ''),
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Teste de 7 dias criado! Confirme seu email para liberar o acesso.');
      setIsSignUp(false);
    }
  };

  return (
    <div className="relative flex items-center justify-center min-h-screen overflow-hidden bg-background p-4 py-10">
      <AetherFlowBackground />
      <div className="relative z-10 w-full max-w-4xl mx-auto grid md:grid-cols-2 gap-6 items-stretch">
        {/* Plano: teste de 7 dias e assinatura */}
        <aside className="order-2 md:order-1 rounded-3xl bg-card/70 backdrop-blur-2xl border border-border/60 shadow-2xl shadow-primary/5 p-8 flex flex-col">
          <div className="inline-flex items-center gap-2 self-start rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            7 dias grátis para novos usuários
          </div>

          <h2 className="mt-4 text-xl font-display font-bold text-foreground tracking-tight">
            Todas as funções, sem limites
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Comece testando gratuitamente. Depois do período de teste, mantenha o acesso com a
            assinatura mensal — cancele quando quiser.
          </p>

          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <p className="text-3xl font-bold text-foreground">
              R$ 49,99
              <span className="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              Cartão, Pix ou boleto via Mercado Pago
            </p>
          </div>

          <ul className="mt-5 space-y-2">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>

          <p className="mt-auto pt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Sem cobrança durante o teste. Nenhum cartão é exigido para começar.
          </p>
        </aside>

        {/* Autenticação */}
        <div className="order-1 md:order-2 rounded-3xl bg-card/80 backdrop-blur-2xl border border-border/60 shadow-2xl shadow-primary/5 p-8">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3">
            <img src={adrLogo.url} alt="ADR-SYSTEM" className="h-14 w-14 rounded-xl object-contain shadow-sm" />
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">
              ADR-SYSTEM
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {isSignUp ? 'Criar conta e iniciar o teste de 7 dias' : 'Entrar na sua conta'}
          </p>
        </div>

        {isSignUp && (
          <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-foreground">
            Seu teste de <strong>7 dias</strong> começa assim que a conta for criada. Ao final,
            você escolhe assinar por <strong>R$ 49,99/mês</strong> para continuar.
          </div>
        )}


        <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemplo.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? isSignUp ? 'Criando conta...' : 'Entrando...'
              : isSignUp ? 'Começar teste de 7 dias' : 'Entrar'}
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading || googleLoading}
          onClick={async () => {
            setGoogleLoading(true);
            try {
              if (!isLovableHosted()) {
                window.location.assign(buildExternalGoogleOAuthUrl());
                return;
              }

              const result = await lovable.auth.signInWithOAuth('google', {
                redirect_uri: window.location.origin + (safeNext || ''),
              });
              if (result.error) {
                const msg = (result.error.message || '').toLowerCase();
                if (msg.includes('cancel') || msg.includes('closed') || msg.includes('popup') || msg.includes('denied') || msg.includes('abort')) {
                  toast.error('Login com Google cancelado.');
                } else if (msg.includes('network') || msg.includes('fetch')) {
                  toast.error('Erro de conexão. Verifique sua internet e tente novamente.');
                } else if (msg.includes('unsupported provider') || msg.includes('provider')) {
                  toast.error('Provedor Google não está configurado. Contate o administrador.');
                } else {
                  toast.error(`Falha ao entrar com Google: ${result.error.message || 'erro desconhecido'}`);
                }
                setGoogleLoading(false);
                return;
              }
              if (result.redirected) return;
              goNext();
            } catch (err: any) {
              toast.error(`Erro inesperado: ${err?.message || 'tente novamente'}`);
              setGoogleLoading(false);
            }
          }}
        >
          {googleLoading ? (
            <>
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Conectando ao Google...
            </>
          ) : (
            <>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Entrar com Google
            </>
          )}
        </Button>

        <div className="text-center mt-4">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Já tem acesso? Entrar' : 'Criar conta e testar 7 dias grátis'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
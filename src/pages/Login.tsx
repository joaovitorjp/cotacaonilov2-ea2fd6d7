import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { getAppOrigin, rememberPostLogin } from '@/lib/oauth';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import adrLogo from '@/assets/adr-logo.jpeg';
import shotCotacoesFinalizadas from '@/assets/tablet-cotacoes-finalizadas.png';
import shotPlanilha from '@/assets/shot-planilha.png';
import shotFornecedores from '@/assets/shot-fornecedores.png';
import { Check, CreditCard, Crown, Infinity as InfinityIcon, ShieldCheck } from 'lucide-react';

const PLAN_FEATURES = [
  'Cotações ilimitadas com fornecedores',
  'Links de resposta por estado',
  'Análise comparativa e exportação PDF/Excel',
];

const DeviceMockups = () => (
  <div className="relative w-full max-w-xl mx-auto select-none" aria-hidden>
    {/* Laptop */}
    <div className="relative mx-auto w-[88%] rounded-t-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/60">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
      </div>
      <div className="aspect-[16/10] bg-white">
        <img src={shotPlanilha} alt="Planilha comparativa de preços" className="h-full w-full object-cover object-top" />
      </div>
    </div>
    <div className="mx-auto h-3 w-[96%] rounded-b-xl bg-muted border border-border" />
    {/* Tablet */}
    <div className="absolute -left-2 bottom-2 w-[34%] rounded-2xl border border-border bg-card shadow-xl shadow-primary/10 overflow-hidden">
      <div className="aspect-[3/4] bg-white">
        <img src={shotCotacoesFinalizadas} alt="Cotações finalizadas no COTARME" className="h-full w-full object-cover object-top" />
      </div>
    </div>
    {/* Phone */}
    <div className="absolute -right-1 bottom-6 w-[20%] rounded-2xl border border-border bg-card shadow-xl shadow-primary/10 overflow-hidden">
      <div className="aspect-[9/18] bg-white">
        <img src={shotFornecedores} alt="Cadastro de fornecedores" className="h-full w-full object-cover object-top" />
      </div>
    </div>
  </div>
);

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [planoEscolhido, setPlanoEscolhido] = useState<'trial' | 'mensal' | 'vitalicio'>('trial');
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recovering, setRecovering] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    const oauthError = searchParams.get('oauth_error');
    if (!oauthError) return;
    toast.error(decodeURIComponent(oauthError));
    navigate('/login', { replace: true });
  }, [navigate, searchParams]);

  const rawNext = searchParams.get('next') || '';
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';
  const goNext = () => {
    if (planoEscolhido !== 'trial') {
      navigate(`/assinatura?plano=${planoEscolhido}`);
      return;
    }
    navigate(safeNext || '/');
  };

  // Usuário já autenticado não deve ver a landing de login
  useEffect(() => {
    if (!authLoading && user) {
      navigate(safeNext || '/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, safeNext]);

  const openAuth = (signUp: boolean, plano: 'trial' | 'mensal' | 'vitalicio' = 'trial') => {
    setIsSignUp(signUp);
    setPlanoEscolhido(plano);
    setAuthOpen(true);
  };

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
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('not confirmed')) {
        toast.error('Confirme seu email antes de entrar. Verifique sua caixa de entrada.');
      } else if (msg.includes('invalid login')) {
        toast.error('Email ou senha incorretos.');
      } else {
        toast.error(error.message || 'Não foi possível entrar.');
      }
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome },
        emailRedirectTo: `${getAppOrigin()}/`,
      },
    });
    setLoading(false);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already')) {
        toast.error('Este email já possui conta. Faça login.');
        setIsSignUp(false);
      } else {
        toast.error(error.message);
      }
      return;
    }

    // Auto-confirmação ativa: já existe sessão, segue direto
    if (data.session) {
      toast.success('Conta criada com sucesso!');
      goNext();
      return;
    }

    toast.success(
      planoEscolhido === 'trial'
        ? 'Teste de 7 dias criado! Confirme seu email para liberar o acesso.'
        : 'Conta criada! Confirme seu email e entre para concluir o pagamento.'
    );
    setPassword('');
    setIsSignUp(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    rememberPostLogin(safeNext, planoEscolhido);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: `${getAppOrigin()}/auth/callback`,
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
      // Fluxo com redirecionamento de página inteira: o retorno acontece em /auth/callback
      if (result.redirected) return;
      goNext();
    } catch (err: any) {
      toast.error(`Erro inesperado: ${err?.message || 'tente novamente'}`);
      setGoogleLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = recoverEmail.trim();
    if (!target) {
      toast.error('Informe seu email.');
      return;
    }
    setRecovering(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${getAppOrigin()}/reset-password`,
    });
    setRecovering(false);
    if (error) {
      toast.error(error.message || 'Não foi possível enviar o email.');
      return;
    }
    toast.success('Enviamos um link de redefinição para seu email.');
    setRecoverOpen(false);
  };

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <img src={adrLogo} alt="COTARME" className="h-9 w-9 rounded-lg object-contain bg-white p-0.5 shadow-sm border border-border/60" />
            <span className="font-display text-xl font-bold tracking-tight">COTARME</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <button onClick={() => scrollTo('home')} className="hover:text-foreground transition-colors">Home</button>
            <button onClick={() => scrollTo('funcionalidades')} className="hover:text-foreground transition-colors">Funcionalidades</button>
            <button onClick={() => scrollTo('planos')} className="hover:text-foreground transition-colors">Planos</button>
          </nav>
          <Button onClick={() => openAuth(false)} className="px-6">Login</Button>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="relative">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 pt-16 pb-24 md:grid-cols-2 md:items-center md:pt-24">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              7 dias grátis para novos usuários
            </div>
            <h1 className="mt-6 font-display text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight text-primary-deep" style={{ color: 'hsl(var(--primary-deep))' }}>
              A forma mais rápida de cotar com seus fornecedores.
            </h1>
            <p className="mt-5 max-w-md text-base sm:text-lg text-muted-foreground leading-relaxed">
              Importe sua lista, envie links de cotação por estado, compare preços em tempo real
              e feche a melhor compra — tudo em uma única plataforma 100% web.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="px-7 font-semibold uppercase tracking-wide" onClick={() => openAuth(true)}>
                Teste por 7 dias grátis
              </Button>
              <Button size="lg" variant="outline" className="px-7 font-semibold uppercase tracking-wide" onClick={() => scrollTo('planos')}>
                Ver planos
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sem cobrança durante o teste. Nenhum cartão é exigido para começar.
            </p>
          </div>

          <div className="animate-in fade-in slide-in-from-right-4 duration-700">
            <DeviceMockups />
          </div>
        </div>

        {/* Onda inferior */}
        <svg viewBox="0 0 1440 120" className="block w-full text-card" preserveAspectRatio="none" aria-hidden>
          <path d="M0,64 C360,120 1080,0 1440,64 L1440,120 L0,120 Z" fill="currentColor" />
        </svg>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="bg-card py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Tudo que a sua compra precisa</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-5 text-sm">
                <span className="mt-0.5 rounded-md bg-primary/10 p-1 shrink-0">
                  <Check className="h-4 w-4 text-primary" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="bg-card pb-24 pt-4">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Planos</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Todas as funções, sem limites. Comece testando gratuitamente e escolha depois.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background p-7">
              <div className="flex items-center gap-2 text-primary">
                <Crown className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">Assinatura mensal</span>
              </div>
              <p className="mt-4 text-4xl font-bold">
                R$ 49,99
                <span className="text-base font-normal text-muted-foreground">/mês</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Cancele quando quiser</p>
              <Button className="mt-6 w-full" onClick={() => openAuth(true, 'mensal')}>Assinar agora</Button>
            </div>
            <div className="relative rounded-3xl border-2 border-primary bg-background p-7">
              <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">
                Melhor custo
              </span>
              <div className="flex items-center gap-2 text-primary">
                <InfinityIcon className="h-5 w-5" />
                <span className="text-sm font-semibold uppercase tracking-wide">Licença vitalícia</span>
              </div>
              <p className="mt-4 text-4xl font-bold">
                R$ 159,90
                <span className="text-base font-normal text-muted-foreground"> à vista</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Pagamento único por usuário</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" />
                Cartão, Pix ou boleto via Mercado Pago
              </p>
              <Button className="mt-6 w-full" onClick={() => openAuth(true, 'vitalicio')}>Comprar acesso vitalício</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={adrLogo} alt="COTARME" className="h-6 w-6 rounded object-contain" />
            <span className="font-display font-bold text-foreground">COTARME</span>
          </div>
          <span>© {new Date().getFullYear()} COTARME. Todos os direitos reservados.</span>
        </div>
      </footer>

      {/* Diálogo de autenticação */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {isSignUp ? 'Criar sua conta' : 'Bem-vindo de volta'}
            </DialogTitle>
            <DialogDescription>
              {isSignUp
                ? planoEscolhido === 'trial'
                  ? 'Cadastre-se e inicie o teste de 7 dias grátis'
                  : 'Cadastre-se e conclua o pagamento para liberar o acesso'
                : 'Acesse sua conta para gerenciar suas cotações'}
            </DialogDescription>
          </DialogHeader>

          {isSignUp && (
            <div className="space-y-2">
              <Label>Como você quer começar?</Label>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setPlanoEscolhido('trial')}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    planoEscolhido === 'trial' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="text-sm font-semibold">Teste de 7 dias grátis</span>
                  <span className="block text-xs text-muted-foreground">Sem cobrança — escolha um plano ao final</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanoEscolhido('mensal')}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    planoEscolhido === 'mensal' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="text-sm font-semibold">Assinatura mensal — R$ 49,99/mês</span>
                  <span className="block text-xs text-muted-foreground">Pague agora e comece a usar imediatamente</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanoEscolhido('vitalicio')}
                  className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                    planoEscolhido === 'vitalicio' ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="text-sm font-semibold">Licença vitalícia — R$ 159,90 à vista</span>
                  <span className="block text-xs text-muted-foreground">Pagamento único, acesso para sempre</span>
                </button>
              </div>
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
                : isSignUp
                  ? planoEscolhido === 'trial' ? 'Começar teste de 7 dias'
                    : planoEscolhido === 'mensal' ? 'Criar conta e assinar' : 'Criar conta e comprar'
                  : planoEscolhido === 'trial' ? 'Entrar' : 'Entrar e pagar'}
            </Button>
          </form>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading || googleLoading}
            onClick={handleGoogle}
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

          <div className="text-center space-y-2">
            {!isSignUp && (
              <button
                type="button"
                className="block w-full text-sm text-muted-foreground hover:text-foreground underline transition-colors"
                onClick={() => {
                  setRecoverEmail(email);
                  setAuthOpen(false);
                  setRecoverOpen(true);
                }}
              >
                Esqueci minha senha
              </button>
            )}
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline transition-colors"
              onClick={() => setIsSignUp(!isSignUp)}
            >
              {isSignUp ? 'Já tem acesso? Entrar' : 'Criar conta e testar 7 dias grátis'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recuperação de senha */}
      <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Recuperar senha</DialogTitle>
            <DialogDescription>
              Informe seu email e enviaremos um link para criar uma nova senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recover-email">Email</Label>
              <Input
                id="recover-email"
                type="email"
                autoComplete="email"
                value={recoverEmail}
                onChange={e => setRecoverEmail(e.target.value)}
                placeholder="voce@empresa.com.br"
              />
            </div>
            <Button type="submit" className="w-full" disabled={recovering}>
              {recovering ? 'Enviando...' : 'Enviar link de redefinição'}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground underline transition-colors"
              onClick={() => { setRecoverOpen(false); setAuthOpen(true); }}
            >
              Voltar ao login
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;

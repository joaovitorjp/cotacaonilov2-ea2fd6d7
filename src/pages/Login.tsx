import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAppOrigin } from '@/lib/oauth';
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
import { Check, ShieldCheck } from 'lucide-react';


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
  
  const [authOpen, setAuthOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  
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
  const goNext = () => navigate(safeNext || '/');

  // Usuário já autenticado não deve ver a landing de login
  useEffect(() => {
    if (!authLoading && user) {
      navigate(safeNext || '/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, safeNext]);


  const openAuth = (signUp: boolean) => {
    setIsSignUp(signUp);
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

    toast.success('Conta criada! Confirme seu email para liberar o acesso.');
    setPassword('');
    setIsSignUp(false);
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
              Plataforma 100% gratuita
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
                Criar conta grátis
              </Button>
              <Button size="lg" variant="outline" className="px-7 font-semibold uppercase tracking-wide" onClick={() => scrollTo('funcionalidades')}>
                Ver funcionalidades
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Sem cobranças. Nenhum cartão é exigido.
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
                ? 'Cadastre-se gratuitamente e comece a cotar'
                : 'Acesse sua conta para gerenciar suas cotações'}
            </DialogDescription>
          </DialogHeader>



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
                : isSignUp ? 'Criar conta grátis' : 'Entrar'}
            </Button>

          </form>




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

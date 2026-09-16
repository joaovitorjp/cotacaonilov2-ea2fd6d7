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
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useNavigate, useSearchParams } from 'react-router-dom';
import adrLogo from '@/assets/adr-logo.jpeg';
import shotCotacoesFinalizadas from '@/assets/tablet-cotacoes-finalizadas.png';
import shotPlanilha from '@/assets/shot-planilha.png';
import shotFornecedores from '@/assets/shot-fornecedores.png';
import {
  Check, ShieldCheck, Star, MessageCircle, FileSpreadsheet, Link2, BarChart3,
  Clock, Users, FileDown,
} from 'lucide-react';

const WHATSAPP_SUPORTE = '5566984640346';
const DESCONTO_PERCENT = 50;

const PLAN_FEATURES = [
  { icon: FileSpreadsheet, titulo: 'Importe sua lista em segundos', texto: 'Suba a planilha de produtos e monte a cotação sem digitar item por item.' },
  { icon: Link2, titulo: 'Links de cotação por estado', texto: 'Cada fornecedor recebe um link próprio e responde os preços por estado definido.' },
  { icon: BarChart3, titulo: 'Comparação automática', texto: 'O menor preço é destacado na hora, com o segundo colocado sinalizado para negociar.' },
  { icon: Clock, titulo: 'Prazos e respostas em tempo real', texto: 'Defina o prazo, acompanhe quem respondeu e veja data e hora de cada resposta.' },
  { icon: Users, titulo: 'Cadastro de fornecedores', texto: 'Contatos organizados com WhatsApp para enviar a cotação em poucos cliques.' },
  { icon: FileDown, titulo: 'Relatórios em PDF e Excel', texto: 'Exporte o comparativo, o mapa de vencedores e os arquivos de pedido por estado.' },
];

const PASSOS = [
  { titulo: 'Monte a cotação', texto: 'Importe a planilha ou crie a lista direto no sistema, com código, descrição e observações.' },
  { titulo: 'Envie para os fornecedores', texto: 'Gere os links em massa e dispare pelo WhatsApp. O fornecedor responde pelo navegador, sem instalar nada.' },
  { titulo: 'Compare e negocie', texto: 'Veja todos os preços lado a lado, aplique acréscimos, cubra concorrentes e acompanhe o histórico das cotações anteriores.' },
  { titulo: 'Feche a compra', texto: 'Exporte o resultado, guarde a cotação finalizada e use os relatórios para justificar cada decisão.' },
];

const BENEFICIOS = [
  'Economia real: você enxerga o menor preço de cada item em vez de olhar planilha por planilha.',
  'Menos tempo no telefone e no grupo de WhatsApp para juntar preços.',
  'Histórico completo das cotações para comparar com as compras anteriores.',
  'Vários compradores na mesma empresa, cada um com seus dados organizados.',
  'Sua marca no sistema, nos relatórios e nas páginas que o fornecedor abre.',
  'Funciona no computador, tablet e celular, sem instalação.',
];

const DEPOIMENTOS = [
  { nome: 'Marcelo Andrade', cargo: 'Comprador — rede de supermercados', texto: 'Antes eu levava dois dias juntando preço no WhatsApp. Hoje mando os links de manhã e à tarde já estou fechando a compra.' },
  { nome: 'Patrícia Lima', cargo: 'Gerente de compras', texto: 'A comparação automática mostrou diferenças que passavam batido. Só no primeiro mês a economia pagou o sistema várias vezes.' },
  { nome: 'Rafael Nunes', cargo: 'Sócio — atacado de alimentos', texto: 'Os fornecedores adoraram: eles abrem o link, preenchem e pronto. Não precisa mais mandar planilha para ninguém.' },
];

const PLANO_ITENS = [
  'Cotações e fornecedores ilimitados',
  'Links de resposta por estado',
  'Comparativo de preços e histórico',
  'Exportação em PDF e Excel',
  'Acesso em qualquer dispositivo',
];

const DeviceMockups = () => (
  <div className="relative w-full max-w-xl mx-auto select-none" aria-hidden>
    {/* Notebook */}
    <div className="relative mx-auto w-[88%] z-10">
      <div className="relative w-full rounded-t-2xl bg-gradient-to-b from-slate-700 to-slate-800 p-2.5 pb-0 shadow-2xl ring-1 ring-slate-900/20">
        {/* Câmera */}
        <div className="absolute top-1 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-slate-600 ring-1 ring-slate-900/40" />
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-white">
          <img src={shotPlanilha} alt="Planilha comparativa de preços" className="h-full w-full object-cover object-top" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/20" />
        </div>
      </div>
      {/* Base do teclado */}
      <div className="relative -left-[4%] h-4 w-[108%] rounded-b-xl border-t border-slate-500/60 bg-gradient-to-b from-slate-600 to-slate-700 shadow-xl">
        <div className="absolute top-0 left-1/2 h-1 w-20 -translate-x-1/2 rounded-b-lg bg-slate-800" />
      </div>
    </div>

    {/* Tablet */}
    <div className="absolute -left-6 top-[22%] z-20 w-[34%]">
      <div className="relative w-full rounded-[2rem] bg-gradient-to-b from-slate-800 to-slate-900 p-2.5 shadow-2xl ring-1 ring-white/20">
        <div className="absolute top-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-700" />
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[1.4rem] bg-white">
          <img src={shotCotacoesFinalizadas} alt="Cotações finalizadas no COTARME" className="h-full w-full object-cover object-top" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        </div>
      </div>
    </div>

    {/* Celular */}
    <div className="absolute -right-4 bottom-[8%] z-30 w-[20%]">
      <div className="relative w-full rounded-[1.75rem] bg-gradient-to-b from-slate-800 to-slate-950 p-1.5 shadow-2xl ring-1 ring-white/20">
        {/* Dynamic island */}
        <div className="absolute top-2.5 left-1/2 z-10 h-2.5 w-8 -translate-x-1/2 rounded-full bg-black" />
        {/* Botões laterais */}
        <div className="absolute -left-0.5 top-10 h-5 w-0.5 rounded-r-sm bg-slate-700" />
        <div className="absolute -left-0.5 top-[4.5rem] h-8 w-0.5 rounded-r-sm bg-slate-700" />
        <div className="relative aspect-[9/18] w-full overflow-hidden rounded-[1.35rem] bg-white">
          <img src={shotFornecedores} alt="Cadastro de fornecedores" className="h-full w-full object-cover object-top" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        </div>
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
      const { data: status } = await supabase.rpc('meu_status_acesso' as any);
      const st = status as any;
      if (st && st.ativo === false) {
        toast.error(
          st.aprovado === false
            ? 'Sua conta ainda não foi liberada pelo administrador.'
            : st.bloqueado
              ? `Acesso bloqueado.${st.motivo ? ' Motivo: ' + st.motivo : ''} Fale com o administrador.`
              : 'Seu prazo de acesso expirou. Fale com o administrador.'
        );
      }
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

    toast.success('Conta criada! O acesso de 7 dias será liberado pelo administrador.');
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

  const ativarPlano = (plano: string) => {
    const texto = plano
      ? `Olá! Quero ativar o plano ${plano} do COTARME.`
      : 'Olá! Gostaria de saber mais sobre os planos do COTARME.';
    window.open(`https://wa.me/${WHATSAPP_SUPORTE}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  };

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
            <button onClick={() => scrollTo('sobre')} className="hover:text-foreground transition-colors">Como funciona</button>
            <button onClick={() => scrollTo('depoimentos')} className="hover:text-foreground transition-colors">Depoimentos</button>
            <button onClick={() => scrollTo('planos')} className="hover:text-foreground transition-colors">Planos</button>
            
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button onClick={() => openAuth(false)} className="px-6">Login</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="home" className="relative">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 pt-16 pb-24 md:grid-cols-2 md:items-center md:pt-24">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              7 dias de teste ao criar sua conta
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
                Criar conta
              </Button>
              <Button size="lg" variant="outline" className="px-7 font-semibold uppercase tracking-wide" onClick={() => scrollTo('funcionalidades')}>
                Ver funcionalidades
              </Button>
            </div>
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              O acesso é liberado pelo administrador após o cadastro.
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
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Do envio da lista até a decisão de compra: o COTARME organiza a cotação inteira em um só lugar,
            com comparação automática de preços e histórico de negociação.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLAN_FEATURES.map((f) => (
              <li key={f.titulo} className="rounded-2xl border border-border bg-background p-5">
                <span className="inline-flex rounded-xl bg-primary/10 p-2 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-display text-base font-bold">{f.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Como funciona / benefícios */}
      <section id="sobre" className="py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Como o COTARME funciona</h2>
            <ol className="mt-6 space-y-5">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-base font-bold">{p.titulo}</h3>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
            <h3 className="font-display text-xl font-bold tracking-tight">O que você ganha</h3>
            <ul className="mt-5 space-y-3">
              {BENEFICIOS.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 rounded-md bg-primary/10 p-1 shrink-0">
                    <Check className="h-4 w-4 text-primary" />
                  </span>
                  <span className="text-muted-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section id="depoimentos" className="bg-card py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Quem usa, aprova</h2>
          <p className="mt-3 text-sm text-muted-foreground">Compradores e gestores que trocaram a planilha solta pelo COTARME.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {DEPOIMENTOS.map((d) => (
              <figure key={d.nome} className="rounded-2xl border border-border bg-background p-6">
                <div className="flex gap-0.5 text-primary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <blockquote className="mt-4 text-sm leading-relaxed text-muted-foreground">"{d.texto}"</blockquote>
                <figcaption className="mt-4 text-xs font-semibold">
                  {d.nome}
                  <span className="block font-normal text-muted-foreground">{d.cargo}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">Planos</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Teste por 7 dias ao criar sua conta. Depois escolha o plano que combina com o seu ritmo de compra.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {/* Mensal */}
            <div className="rounded-3xl border border-border bg-card p-7">
              <h3 className="font-display text-lg font-bold">Plano Mensal</h3>
              <p className="mt-1 text-sm text-muted-foreground">Flexível, renovação todo mês.</p>
              <p className="mt-5 font-display text-4xl font-bold tracking-tight">
                R$ 49,99<span className="text-base font-medium text-muted-foreground">/mês</span>
              </p>
              <ul className="mt-6 space-y-2.5">
                {PLANO_ITENS.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {i}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-7 w-full font-semibold uppercase tracking-wide" onClick={() => ativarPlano('Mensal (R$ 49,99/mês)')}>
                Ativar plano mensal
              </Button>
            </div>

            {/* Anual */}
            <div className="relative rounded-3xl border-2 border-primary bg-card p-7 shadow-lg">
              <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
                Economize {DESCONTO_PERCENT}%
              </span>
              <h3 className="font-display text-lg font-bold">Plano Anual</h3>
              <p className="mt-1 text-sm text-muted-foreground">Pague uma vez e use o ano inteiro.</p>
              <p className="mt-5 font-display text-4xl font-bold tracking-tight">
                R$ 299,99<span className="text-base font-medium text-muted-foreground">/ano</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="line-through">R$ 599,88</span> — equivale a R$ 25,00 por mês. Você economiza R$ 299,89 no ano.
              </p>
              <ul className="mt-6 space-y-2.5">
                {PLANO_ITENS.map((i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {i}
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Suporte prioritário no WhatsApp
                </li>
              </ul>
              <Button className="mt-7 w-full font-semibold uppercase tracking-wide" onClick={() => ativarPlano('Anual (R$ 299,99/ano)')}>
                Ativar plano anual
              </Button>
            </div>
          </div>

          {/* Suporte */}
          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-display text-base font-bold">Ativação e suporte pelo WhatsApp</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fale com a nossa equipe no (66) 98464-0346 para ativar o plano escolhido e liberar o acesso.
              </p>
            </div>
            <Button variant="outline" className="shrink-0 font-semibold" onClick={() => ativarPlano('')}>
              <MessageCircle className="mr-2 h-4 w-4" /> Falar no WhatsApp
            </Button>
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
                ? 'Cadastre-se e teste o sistema por 7 dias'
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
                : isSignUp ? 'Criar conta' : 'Entrar'}
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
              {isSignUp ? 'Já tem acesso? Entrar' : 'Criar conta e testar por 7 dias'}
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

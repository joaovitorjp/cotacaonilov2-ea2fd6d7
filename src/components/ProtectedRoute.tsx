import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const Loading = () => (
  <div className="flex items-center justify-center h-screen">
    <p className="text-muted-foreground">Carregando...</p>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  // Antes de mandar de volta ao login, confirma direto no cliente se existe sessão.
  // No preview o storage é assíncrono e o contexto pode ainda estar vazio.
  const [recheck, setRecheck] = useState<'idle' | 'checking' | 'none'>('idle');

  useEffect(() => {
    if (loading || user) {
      setRecheck('idle');
      return;
    }
    let cancelled = false;
    setRecheck('checking');
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setRecheck(data.session ? 'idle' : 'none');
    });
    return () => { cancelled = true; };
  }, [loading, user]);

  // Bloqueio / prazo / liberação definidos no painel admin.
  const [status, setStatus] = useState<any>(undefined);
  useEffect(() => {
    if (!user) { setStatus(undefined); return; }
    let cancelled = false;
    supabase.rpc('meu_status_acesso' as any).then(({ data }) => {
      if (cancelled) return;
      setStatus(data ?? null);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (loading) return <Loading />;

  if (!user) {
    if (recheck !== 'none') return <Loading />;
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (status && status.ativo === false) {
    const pendente = status.aprovado === false;
    const expira = status.expira_em ? new Date(status.expira_em).toLocaleDateString('pt-BR') : null;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-display text-xl font-bold text-slate-900">
            {pendente ? 'Conta aguardando liberação' : status.bloqueado ? 'Acesso bloqueado' : 'Prazo de acesso encerrado'}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {pendente
              ? 'Sua conta de teste de 7 dias foi criada. As funções serão liberadas assim que o administrador ativar o seu acesso.'
              : status.bloqueado
                ? `Fale com o administrador para reativar.${status.motivo ? ' Motivo: ' + status.motivo : ''}`
                : `Seu período de uso terminou${expira ? ` em ${expira}` : ''}. Fale com o administrador para renovar.`}
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;

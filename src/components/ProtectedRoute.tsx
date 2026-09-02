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

  if (loading) return <Loading />;

  if (!user) {
    if (recheck !== 'none') return <Loading />;
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

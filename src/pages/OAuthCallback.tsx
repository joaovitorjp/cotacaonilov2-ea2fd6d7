import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  buildForwardUrl,
  consumePostLoginTarget,
  isAllowedOAuthForwardTarget,
  OAUTH_STATE_STORAGE_KEY,
  readOAuthParams,
} from '@/lib/oauth';

const OAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const finishLogin = async () => {
      const params = readOAuthParams();
      const next = params.get('next');

      if (next) {
        if (isAllowedOAuthForwardTarget(next)) {
          window.location.replace(buildForwardUrl(next, params));
          return;
        }

        navigate('/login?oauth_error=Destino%20de%20login%20nao%20permitido', { replace: true });
        return;
      }

      const error = params.get('error') || params.get('error_description');
      if (error) {
        navigate(`/login?oauth_error=${encodeURIComponent(error)}`, { replace: true });
        return;
      }

      const expectedState = sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
      const returnedState = params.get('state');
      if (expectedState && returnedState && expectedState !== returnedState) {
        sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
        navigate('/login?oauth_error=Validacao%20do%20login%20falhou', { replace: true });
        return;
      }

      // Fluxo PKCE nativo do Supabase (?code=...)
      const code = params.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
        if (exchangeError) {
          const { data: existing } = await supabase.auth.getSession();
          if (!existing.session) {
            navigate(`/login?oauth_error=${encodeURIComponent(exchangeError.message)}`, { replace: true });
            return;
          }
        }
        navigate(consumePostLoginTarget(), { replace: true });
        return;
      }

      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');


      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);

        if (sessionError) {
          navigate(`/login?oauth_error=${encodeURIComponent(sessionError.message)}`, { replace: true });
          return;
        }

        navigate(consumePostLoginTarget(), { replace: true });
        return;
      }

      const { data } = await supabase.auth.getSession();
      navigate(
        data.session ? consumePostLoginTarget() : '/login?oauth_error=Login%20nao%20foi%20concluido',
        { replace: true }
      );
    };

    void finishLogin();
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold text-foreground">Concluindo login</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aguarde enquanto validamos seu acesso.</p>
      </div>
    </main>
  );
};

export default OAuthCallback;
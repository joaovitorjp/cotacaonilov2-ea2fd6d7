const LOVABLE_PROJECT_ID = '9333e97f-3e48-4994-8e42-a35466d60151';
const LOVABLE_OAUTH_BROKER_URL = 'https://oauth.lovable.app/initiate';
const LOVABLE_OAUTH_BRIDGE_ORIGIN = 'https://cotarme.lovable.app';
export const APP_ORIGIN = 'https://cotarme.com';
const PRODUCTION_ORIGINS = [
  'https://nilo-cotacao.netlify.app',
  APP_ORIGIN,
  'https://www.cotarme.com',
];

export const getAppOrigin = () => {
  const hostname = window.location.hostname;
  if (hostname === 'cotarme.com' || hostname === 'www.cotarme.com') {
    return APP_ORIGIN;
  }
  return window.location.origin;
};

export const OAUTH_STATE_STORAGE_KEY = 'nilo_google_oauth_state';

const createState = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

export const isLovableHosted = () => {
  const hostname = window.location.hostname;
  return hostname.endsWith('.lovable.app') || hostname.endsWith('.lovableproject.com');
};

export const buildExternalGoogleOAuthUrl = (stateOverride?: string) => {
  const state = stateOverride || createState();
  sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);

  const finalCallbackUrl = new URL('/auth/callback', getAppOrigin());
  const bridgeCallbackUrl = new URL('/auth/callback', LOVABLE_OAUTH_BRIDGE_ORIGIN);
  bridgeCallbackUrl.searchParams.set('next', finalCallbackUrl.toString());

  const params = new URLSearchParams({
    project_id: LOVABLE_PROJECT_ID,
    provider: 'google',
    redirect_uri: bridgeCallbackUrl.toString(),
    state,
  });

  return `${LOVABLE_OAUTH_BROKER_URL}?${params.toString()}`;
};

export const readOAuthParams = () => {
  const merged = new URLSearchParams(window.location.search);
  const rawHash = window.location.hash.replace(/^#/, '');
  const hashQuery = rawHash.includes('?') ? rawHash.split('?').pop() || '' : rawHash;

  if (hashQuery) {
    new URLSearchParams(hashQuery).forEach((value, key) => merged.set(key, value));
  }

  return merged;
};

export const isAllowedOAuthForwardTarget = (target: string) => {
  try {
    const url = new URL(target);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;

    const allowedOrigins = [
      ...PRODUCTION_ORIGINS,
      LOVABLE_OAUTH_BRIDGE_ORIGIN,
      window.location.origin,
    ];
    if (allowedOrigins.includes(url.origin)) return true;

    // Ambientes de preview/deploy confiáveis
    return (
      url.hostname.endsWith('.lovable.app') ||
      url.hostname.endsWith('.lovableproject.com') ||
      url.hostname.endsWith('.netlify.app')
    );
  } catch {
    return false;
  }
};

export const buildForwardUrl = (target: string, params: URLSearchParams) => {
  const url = new URL(target);
  const forwardParams = new URLSearchParams();

  params.forEach((value, key) => {
    if (key !== 'next') forwardParams.set(key, value);
  });

  url.hash = forwardParams.toString();
  return url.toString();
};
// Destino e plano escolhidos antes de sair para o provedor OAuth.
export const POST_LOGIN_NEXT_KEY = 'cotarme_post_login_next';
export const POST_LOGIN_PLAN_KEY = 'cotarme_post_login_plan';

export const rememberPostLogin = (next: string, plano: string) => {
  try {
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      sessionStorage.setItem(POST_LOGIN_NEXT_KEY, next);
    } else {
      sessionStorage.removeItem(POST_LOGIN_NEXT_KEY);
    }
    if (plano && plano !== 'trial') {
      sessionStorage.setItem(POST_LOGIN_PLAN_KEY, plano);
    } else {
      sessionStorage.removeItem(POST_LOGIN_PLAN_KEY);
    }
  } catch {
    /* sessionStorage indisponível */
  }
};

export const consumePostLoginTarget = () => {
  let next = '';
  let plano = '';
  try {
    next = sessionStorage.getItem(POST_LOGIN_NEXT_KEY) || '';
    plano = sessionStorage.getItem(POST_LOGIN_PLAN_KEY) || '';
    sessionStorage.removeItem(POST_LOGIN_NEXT_KEY);
    sessionStorage.removeItem(POST_LOGIN_PLAN_KEY);
  } catch {
    /* ignora */
  }
  if (plano === 'mensal' || plano === 'vitalicio') return `/assinatura?plano=${plano}`;
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
};

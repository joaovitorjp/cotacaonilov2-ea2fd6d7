ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Usuários já existentes continuam liberados
UPDATE public.profiles SET approved_at = COALESCE(approved_at, created_at, now()) WHERE approved_at IS NULL;

-- Novo usuário: 7 dias de teste, pendente de liberação do admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_admin boolean := lower(NEW.email) = 'adriantmj49@gmail.com';
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, access_expires_at, approved_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', ''),
    now() + interval '7 days',
    CASE WHEN _is_admin THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'user'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.networks n ON n.id = p.network_id
      WHERE p.user_id = _user_id
        AND p.approved_at IS NOT NULL
        AND p.blocked_at IS NULL
        AND n.blocked_at IS NULL
        AND COALESCE(p.access_expires_at, n.access_expires_at, 'infinity'::timestamptz) >= now()
    )
  END
$function$;

CREATE OR REPLACE FUNCTION public.meu_status_acesso()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ativo', public.is_user_active(auth.uid()),
    'admin', public.has_role(auth.uid(), 'admin'),
    'aprovado', (p.approved_at IS NOT NULL OR public.has_role(auth.uid(), 'admin')),
    'bloqueado', (p.blocked_at IS NOT NULL OR n.blocked_at IS NOT NULL),
    'motivo', p.blocked_reason,
    'expira_em', COALESCE(p.access_expires_at, n.access_expires_at)
  )
  FROM public.profiles p
  LEFT JOIN public.networks n ON n.id = p.network_id
  WHERE p.user_id = auth.uid()
$function$;
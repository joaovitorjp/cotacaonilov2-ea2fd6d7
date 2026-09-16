-- 1. Campos de bloqueio / prazo
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;

ALTER TABLE public.networks
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_expires_at timestamptz;

-- 2. Função de atividade do usuário
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    ELSE NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.networks n ON n.id = p.network_id
      WHERE p.user_id = _user_id
        AND (
          p.blocked_at IS NOT NULL
          OR n.blocked_at IS NOT NULL
          OR COALESCE(p.access_expires_at, n.access_expires_at) < now()
        )
    )
  END
$$;

-- 3. Admin pode gerenciar perfis e papéis
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Admin pode ler todos os dados (árvore de pastas)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fornecedores','respostas','links_cotacao','price_markups','price_types','chat_messages','access_keys','assinaturas','subscriptions','audit_logs','avarias_uploads','estoques_uploads','estoques_resultados','estoques_manuais']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can read all %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Admins can read all %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

-- 5. Bloqueio/prazo valendo no banco: usuários inativos não gravam
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['listas','fornecedores','links_cotacao','price_markups','price_types','respostas','chat_messages']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Active users only %1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "Active users only %1$s" ON public.%1$I AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (public.is_user_active(auth.uid()))', t);
  END LOOP;
END $$;

-- 6. Status de acesso do próprio usuário (usado na tela de login)
CREATE OR REPLACE FUNCTION public.meu_status_acesso()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'ativo', public.is_user_active(auth.uid()),
    'bloqueado', (p.blocked_at IS NOT NULL OR n.blocked_at IS NOT NULL),
    'motivo', p.blocked_reason,
    'expira_em', COALESCE(p.access_expires_at, n.access_expires_at)
  )
  FROM public.profiles p
  LEFT JOIN public.networks n ON n.id = p.network_id
  WHERE p.user_id = auth.uid()
$$;

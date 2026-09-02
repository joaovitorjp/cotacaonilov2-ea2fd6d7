CREATE TABLE public.access_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('mensal','vitalicio')),
  status text NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','ativa','cancelada')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cliente_nome text,
  cliente_contato text,
  observacao text,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_keys TO authenticated;
GRANT ALL ON public.access_keys TO service_role;

ALTER TABLE public.access_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam chaves"
ON public.access_keys FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuario ve sua propria chave"
ON public.access_keys FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_access_keys_updated_at
BEFORE UPDATE ON public.access_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.resgatar_chave(_chave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _k public.access_keys%ROWTYPE;
  _uid uuid := auth.uid();
  _fim timestamptz;
  _status text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria';
  END IF;

  SELECT * INTO _k FROM public.access_keys
  WHERE lower(chave) = lower(btrim(_chave)) FOR UPDATE;

  IF _k.id IS NULL THEN
    RAISE EXCEPTION 'Chave invalida';
  END IF;
  IF _k.status = 'cancelada' THEN
    RAISE EXCEPTION 'Chave cancelada';
  END IF;
  IF _k.status = 'ativa' AND _k.user_id IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'Chave ja utilizada por outro usuario';
  END IF;

  IF _k.tipo = 'vitalicio' THEN
    _fim := NULL;
    _status := 'lifetime';
  ELSE
    _fim := COALESCE(GREATEST(_k.expires_at, now()), now()) + interval '30 days';
    _status := 'active';
  END IF;

  UPDATE public.access_keys
  SET status = 'ativa', user_id = _uid, redeemed_at = COALESCE(redeemed_at, now()), expires_at = _fim
  WHERE id = _k.id;

  INSERT INTO public.assinaturas (user_id, status, current_period_end)
  VALUES (_uid, _status, _fim)
  ON CONFLICT (user_id) DO UPDATE
  SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, updated_at = now();

  RETURN jsonb_build_object('tipo', _k.tipo, 'status', _status, 'expira_em', _fim);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancelar_chave(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _k public.access_keys%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO _k FROM public.access_keys WHERE id = _id FOR UPDATE;
  IF _k.id IS NULL THEN
    RAISE EXCEPTION 'Chave nao encontrada';
  END IF;

  UPDATE public.access_keys SET status = 'cancelada' WHERE id = _id;

  IF _k.user_id IS NOT NULL THEN
    UPDATE public.assinaturas SET status = 'canceled', current_period_end = now(), updated_at = now()
    WHERE user_id = _k.user_id;
  END IF;
END;
$$;

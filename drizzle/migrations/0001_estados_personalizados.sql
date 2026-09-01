-- 1. Estados personalizados por usuário
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS estados text[] NOT NULL DEFAULT ARRAY['MT','GO']::text[];

-- 2. Condições por estado no link (tipo de preço e frete), formato { "MT": {"tipo":"IPI_ST","frete":"CIF"}, ... }
ALTER TABLE public.links_cotacao
  ADD COLUMN IF NOT EXISTS condicoes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill das condições legadas MT/GO
UPDATE public.links_cotacao
SET condicoes = jsonb_strip_nulls(
  CASE WHEN estados IN ('MT','AMBOS')
    THEN jsonb_build_object('MT', jsonb_build_object('tipo', COALESCE(tipo_preco_mt,'IPI_ST'), 'frete', COALESCE(frete_mt,'CIF')))
    ELSE '{}'::jsonb END
  ||
  CASE WHEN estados IN ('GO','AMBOS')
    THEN jsonb_build_object('GO', jsonb_build_object('tipo', COALESCE(tipo_preco_go,'NOTA'), 'frete', COALESCE(frete_go,'CIF')))
    ELSE '{}'::jsonb END
)
WHERE condicoes = '{}'::jsonb;

-- 3. Token público devolve as condições completas
CREATE OR REPLACE FUNCTION public.get_cotacao_por_token(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'link', jsonb_build_object(
      'id', lc.id,
      'empresa', lc.empresa,
      'respondido', lc.respondido,
      'lista_id', lc.lista_id,
      'estados', lc.estados,
      'condicoes', lc.condicoes,
      'tipo_preco', lc.tipo_preco,
      'tipo_preco_mt', lc.tipo_preco_mt,
      'tipo_preco_go', lc.tipo_preco_go,
      'frete_mt', lc.frete_mt,
      'frete_go', lc.frete_go
    ),
    'lista', jsonb_build_object(
      'id', l.id,
      'nome', l.nome,
      'status', l.status,
      'produtos', l.produtos,
      'prazo', l.prazo
    ),
    'resposta', (
      SELECT jsonb_build_object('id', r.id, 'resposta', r.resposta)
      FROM public.respostas r
      WHERE r.lista_id = lc.lista_id
        AND r.empresa = lc.empresa
        AND r.user_id = lc.user_id
      ORDER BY r.created_at DESC
      LIMIT 1
    )
  )
  FROM public.links_cotacao lc
  JOIN public.listas l
    ON l.id = lc.lista_id
   AND l.user_id = lc.user_id
  WHERE lc.token = _token;
$function$;

-- 4. Validação genérica por estado
CREATE OR REPLACE FUNCTION public.enviar_resposta_cotacao(_token uuid, _resposta jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _link public.links_cotacao%ROWTYPE;
  _resposta_id uuid;
  _item jsonb;
  _allowed text[];
  _uf text;
  _v text;
BEGIN
  SELECT * INTO _link
  FROM public.links_cotacao
  WHERE token = _token
  FOR UPDATE;

  IF _link.id IS NULL THEN
    RAISE EXCEPTION 'Link de cotação inválido';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.listas l
    WHERE l.id = _link.lista_id
      AND l.user_id = _link.user_id
      AND l.status = 'aberta'
      AND (l.prazo IS NULL OR l.prazo >= now())
  ) THEN
    RAISE EXCEPTION 'Cotação indisponível ou encerrada';
  END IF;

  IF jsonb_typeof(_resposta) <> 'array' THEN
    RAISE EXCEPTION 'Formato de resposta inválido';
  END IF;

  -- estados permitidos: chaves de condicoes, senão parse do campo estados
  IF _link.condicoes IS NOT NULL AND _link.condicoes <> '{}'::jsonb THEN
    SELECT array_agg(k) INTO _allowed FROM jsonb_object_keys(_link.condicoes) k;
  ELSIF _link.estados = 'AMBOS' THEN
    _allowed := ARRAY['MT','GO'];
  ELSE
    SELECT array_agg(btrim(x)) INTO _allowed FROM unnest(string_to_array(COALESCE(_link.estados,''), ',')) x;
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(_resposta) LOOP
    IF jsonb_typeof(_item->'precos') = 'object' THEN
      FOR _uf IN SELECT * FROM jsonb_object_keys(_item->'precos') LOOP
        _v := NULLIF(btrim(COALESCE(_item->'precos'->>_uf, '')), '');
        IF _v IS NOT NULL THEN
          IF NOT (_uf = ANY(_allowed)) THEN
            RAISE EXCEPTION 'Preços de % não são permitidos neste link', _uf;
          END IF;
          IF replace(_v, ',', '.') !~ '^[0-9]+(\.[0-9]+)?$' THEN
            RAISE EXCEPTION 'Preço inválido informado (%): %', _uf, _v;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- compatibilidade com campos legados
    _v := NULLIF(btrim(COALESCE(_item->>'preco_mt', '')), '');
    IF _v IS NOT NULL THEN
      IF NOT ('MT' = ANY(_allowed)) THEN
        RAISE EXCEPTION 'Preços de MT não são permitidos neste link';
      END IF;
      IF replace(_v, ',', '.') !~ '^[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'Preço inválido informado (MT): %', _v;
      END IF;
    END IF;

    _v := NULLIF(btrim(COALESCE(_item->>'preco_go', '')), '');
    IF _v IS NOT NULL THEN
      IF NOT ('GO' = ANY(_allowed)) THEN
        RAISE EXCEPTION 'Preços de GO não são permitidos neste link';
      END IF;
      IF replace(_v, ',', '.') !~ '^[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'Preço inválido informado (GO): %', _v;
      END IF;
    END IF;
  END LOOP;

  SELECT r.id INTO _resposta_id
  FROM public.respostas r
  WHERE r.lista_id = _link.lista_id
    AND r.empresa = _link.empresa
    AND r.user_id = _link.user_id
  ORDER BY r.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _resposta_id IS NULL THEN
    INSERT INTO public.respostas (
      lista_id, empresa, resposta, user_id, network_id, empresa_id
    ) VALUES (
      _link.lista_id, _link.empresa, _resposta, _link.user_id, _link.network_id, _link.empresa_id
    )
    RETURNING id INTO _resposta_id;
  ELSE
    UPDATE public.respostas SET resposta = _resposta WHERE id = _resposta_id;
  END IF;

  UPDATE public.links_cotacao SET respondido = true WHERE id = _link.id;

  RETURN _resposta_id;
END;
$function$;
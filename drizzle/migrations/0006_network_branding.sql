ALTER TABLE public.networks
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS logo_url text;

DROP POLICY IF EXISTS "Users can view own network" ON public.networks;
CREATE POLICY "Users can view own network"
ON public.networks
FOR SELECT
TO authenticated
USING (
  id = (SELECT p.network_id FROM public.profiles p WHERE p.user_id = auth.uid())
);

GRANT SELECT ON public.networks TO authenticated;
GRANT ALL ON public.networks TO service_role;

CREATE OR REPLACE FUNCTION public.get_cotacao_por_token(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    'marca', (
      SELECT jsonb_build_object(
        'nome', COALESCE(NULLIF(n.display_name, ''), n.name),
        'logo_url', n.logo_url
      )
      FROM public.networks n
      WHERE n.id = COALESCE(
        lc.network_id,
        (SELECT p.network_id FROM public.profiles p WHERE p.user_id = lc.user_id)
      )
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
$$;

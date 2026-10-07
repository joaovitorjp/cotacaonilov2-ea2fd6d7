ALTER TABLE public.cotacao_shares ADD COLUMN IF NOT EXISTS ultima_entrada jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_shares TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cotacao_compartilhada(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'lista', jsonb_build_object('id', l.id,'nome', l.nome,'status', l.status,'produtos', l.produtos,'created_at', l.created_at),
    'respostas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('empresa', r.empresa,'resposta', r.resposta,'created_at', r.created_at) ORDER BY r.empresa)
      FROM public.respostas r
      WHERE r.lista_id = l.id AND r.user_id = l.user_id
    ), '[]'::jsonb),
    'marca', (
      SELECT jsonb_build_object('nome', COALESCE(NULLIF(n.display_name, ''), n.name),'logo_url', n.logo_url)
      FROM public.profiles p JOIN public.networks n ON n.id = p.network_id
      WHERE p.id = l.user_id LIMIT 1
    ),
    'ultima_entrada', s.ultima_entrada
  )
  FROM public.cotacao_shares s
  JOIN public.listas l ON l.id = s.lista_id AND l.user_id = s.user_id
  WHERE s.token = _token
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.get_cotacao_compartilhada(uuid) TO anon, authenticated;
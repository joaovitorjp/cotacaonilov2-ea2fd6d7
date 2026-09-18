CREATE TABLE IF NOT EXISTS public.cotacao_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lista_id uuid NOT NULL REFERENCES public.listas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cotacao_shares_lista_idx ON public.cotacao_shares(lista_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotacao_shares TO authenticated;
GRANT ALL ON public.cotacao_shares TO service_role;

ALTER TABLE public.cotacao_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Dono gerencia seus compartilhamentos" ON public.cotacao_shares;
CREATE POLICY "Dono gerencia seus compartilhamentos"
ON public.cotacao_shares
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_cotacao_compartilhada(_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'lista', jsonb_build_object(
      'id', l.id,
      'nome', l.nome,
      'status', l.status,
      'produtos', l.produtos,
      'created_at', l.created_at
    ),
    'respostas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'empresa', r.empresa,
        'resposta', r.resposta,
        'created_at', r.created_at
      ) ORDER BY r.empresa)
      FROM public.respostas r
      WHERE r.lista_id = l.id AND r.user_id = l.user_id
    ), '[]'::jsonb),
    'marca', (
      SELECT jsonb_build_object(
        'nome', COALESCE(NULLIF(n.display_name, ''), n.name),
        'logo_url', n.logo_url
      )
      FROM public.profiles p
      JOIN public.networks n ON n.id = p.network_id
      WHERE p.id = l.user_id
      LIMIT 1
    )
  )
  FROM public.cotacao_shares s
  JOIN public.listas l ON l.id = s.lista_id AND l.user_id = s.user_id
  WHERE s.token = _token
  LIMIT 1
$function$;

GRANT EXECUTE ON FUNCTION public.get_cotacao_compartilhada(uuid) TO anon, authenticated;
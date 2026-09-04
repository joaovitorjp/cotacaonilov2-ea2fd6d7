CREATE TABLE public.price_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  lista_id uuid NOT NULL,
  empresa text NOT NULL,
  estado text NOT NULL,
  tipo text NOT NULL DEFAULT 'IPI_ST',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lista_id, empresa, estado)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_types TO authenticated;
GRANT ALL ON public.price_types TO service_role;

ALTER TABLE public.price_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own price types"
ON public.price_types
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
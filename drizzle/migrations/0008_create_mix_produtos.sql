CREATE TABLE public.mix_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mix_categorias_user_nome_idx ON public.mix_categorias (user_id, lower(nome));

CREATE TABLE public.mix_marcas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  categoria_id uuid NOT NULL REFERENCES public.mix_categorias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mix_marcas_cat_nome_idx ON public.mix_marcas (categoria_id, lower(nome));

CREATE TABLE public.mix_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  categoria_id uuid NOT NULL REFERENCES public.mix_categorias(id) ON DELETE CASCADE,
  marca_id uuid NOT NULL REFERENCES public.mix_marcas(id) ON DELETE CASCADE,
  descricao text NOT NULL DEFAULT '',
  codigo_barras text NOT NULL DEFAULT '',
  preco numeric,
  imagem_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mix_produtos_user_cat_idx ON public.mix_produtos (user_id, categoria_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mix_categorias TO authenticated;
GRANT ALL ON public.mix_categorias TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mix_marcas TO authenticated;
GRANT ALL ON public.mix_marcas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mix_produtos TO authenticated;
GRANT ALL ON public.mix_produtos TO service_role;

ALTER TABLE public.mix_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own mix_categorias" ON public.mix_categorias FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own mix_marcas" ON public.mix_marcas FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own mix_produtos" ON public.mix_produtos FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

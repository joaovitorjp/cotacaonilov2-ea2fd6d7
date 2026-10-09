CREATE TABLE public.cobertura_config (
  user_id uuid PRIMARY KEY,
  modo text NOT NULL DEFAULT 'centavos' CHECK (modo IN ('centavos','percentual')),
  valor numeric NOT NULL DEFAULT 5 CHECK (valor > 0 AND valor <= 100),
  final_579 boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobertura_config TO authenticated;
GRANT ALL ON public.cobertura_config TO service_role;
ALTER TABLE public.cobertura_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dono le sua cobertura" ON public.cobertura_config FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Dono cria sua cobertura" ON public.cobertura_config FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Dono altera sua cobertura" ON public.cobertura_config FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Dono apaga sua cobertura" ON public.cobertura_config FOR DELETE TO authenticated USING (auth.uid() = user_id);
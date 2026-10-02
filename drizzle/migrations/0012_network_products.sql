CREATE TABLE public.network_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id uuid NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  codigo_barras text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX network_products_network_idx ON public.network_products(network_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.network_products TO authenticated;
GRANT ALL ON public.network_products TO service_role;
ALTER TABLE public.network_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin gerencia produtos da rede" ON public.network_products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Membros leem produtos da rede" ON public.network_products FOR SELECT TO authenticated
  USING (network_id IN (SELECT p.network_id FROM public.profiles p WHERE p.user_id = auth.uid()));
ALTER TABLE public.mix_marcas ADD COLUMN IF NOT EXISTS classe text;
ALTER TABLE public.mix_marcas DROP CONSTRAINT IF EXISTS mix_marcas_classe_check;
ALTER TABLE public.mix_marcas ADD CONSTRAINT mix_marcas_classe_check CHECK (classe IS NULL OR classe IN ('A','B','C'));
ALTER TABLE public.mix_produtos ADD COLUMN IF NOT EXISTS codigo_interno text;
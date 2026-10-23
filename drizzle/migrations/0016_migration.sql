ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_concluido_at timestamptz;
UPDATE public.profiles SET onboarding_concluido_at = now() WHERE onboarding_concluido_at IS NULL;
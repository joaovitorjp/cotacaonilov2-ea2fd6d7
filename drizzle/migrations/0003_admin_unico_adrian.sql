CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', ''))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE WHEN lower(NEW.email) = 'adriantmj49@gmail.com'
         THEN 'admin'::public.app_role
         ELSE 'user'::public.app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
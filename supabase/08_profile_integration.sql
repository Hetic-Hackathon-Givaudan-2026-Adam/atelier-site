BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN first_name text,
    ADD COLUMN last_name text,
    ADD COLUMN company text;

REVOKE UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (full_name) ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, first_name, last_name, company) ON public.profiles TO authenticated;

CREATE FUNCTION public.atelier_sync_profile_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.atelier_sync_profile_email() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER atelier_confirmed_email_changed
AFTER UPDATE OF email ON auth.users FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.atelier_sync_profile_email();

-- Release legacy addresses before assigning the canonical ones, including renamed accounts.
UPDATE public.profiles p SET email = NULL
FROM auth.users u WHERE p.id = u.id AND p.email IS DISTINCT FROM u.email;

UPDATE public.profiles p SET email = u.email
FROM auth.users u WHERE p.id = u.id AND p.email IS DISTINCT FROM u.email;

CREATE TABLE public.atelier_data_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
    categories text[] NOT NULL CHECK (
        cardinality(categories) BETWEEN 1 AND 4
        AND array_position(categories, NULL) IS NULL
        AND categories <@ ARRAY['account', 'projects', 'orders', 'messages']::text[]
    )
);
CREATE INDEX atelier_data_requests_owner_date ON public.atelier_data_requests(owner, created_at DESC);
ALTER TABLE public.atelier_data_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.atelier_data_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.atelier_data_requests TO authenticated;
GRANT INSERT (categories) ON public.atelier_data_requests TO authenticated;
GRANT SELECT, UPDATE (status) ON public.atelier_data_requests TO service_role;
CREATE POLICY atelier_data_requests_read ON public.atelier_data_requests FOR SELECT TO authenticated
USING (owner = auth.uid());
CREATE POLICY atelier_data_requests_create ON public.atelier_data_requests FOR INSERT TO authenticated
WITH CHECK (owner = auth.uid() AND public.atelier_role() = 'client');

CREATE OR REPLACE FUNCTION public.atelier_save_preference(pref text, items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.atelier_role() IS NULL THEN
        RAISE EXCEPTION 'Session requise' USING ERRCODE = '42501';
    END IF;
    IF pref IS NULL OR pref NOT IN ('orders', 'rejected', 'salesActions', 'usualConstraints')
        OR jsonb_typeof(items) IS DISTINCT FROM 'array' OR pg_column_size(items) > 524288 THEN
        RAISE EXCEPTION 'Préférences invalides' USING ERRCODE = '22023';
    END IF;
    IF pref = 'usualConstraints' THEN
        IF public.atelier_role() <> 'client' THEN
            RAISE EXCEPTION 'Compte client requis' USING ERRCODE = '42501';
        END IF;
        IF jsonb_array_length(items) > 32 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(items) AS item
            WHERE jsonb_typeof(item) <> 'string' OR char_length(item #>> '{}') NOT BETWEEN 1 AND 120
        ) THEN
            RAISE EXCEPTION 'Exigences invalides' USING ERRCODE = '22023';
        END IF;
    END IF;
    INSERT INTO public.atelier_preferences (owner, data) VALUES (auth.uid(), jsonb_build_object(pref, items))
    ON CONFLICT (owner) DO UPDATE SET data = atelier_preferences.data || excluded.data;
END;
$$;

COMMIT;

BEGIN;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_label text;
UPDATE public.projects p SET client_label = profile.full_name
FROM public.profiles profile WHERE p.client_label IS NULL AND p.client_id = profile.id
AND profile.full_name IS NOT NULL;
ALTER TABLE public.project_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS projects_client_idx ON public.projects(client_id);
CREATE INDEX IF NOT EXISTS projects_commercial_idx ON public.projects(commercial_id);

CREATE OR REPLACE FUNCTION public.atelier_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

REVOKE ALL ON FUNCTION public.atelier_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atelier_role() TO authenticated;

DROP POLICY IF EXISTS "Clients can view their own projects" ON public.projects;
CREATE POLICY "Clients can view their own projects" ON public.projects FOR SELECT TO authenticated
USING (client_id = auth.uid() AND (SELECT public.atelier_role()) = 'client');

DROP POLICY IF EXISTS "Commercials can view assigned projects" ON public.projects;
CREATE POLICY "Commercials can view assigned projects" ON public.projects FOR SELECT TO authenticated
USING (commercial_id = auth.uid() AND (SELECT public.atelier_role()) = 'commercial');

DROP POLICY IF EXISTS "Atelier admin reads projects" ON public.projects;
CREATE POLICY "Atelier admin reads projects" ON public.projects FOR SELECT TO authenticated
USING ((SELECT public.atelier_role()) = 'admin');

DROP POLICY IF EXISTS "Atelier admin reads staff" ON public.profiles;
CREATE POLICY "Atelier admin reads staff" ON public.profiles FOR SELECT TO authenticated
USING (role = 'commercial' AND (SELECT public.atelier_role()) = 'admin');

REVOKE INSERT, UPDATE, DELETE ON public.projects FROM anon, authenticated;
REVOKE INSERT (client_id, name, description), UPDATE (name, description)
ON public.projects FROM anon, authenticated;
REVOKE INSERT ON public.briefs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.atelier_save_project(project uuid, expected_revision bigint, snapshot jsonb)
RETURNS public.projects
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    saved public.projects;
    composition jsonb;
    title text := btrim(snapshot->>'name');
BEGIN
    IF auth.uid() IS NULL OR public.atelier_role() IS DISTINCT FROM 'client' THEN
        RAISE EXCEPTION 'Client requis' USING ERRCODE = '42501';
    END IF;
    IF project IS NULL OR expected_revision IS NULL OR jsonb_typeof(snapshot) IS DISTINCT FROM 'object'
        OR title IS NULL OR length(title) NOT BETWEEN 1 AND 250 OR pg_column_size(snapshot) > 524288 THEN
        RAISE EXCEPTION 'Projet invalide' USING ERRCODE = '22023';
    END IF;

    -- Resolve an ambiguous HTTP retry without duplicating the project or its projections.
    SELECT * INTO saved FROM public.projects WHERE id = project AND client_id = auth.uid()
        AND revision = expected_revision + 1 AND state = snapshot;
    IF FOUND THEN RETURN saved; END IF;

    IF expected_revision = -1 THEN
        INSERT INTO public.projects (id, client_id, name, state, client_label)
        SELECT project, id, title, snapshot, full_name FROM public.profiles WHERE id = auth.uid()
        RETURNING * INTO saved;
    ELSE
        UPDATE public.projects SET name = title, state = snapshot, updated_at = now(),
            revision = revision + 1,
            status = CASE WHEN status = 'draft' AND snapshot->>'status' IN ('requested', 'expert')
                          THEN 'pending' ELSE status END
        WHERE id = project AND client_id = auth.uid() AND revision = expected_revision
        RETURNING * INTO saved;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Projet indisponible ou modifié ailleurs' USING ERRCODE = 'PT409';
        END IF;
    END IF;

    IF snapshot ? 'brief' THEN
        UPDATE public.briefs SET fields = snapshot->'brief', file_name = snapshot#>>'{source,fileName}', updated_at = now()
        WHERE id = (SELECT b.id FROM public.briefs b WHERE b.project_id = project
                    ORDER BY b.created_at DESC, b.id LIMIT 1);
        IF NOT FOUND THEN
            INSERT INTO public.briefs (project_id, fields, file_name)
            VALUES (project, snapshot->'brief', snapshot#>>'{source,fileName}');
        END IF;
    END IF;

    FOR composition IN SELECT value FROM jsonb_array_elements(coalesce(snapshot->'blends', '[]'))
    LOOP
        IF composition->>'id' IS NULL OR composition->>'name' IS NULL THEN
            CONTINUE;
        END IF;
        UPDATE public.recommendations SET composition_data = composition,
            composition_name = composition->>'name'
        WHERE project_id = project AND composition_id = composition->>'id';
        IF NOT FOUND THEN
            INSERT INTO public.recommendations (project_id, composition_id, composition_name, composition_data)
            VALUES (project, composition->>'id', composition->>'name', composition);
        END IF;
    END LOOP;

    RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.atelier_assign_project(project uuid, commercial uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF public.atelier_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Administrateur requis' USING ERRCODE = '42501';
    END IF;
    IF commercial IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = commercial AND role = 'commercial'
    ) THEN
        RAISE EXCEPTION 'Commercial invalide' USING ERRCODE = '22023';
    END IF;
    UPDATE public.projects SET commercial_id = commercial WHERE id = project;
    IF NOT FOUND THEN RAISE EXCEPTION 'Projet introuvable'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.atelier_read_messages(messages uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
    UPDATE public.project_messages m SET read_at = now()
    FROM public.projects p
    WHERE m.id = ANY(messages) AND m.project_id = p.id AND m.read_at IS NULL
    AND ((p.client_id = auth.uid() AND (SELECT public.atelier_role()) = 'client' AND m.sender_role = 'commercial')
      OR (p.commercial_id = auth.uid() AND (SELECT public.atelier_role()) = 'commercial' AND m.sender_role = 'client'))
$$;

REVOKE ALL ON FUNCTION public.atelier_save_project(uuid,bigint,jsonb),
    public.atelier_assign_project(uuid,uuid), public.atelier_read_messages(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atelier_save_project(uuid,bigint,jsonb),
    public.atelier_assign_project(uuid,uuid), public.atelier_read_messages(uuid[]) TO authenticated;

GRANT SELECT ON public.projects, public.briefs, public.project_messages, public.recommendations TO authenticated;
DROP POLICY IF EXISTS "Project members can read messages" ON public.project_messages;
CREATE POLICY "Project members can read messages" ON public.project_messages FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_messages.project_id
    AND ((p.client_id = auth.uid() AND (SELECT public.atelier_role()) = 'client')
      OR (p.commercial_id = auth.uid() AND (SELECT public.atelier_role()) = 'commercial'))
));

REVOKE INSERT, UPDATE, DELETE ON public.project_messages FROM anon, authenticated;
GRANT INSERT (project_id, sender_id, sender_role, content) ON public.project_messages TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.project_messages;
DROP POLICY IF EXISTS "Users can send messages with their real role" ON public.project_messages;
CREATE POLICY "Users can send messages with their real role" ON public.project_messages
FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND sender_role = (SELECT public.atelier_role())
    AND length(btrim(content)) BETWEEN 1 AND 8000 AND EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = project_messages.project_id
        AND ((sender_role = 'client' AND p.client_id = auth.uid())
          OR (sender_role = 'commercial' AND p.commercial_id = auth.uid()))
    )
);

CREATE TABLE IF NOT EXISTS public.atelier_preferences (
    owner uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    data jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE public.atelier_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Atelier owns preferences" ON public.atelier_preferences;
CREATE POLICY "Atelier owns preferences" ON public.atelier_preferences TO authenticated
USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
GRANT SELECT ON public.atelier_preferences TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.atelier_preferences FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.atelier_save_preference(pref text, items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.atelier_role() IS NULL THEN
        RAISE EXCEPTION 'Session requise' USING ERRCODE = '42501';
    END IF;
    IF pref IS NULL OR pref NOT IN ('orders', 'rejected', 'salesActions')
        OR jsonb_typeof(items) IS DISTINCT FROM 'array' OR pg_column_size(items) > 524288 THEN
        RAISE EXCEPTION 'Préférences invalides' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.atelier_preferences (owner, data) VALUES (auth.uid(), jsonb_build_object(pref, items))
    ON CONFLICT (owner) DO UPDATE SET data = atelier_preferences.data || excluded.data;
END;
$$;

REVOKE ALL ON FUNCTION public.atelier_save_preference(text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atelier_save_preference(text,jsonb) TO authenticated;

-- Earlier trigger only provisioned users created after its installation.
INSERT INTO public.profiles (id, full_name, email)
SELECT id, raw_user_meta_data->>'full_name', email FROM auth.users ON CONFLICT DO NOTHING;

COMMIT;

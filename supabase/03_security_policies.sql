-- =========================================
-- GIVAUDAN ATELIER
-- STEP 4: SECURITY POLICIES
-- =========================================

-- 1. PROTECT PROFILE ROLES
-- Users must not be able to change their own role.

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;


-- 2. COMMERCIAL PROJECT ACCESS

CREATE POLICY "Commercials can view assigned projects"
ON public.projects
FOR SELECT
TO authenticated
USING (commercial_id = auth.uid());


-- 3. BRIEFS

CREATE POLICY "Project members can view briefs"
ON public.briefs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = briefs.project_id
        AND (
            p.client_id = auth.uid()
            OR p.commercial_id = auth.uid()
        )
    )
);

CREATE POLICY "Clients can create briefs"
ON public.briefs
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = briefs.project_id
        AND p.client_id = auth.uid()
    )
);


-- 4. PROJECT MESSAGES

CREATE POLICY "Project members can read messages"
ON public.project_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_messages.project_id
        AND (
            p.client_id = auth.uid()
            OR p.commercial_id = auth.uid()
        )
    )
);

CREATE POLICY "Authenticated users can send messages"
ON public.project_messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND sender_role IN ('client', 'commercial')
    AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_messages.project_id
        AND (
            p.client_id = auth.uid()
            OR p.commercial_id = auth.uid()
        )
    )
);


-- 5. RECOMMENDATIONS

CREATE POLICY "Project members can view recommendations"
ON public.recommendations
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = recommendations.project_id
        AND (
            p.client_id = auth.uid()
            OR p.commercial_id = auth.uid()
        )
    )
);
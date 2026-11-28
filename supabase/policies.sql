-- =========================================
-- GIVAUDAN ATELIER
-- STEP 2: SECURITY POLICIES
-- =========================================

-- PROFILES

CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());


-- PROJECTS

CREATE POLICY "Clients can view their own projects"
ON public.projects
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

CREATE POLICY "Clients can create their own projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (client_id = auth.uid());

CREATE POLICY "Clients can update their own projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());
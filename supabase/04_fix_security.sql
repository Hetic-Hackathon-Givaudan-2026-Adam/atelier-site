DROP POLICY IF EXISTS "Authenticated users can send messages"
ON public.project_messages;

CREATE POLICY "Users can send messages with their real role"
ON public.project_messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND sender_role IN ('client', 'commercial')
    AND EXISTS (
        SELECT 1
        FROM public.profiles pr
        WHERE pr.id = auth.uid()
        AND pr.role = project_messages.sender_role
    )
    AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_messages.project_id
        AND (
            (p.client_id = auth.uid() AND sender_role = 'client')
            OR
            (p.commercial_id = auth.uid() AND sender_role = 'commercial')
        )
    )
);

-- Empêcher les clients de modifier eux-mêmes
-- l'affectation commerciale de leurs projets.

REVOKE INSERT, UPDATE ON public.projects FROM authenticated;

GRANT INSERT (client_id, name, description)
ON public.projects TO authenticated;

GRANT UPDATE (name, description)
ON public.projects TO authenticated;
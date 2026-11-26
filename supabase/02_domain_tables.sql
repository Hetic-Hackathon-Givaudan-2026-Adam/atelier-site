-- =========================================
-- GIVAUDAN ATELIER
-- STEP 3: BUSINESS TABLES
-- =========================================

-- 1. BRIEFS
CREATE TABLE public.briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL
        REFERENCES public.projects(id) ON DELETE CASCADE,

    fields JSONB NOT NULL DEFAULT '{}'::jsonb,

    summary TEXT,
    file_name TEXT,
    storage_path TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 2. PROJECT MESSAGES
CREATE TABLE public.project_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL
        REFERENCES public.projects(id) ON DELETE CASCADE,

    sender_id UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL,

    sender_role TEXT NOT NULL
        CHECK (sender_role IN ('client', 'assistant', 'commercial')),

    content TEXT NOT NULL,

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 3. RECOMMENDATIONS
CREATE TABLE public.recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL
        REFERENCES public.projects(id) ON DELETE CASCADE,

    composition_id TEXT NOT NULL,

    composition_name TEXT NOT NULL,

    composition_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    score NUMERIC,

    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'favorite', 'rejected', 'selected')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- INDEXES
CREATE INDEX idx_briefs_project_id
ON public.briefs(project_id);

CREATE INDEX idx_messages_project_id
ON public.project_messages(project_id);

CREATE INDEX idx_messages_created_at
ON public.project_messages(created_at);

CREATE INDEX idx_recommendations_project_id
ON public.recommendations(project_id);


-- ENABLE RLS
ALTER TABLE public.briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;
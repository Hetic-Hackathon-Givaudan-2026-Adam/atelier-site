-- =========================================
-- GIVAUDAN ATELIER
-- DATABASE SCHEMA
-- STEP 1: PROFILES AND PROJECTS
-- =========================================

-- 1. PROFILES
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'client'
        CHECK (role IN ('client', 'commercial', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROJECTS
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    client_id UUID NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    commercial_id UUID
        REFERENCES public.profiles(id) ON DELETE SET NULL,

    name TEXT NOT NULL,
    description TEXT,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'in_progress', 'completed', 'cancelled')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
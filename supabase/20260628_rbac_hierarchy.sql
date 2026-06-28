-- Migration: 20260628_rbac_hierarchy.sql

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    target_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Super Admins can read audit logs directly for now.
CREATE POLICY "Super Admins can view all audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
    );

-- 2. Modify profiles table
-- Add created_by column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Convert parent_id to UUID safely
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type 
  FROM information_schema.columns 
  WHERE table_name = 'profiles' AND column_name = 'parent_id';

  IF col_type = 'text' OR col_type = 'character varying' THEN
    -- It's still text, safe to compare with empty string
    EXECUTE 'UPDATE public.profiles SET parent_id = NULL WHERE parent_id = ''''';
    
    -- Try casting any remaining invalid uuids to NULL, or let the user fix them manually
    -- But assuming empty strings were the only issue, we proceed:
    ALTER TABLE public.profiles ALTER COLUMN parent_id TYPE UUID USING NULLIF(parent_id, '')::UUID;
  END IF;

  -- Check if foreign key already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_profiles_parent_id' 
    AND table_name = 'profiles'
  ) THEN
    -- Add foreign key
    ALTER TABLE public.profiles
        ADD CONSTRAINT fk_profiles_parent_id
        FOREIGN KEY (parent_id)
        REFERENCES public.profiles(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id ON public.profiles(parent_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON public.profiles(created_by);

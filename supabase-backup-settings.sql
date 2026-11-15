-- ============================================================================
-- CALCULATOR MAX: BACKUP MANAGEMENT PERMISSIONS SQL
-- Run this script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Create User Backup Settings Table (Independent toggles for History, Notes, Tasks)
CREATE TABLE IF NOT EXISTS public.user_backup_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_calculator_history BOOLEAN NOT NULL DEFAULT TRUE,
  backup_notes BOOLEAN NOT NULL DEFAULT TRUE,
  backup_tasks BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable & Force Row Level Security (RLS)
ALTER TABLE public.user_backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_backup_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own backup settings" ON public.user_backup_settings;
CREATE POLICY "Users can view their own backup settings"
  ON public.user_backup_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own backup settings" ON public.user_backup_settings;
CREATE POLICY "Users can insert their own backup settings"
  ON public.user_backup_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own backup settings" ON public.user_backup_settings;
CREATE POLICY "Users can update their own backup settings"
  ON public.user_backup_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

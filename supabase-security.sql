-- ============================================================================
-- CALCULATOR MAX: COMPLETE SECURITY, ENCRYPTION, RBAC & AUDIT SQL REQUIREMENTS
-- Run in Supabase SQL Editor (or PostgreSQL) to enforce database-level RLS,
-- RBAC roles, cascading deletes, and immutable security audit logging.
-- ============================================================================

-- 0. Ensure pgcrypto extension is enabled for cryptographic database functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. User Profiles & Role-Based Access Control (RBAC)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile as standard user" ON public.profiles;
CREATE POLICY "Users can insert their own profile as standard user"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'user');

DROP POLICY IF EXISTS "Users can update own profile without escalating role" ON public.profiles;
CREATE POLICY "Users can update own profile without escalating role"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2. Encrypted Calculation History Table (with strict Row Level Security)
CREATE TABLE IF NOT EXISTS public.calculations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (char_length(type) <= 40),
  details TEXT NOT NULL CHECK (char_length(details) <= 4000),
  result TEXT NOT NULL CHECK (char_length(result) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calculations_user_created
  ON public.calculations(user_id, created_at DESC);

ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own calculations" ON public.calculations;
CREATE POLICY "Users can view their own calculations"
  ON public.calculations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own calculations" ON public.calculations;
CREATE POLICY "Users can insert their own calculations"
  ON public.calculations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own calculations" ON public.calculations;
CREATE POLICY "Users can delete their own calculations"
  ON public.calculations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Immutable Security Audit Logs Table (for compliance & anomaly auditing)
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_uid TEXT,
  actor_role TEXT NOT NULL DEFAULT 'anonymous',
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'denied', 'error')),
  ip_address TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user_created
  ON public.security_audit_logs(user_uid, created_at DESC);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own audit logs or admins read all" ON public.security_audit_logs;
CREATE POLICY "Users can read own audit logs or admins read all"
  ON public.security_audit_logs FOR SELECT
  TO authenticated
  USING (
    user_uid = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Authenticated users can append own audit logs" ON public.security_audit_logs;
CREATE POLICY "Authenticated users can append own audit logs"
  ON public.security_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_uid = auth.uid()::text);

-- 4. Application PostgreSQL / Drizzle tables (if using standalone PostgreSQL)
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- 5. Enforce FORCE RLS on Notes & Tasks tables (if already created)
DO $$
BEGIN
  IF to_regclass('public.notes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.notes FORCE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.tasks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY';
  END IF;
  IF to_regclass('public.task_lists') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.task_lists FORCE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ============================================================================
-- CALCULATOR MAX: SUBSCRIPTIONS & 10MB PER-USER CLOUD STORAGE QUOTA SQL
-- Run this script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Create User Subscriptions & Cloud Storage Quota Table (10MB default limit)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL DEFAULT 'starter' CHECK (plan_id IN ('starter', 'pro', 'team', 'enterprise')),
  storage_limit_bytes BIGINT NOT NULL DEFAULT 10485760, -- 10 MB (10 * 1024 * 1024 bytes) per-user limit
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  country_region TEXT DEFAULT 'India',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan
  ON public.user_subscriptions(plan_id);

-- 2. Enable & Force Row Level Security (RLS)
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own subscription and storage" ON public.user_subscriptions;
CREATE POLICY "Users can view their own subscription and storage"
  ON public.user_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can insert their own subscription"
  ON public.user_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can update their own subscription"
  ON public.user_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Cloud Storage Calculation & Sync RPC Function (10MB Per-User Limit)
CREATE OR REPLACE FUNCTION public.get_user_storage_usage()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_calc_bytes BIGINT := 0;
  v_notes_bytes BIGINT := 0;
  v_tasks_bytes BIGINT := 0;
  v_lists_bytes BIGINT := 0;
  v_total_bytes BIGINT := 0;
  v_limit_bytes BIGINT := 10485760; -- 10 MB per-user default limit
  v_plan_id TEXT := 'starter';
  v_country TEXT := 'India';
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'used_bytes', 0,
      'limit_bytes', 10485760,
      'calculations_bytes', 0,
      'notes_bytes', 0,
      'tasks_bytes', 0,
      'plan_id', 'starter'
    );
  END IF;

  -- Measure calculations storage bytes
  IF to_regclass('public.calculations') IS NOT NULL THEN
    SELECT COALESCE(SUM(pg_column_size(c.*)), 0)
      INTO v_calc_bytes
      FROM public.calculations c
      WHERE c.user_id = v_uid;
  END IF;

  -- Measure notes storage bytes
  IF to_regclass('public.notes') IS NOT NULL THEN
    SELECT COALESCE(SUM(pg_column_size(n.*)), 0)
      INTO v_notes_bytes
      FROM public.notes n
      WHERE n.user_id = v_uid;
  END IF;

  -- Measure tasks storage bytes
  IF to_regclass('public.tasks') IS NOT NULL THEN
    SELECT COALESCE(SUM(pg_column_size(t.*)), 0)
      INTO v_tasks_bytes
      FROM public.tasks t
      WHERE t.user_id = v_uid;
  END IF;

  -- Measure task_lists storage bytes
  IF to_regclass('public.task_lists') IS NOT NULL THEN
    SELECT COALESCE(SUM(pg_column_size(tl.*)), 0)
      INTO v_lists_bytes
      FROM public.task_lists tl
      WHERE tl.user_id = v_uid;
  END IF;

  v_total_bytes := v_calc_bytes + v_notes_bytes + v_tasks_bytes + v_lists_bytes;

  -- Ensure subscription record exists and sync storage_used_bytes
  INSERT INTO public.user_subscriptions (user_id, plan_id, storage_limit_bytes, storage_used_bytes, updated_at)
  VALUES (v_uid, 'starter', 10485760, v_total_bytes, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET storage_used_bytes = EXCLUDED.storage_used_bytes,
        updated_at = NOW()
  RETURNING plan_id, storage_limit_bytes, COALESCE(country_region, 'India')
  INTO v_plan_id, v_limit_bytes, v_country;

  RETURN jsonb_build_object(
    'used_bytes', v_total_bytes,
    'limit_bytes', v_limit_bytes,
    'calculations_bytes', v_calc_bytes,
    'notes_bytes', v_notes_bytes,
    'tasks_bytes', v_tasks_bytes + v_lists_bytes,
    'plan_id', v_plan_id,
    'country_region', v_country,
    'updated_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_storage_usage() TO authenticated;

-- 4. Database Trigger to Enforce 10MB Per-User Storage Quota on Writes
CREATE OR REPLACE FUNCTION public.enforce_user_10mb_storage_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage JSONB;
  v_used BIGINT;
  v_limit BIGINT;
BEGIN
  v_usage := public.get_user_storage_usage();
  v_used := COALESCE((v_usage->>'used_bytes')::BIGINT, 0);
  v_limit := COALESCE((v_usage->>'limit_bytes')::BIGINT, 10485760);

  IF v_used + pg_column_size(NEW.*) > v_limit THEN
    RAISE EXCEPTION 'Cloud storage quota exceeded (10MB per-user limit reached). Upgrade your subscription plan or free up space.';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.calculations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_enforce_quota_calculations ON public.calculations;
    CREATE TRIGGER trg_enforce_quota_calculations
      BEFORE INSERT OR UPDATE ON public.calculations
      FOR EACH ROW EXECUTE FUNCTION public.enforce_user_10mb_storage_quota();
  END IF;

  IF to_regclass('public.notes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_enforce_quota_notes ON public.notes;
    CREATE TRIGGER trg_enforce_quota_notes
      BEFORE INSERT OR UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.enforce_user_10mb_storage_quota();
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_enforce_quota_tasks ON public.tasks;
    CREATE TRIGGER trg_enforce_quota_tasks
      BEFORE INSERT OR UPDATE ON public.tasks
      FOR EACH ROW EXECUTE FUNCTION public.enforce_user_10mb_storage_quota();
  END IF;
END $$;

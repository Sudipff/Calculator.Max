-- ============================================================================
-- CALCULATOR MAX: OFFLINE SYNC & PUSH NOTIFICATION SQL REQUIREMENTS
-- Run this script in your Supabase Dashboard -> SQL Editor -> New Query -> Run
-- (Safe & idempotent: uses IF NOT EXISTS and ADD COLUMN IF NOT EXISTS)
-- ============================================================================

-- 1. Add missing `priority` column on public.tasks so task priorities sync to cloud
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  CHECK (priority IN ('high', 'medium', 'low'));

CREATE INDEX IF NOT EXISTS idx_tasks_priority
  ON public.tasks(user_id, priority);

-- 2. Helpful partial indexes on reminder timestamps for scheduled reminders & offline catch-up
CREATE INDEX IF NOT EXISTS idx_notes_reminder_at
  ON public.notes(user_id, reminder_at)
  WHERE reminder_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_reminder_at
  ON public.tasks(user_id, reminder_at)
  WHERE reminder_at IS NOT NULL;

-- 3. Automatic updated_at trigger function for conflict-safe offline/online sync
CREATE OR REPLACE FUNCTION public.calcmax_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notes_updated_at') THEN
    CREATE TRIGGER trg_notes_updated_at
      BEFORE UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.calcmax_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
    CREATE TRIGGER trg_tasks_updated_at
      BEFORE UPDATE ON public.tasks
      FOR EACH ROW EXECUTE FUNCTION public.calcmax_set_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_lists_updated_at') THEN
    CREATE TRIGGER trg_task_lists_updated_at
      BEFORE UPDATE ON public.task_lists
      FOR EACH ROW EXECUTE FUNCTION public.calcmax_set_updated_at();
  END IF;
END $$;

-- 4. Web Push Subscriptions table (stores user browser/PWA push endpoints)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_sub_user_endpoint UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Scheduled Reminders queue table (tracks scheduled note & task push alerts)
CREATE TABLE IF NOT EXISTS public.scheduled_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('note', 'task')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  remind_at TIMESTAMPTZ NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_scheduled_reminder_source UNIQUE (user_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_pending
  ON public.scheduled_reminders(remind_at)
  WHERE sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_user
  ON public.scheduled_reminders(user_id, remind_at);

ALTER TABLE public.scheduled_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reminders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scheduled reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can view own scheduled reminders"
  ON public.scheduled_reminders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own scheduled reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can insert own scheduled reminders"
  ON public.scheduled_reminders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own scheduled reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can update own scheduled reminders"
  ON public.scheduled_reminders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own scheduled reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can delete own scheduled reminders"
  ON public.scheduled_reminders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

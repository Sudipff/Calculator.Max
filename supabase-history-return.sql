-- ============================================================================
-- CALCULATOR MAX: HISTORY ORIGIN TRACKING & RETURN TO HISTORY SQL MIGRATION
-- Run this script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- Purpose:
-- 1. Stores `source_history` JSONB metadata on `public.notes` and `public.tasks`
--    so items imported from History retain their origin across devices/sessions.
-- 2. Provides optional atomic `return_note_to_history` and
--    `return_task_to_history` RPCs that delete the note/task first before
--    restoring the row to `public.calculations`, keeping quota triggers accurate.
-- ============================================================================

-- 1. Add History-import provenance columns to Notes and Tasks
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS source_history JSONB DEFAULT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_history JSONB DEFAULT NULL;

-- 2. Partial indexes for items imported from History
CREATE INDEX IF NOT EXISTS idx_notes_has_source_history
  ON public.notes(user_id)
  WHERE source_history IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_has_source_history
  ON public.tasks(user_id)
  WHERE source_history IS NOT NULL;

-- 3. Atomic RPC: Return an imported Note back to Calculation History
CREATE OR REPLACE FUNCTION public.return_note_to_history(
  p_note_id TEXT,
  p_type TEXT,
  p_details TEXT,
  p_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_calc RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Delete the imported note first to free quota immediately
  DELETE FROM public.notes
  WHERE id = p_note_id AND user_id = v_uid;

  -- Re-insert calculation back into History
  INSERT INTO public.calculations (user_id, type, details, result)
  VALUES (v_uid, p_type, p_details, p_result)
  RETURNING * INTO v_calc;

  RETURN to_jsonb(v_calc);
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_note_to_history(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- 4. Atomic RPC: Return an imported Task back to Calculation History
CREATE OR REPLACE FUNCTION public.return_task_to_history(
  p_task_id TEXT,
  p_type TEXT,
  p_details TEXT,
  p_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_calc RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Delete any nested subtasks and the imported task first to free quota
  DELETE FROM public.tasks
  WHERE parent_id = p_task_id AND user_id = v_uid;

  DELETE FROM public.tasks
  WHERE id = p_task_id AND user_id = v_uid;

  -- Re-insert calculation back into History
  INSERT INTO public.calculations (user_id, type, details, result)
  VALUES (v_uid, p_type, p_details, p_result)
  RETURNING * INTO v_calc;

  RETURN to_jsonb(v_calc);
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_task_to_history(TEXT, TEXT, TEXT, TEXT) TO authenticated;

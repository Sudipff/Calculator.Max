-- ============================================================================
-- CALCULATOR MAX: ATOMIC HISTORY -> NOTE / TASK MOVE SQL RPCS (OPTIONAL)
-- Run this script in your Supabase Project:
-- Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- Why? When user storage is near the quota limit (e.g. 10 MB Starter limit),
-- moving a calculation out of `calculations` and into `notes` or `tasks`
-- deletes the calculation row first inside a single atomic transaction before
-- inserting the Note or Task, ensuring quota triggers accurately evaluate
-- the net storage footprint.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.move_calculation_to_note(
  p_calc_id BIGINT DEFAULT NULL,
  p_note_id TEXT DEFAULT NULL,
  p_title TEXT DEFAULT '',
  p_content TEXT DEFAULT '',
  p_color TEXT DEFAULT 'sky',
  p_labels JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_note_id TEXT := COALESCE(NULLIF(p_note_id, ''), 'note-' || extract(epoch from now())::bigint::text);
  v_now TIMESTAMPTZ := NOW();
  v_note RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Remove source calculation row first to free storage quota immediately
  IF p_calc_id IS NOT NULL THEN
    DELETE FROM public.calculations
    WHERE id = p_calc_id AND user_id = v_uid;
  END IF;

  -- 2. Insert or update destination note row
  INSERT INTO public.notes (
    id, user_id, title, content, color, is_pinned, is_checklist,
    checklist_items, labels, reminder_at, is_emergency, created_at, updated_at
  )
  VALUES (
    v_note_id, v_uid, COALESCE(p_title, ''), COALESCE(p_content, ''),
    COALESCE(p_color, 'sky'), false, false,
    '[]'::jsonb, COALESCE(p_labels, '[]'::jsonb), NULL, false, v_now, v_now
  )
  ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        content = EXCLUDED.content,
        color = EXCLUDED.color,
        labels = EXCLUDED.labels,
        updated_at = v_now
  WHERE public.notes.user_id = v_uid
  RETURNING * INTO v_note;

  RETURN to_jsonb(v_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_calculation_to_note(BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.move_calculation_to_task(
  p_calc_id BIGINT DEFAULT NULL,
  p_task_id TEXT DEFAULT NULL,
  p_list_id TEXT DEFAULT NULL,
  p_title TEXT DEFAULT '',
  p_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_task_id TEXT := COALESCE(NULLIF(p_task_id, ''), 'task-' || extract(epoch from now())::bigint::text);
  v_now TIMESTAMPTZ := NOW();
  v_task RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Remove source calculation row first to free storage quota immediately
  IF p_calc_id IS NOT NULL THEN
    DELETE FROM public.calculations
    WHERE id = p_calc_id AND user_id = v_uid;
  END IF;

  -- 2. Insert or update destination task row
  INSERT INTO public.tasks (
    id, user_id, list_id, parent_id, title, description,
    completed, is_starred, due_date, reminder_at, created_at, updated_at
  )
  VALUES (
    v_task_id, v_uid, NULLIF(p_list_id, ''), NULL,
    COALESCE(NULLIF(p_title, ''), 'Calculation Task'), COALESCE(p_description, ''),
    false, false, NULL, NULL, v_now, v_now
  )
  ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at = v_now
  WHERE public.tasks.user_id = v_uid
  RETURNING * INTO v_task;

  RETURN to_jsonb(v_task);
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_calculation_to_task(BIGINT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

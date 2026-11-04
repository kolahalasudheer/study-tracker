-- Apply AFTER mock_tests.sql to a confirmed development/test Supabase project.
-- Transactional and repeatable; existing mocks and mistake explanations are retained.
BEGIN;

ALTER TABLE public.mock_tests
  ALTER COLUMN exam_profile_id DROP NOT NULL,
  ALTER COLUMN correct_count DROP NOT NULL, ALTER COLUMN correct_count DROP DEFAULT,
  ALTER COLUMN wrong_count DROP NOT NULL, ALTER COLUMN wrong_count DROP DEFAULT,
  ALTER COLUMN unattempted_count DROP NOT NULL, ALTER COLUMN unattempted_count DROP DEFAULT,
  ALTER COLUMN time_minutes DROP NOT NULL, ALTER COLUMN time_minutes DROP DEFAULT,
  ALTER COLUMN time_minutes TYPE NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS negative_marks NUMERIC(10,2) CHECK (negative_marks >= 0),
  ADD COLUMN IF NOT EXISTS time_allowed_minutes NUMERIC(10,2) CHECK (time_allowed_minutes > 0),
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- PostgreSQL-generated constraint names differ for older drafts. Replace only
-- score checks, allowing legitimate negative final scores from negative marking.
DO $$ DECLARE item RECORD; BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.mock_tests'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%marks_obtained%'
  LOOP EXECUTE format('ALTER TABLE public.mock_tests DROP CONSTRAINT %I', item.conname); END LOOP;
END $$;
ALTER TABLE public.mock_tests ADD CONSTRAINT mock_score_within_max CHECK (marks_obtained <= total_marks);

ALTER TABLE public.mock_test_errors
  ALTER COLUMN test_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS exam_profile_id UUID,
  ADD COLUMN IF NOT EXISTS marks_lost NUMERIC(10,2) CHECK (marks_lost >= 0),
  ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.mock_test_errors DROP CONSTRAINT IF EXISTS mock_test_errors_error_type_check;
UPDATE public.mock_test_errors SET error_type = CASE error_type
  WHEN 'Conceptual mistake' THEN 'Concept gap'
  WHEN 'Calculation error' THEN 'Silly mistake'
  WHEN 'Formula error' THEN 'Forgot formula/fact'
  WHEN 'Time management' THEN 'Time pressure'
  WHEN 'Guessing' THEN 'Wrong guess'
  ELSE error_type END;
ALTER TABLE public.mock_test_errors ADD CONSTRAINT mock_test_errors_error_type_check
  CHECK (error_type IN ('Concept gap', 'Silly mistake', 'Misread question', 'Time pressure', 'Wrong guess', 'Forgot formula/fact'));
ALTER TABLE public.mock_test_errors DROP CONSTRAINT IF EXISTS mock_test_errors_revision_status_check;
UPDATE public.mock_test_errors SET revision_status = 'revised' WHERE revision_status = 'mastered';
ALTER TABLE public.mock_test_errors ADD CONSTRAINT mock_test_errors_revision_status_check CHECK (revision_status IN ('pending', 'revised'));
-- No revised_at backfill: the historical revision date is unknown.
UPDATE public.mock_test_errors e SET exam_profile_id = t.exam_profile_id
FROM public.mock_tests t WHERE t.id = e.test_id AND t.user_id = e.user_id;
ALTER TABLE public.mock_test_errors DROP CONSTRAINT IF EXISTS mock_errors_profile_owner_fk;
ALTER TABLE public.mock_test_errors ADD CONSTRAINT mock_errors_profile_owner_fk
  FOREIGN KEY (exam_profile_id, user_id) REFERENCES public.exam_profiles(id, user_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.mock_test_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL,
  subject_name TEXT NOT NULL CHECK (char_length(trim(subject_name)) BETWEEN 1 AND 120),
  marks_obtained NUMERIC(10,2) NOT NULL,
  total_marks NUMERIC(10,2) NOT NULL CHECK (total_marks > 0 AND marks_obtained <= total_marks),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mock_subject_test_owner_fk FOREIGN KEY (test_id, user_id)
    REFERENCES public.mock_tests(id, user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mock_subject_unique ON public.mock_test_subjects(test_id, lower(trim(subject_name)));
CREATE INDEX IF NOT EXISTS idx_mock_subject_user_test ON public.mock_test_subjects(user_id, test_id);
CREATE INDEX IF NOT EXISTS idx_mock_user_date ON public.mock_tests(user_id, test_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mock_error_filters ON public.mock_test_errors(user_id, error_type, revision_status);
CREATE INDEX IF NOT EXISTS idx_mock_error_topics ON public.mock_test_errors(user_id, subject, topic);
CREATE INDEX IF NOT EXISTS idx_mock_error_profile ON public.mock_test_errors(user_id, exam_profile_id);

ALTER TABLE public.mock_test_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own mock subjects" ON public.mock_test_subjects;
CREATE POLICY "Users manage own mock subjects" ON public.mock_test_subjects FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = test_id AND t.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own mock tests" ON public.mock_tests;
CREATE POLICY "Users manage own mock tests" ON public.mock_tests FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (exam_profile_id IS NULL OR EXISTS (
    SELECT 1 FROM public.exam_profiles p WHERE p.id = exam_profile_id AND p.user_id = auth.uid())));

DROP POLICY IF EXISTS "Users manage own mock test errors" ON public.mock_test_errors;
CREATE POLICY "Users manage own mock test errors" ON public.mock_test_errors FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id
    AND (test_id IS NULL OR EXISTS (SELECT 1 FROM public.mock_tests t WHERE t.id = test_id AND t.user_id = auth.uid()))
    AND (exam_profile_id IS NULL OR EXISTS (SELECT 1 FROM public.exam_profiles p WHERE p.id = exam_profile_id AND p.user_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.mock_tracker_timestamps() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_TABLE_NAME = 'mock_test_errors' THEN
    IF NEW.test_id IS NOT NULL THEN
      SELECT t.exam_profile_id INTO NEW.exam_profile_id FROM public.mock_tests t
        WHERE t.id = NEW.test_id AND t.user_id = NEW.user_id;
    END IF;
    IF NEW.revision_status = 'pending' THEN NEW.revised_at = NULL;
    ELSIF TG_OP = 'INSERT' THEN NEW.revised_at = coalesce(NEW.revised_at, now());
    ELSIF OLD.revision_status = 'pending' THEN NEW.revised_at = now();
    ELSE NEW.revised_at = OLD.revised_at;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mock_tests_timestamp ON public.mock_tests;
CREATE TRIGGER mock_tests_timestamp BEFORE UPDATE ON public.mock_tests FOR EACH ROW EXECUTE FUNCTION public.mock_tracker_timestamps();
DROP TRIGGER IF EXISTS mock_errors_timestamp ON public.mock_test_errors;
CREATE TRIGGER mock_errors_timestamp BEFORE INSERT OR UPDATE ON public.mock_test_errors FOR EACH ROW EXECUTE FUNCTION public.mock_tracker_timestamps();

-- One transaction saves a mock and replaces its subject rows. No partial saves.
-- SECURITY INVOKER keeps all table RLS active; auth.uid(), never a caller's JSON,
-- supplies ownership. Updates lock the parent to serialize concurrent edits.
CREATE OR REPLACE FUNCTION public.save_mock_with_subjects(p_id UUID, p_mock JSONB, p_subjects JSONB DEFAULT '[]'::jsonb)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE saved_id UUID; owner_id UUID := auth.uid();
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_subjects) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Subject scores must be an array'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.mock_tests (user_id, exam_profile_id, name, category, test_date, total_marks, marks_obtained,
      subjects, negative_marks, correct_count, wrong_count, unattempted_count, time_minutes, time_allowed_minutes, notes)
    VALUES (owner_id, (p_mock->>'exam_profile_id')::uuid, trim(p_mock->>'name'), p_mock->>'category', (p_mock->>'test_date')::date,
      (p_mock->>'total_marks')::numeric, (p_mock->>'marks_obtained')::numeric,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_mock->'subjects', '[]'::jsonb))),
      (p_mock->>'negative_marks')::numeric, (p_mock->>'correct_count')::integer, (p_mock->>'wrong_count')::integer,
      (p_mock->>'unattempted_count')::integer, (p_mock->>'time_minutes')::numeric, (p_mock->>'time_allowed_minutes')::numeric,
      coalesce(p_mock->>'notes', '')) RETURNING id INTO saved_id;
  ELSE
    UPDATE public.mock_tests SET exam_profile_id = (p_mock->>'exam_profile_id')::uuid,
      name = trim(p_mock->>'name'), category = p_mock->>'category', test_date = (p_mock->>'test_date')::date,
      total_marks = (p_mock->>'total_marks')::numeric, marks_obtained = (p_mock->>'marks_obtained')::numeric,
      subjects = ARRAY(SELECT jsonb_array_elements_text(coalesce(p_mock->'subjects', '[]'::jsonb))),
      negative_marks = (p_mock->>'negative_marks')::numeric, correct_count = (p_mock->>'correct_count')::integer,
      wrong_count = (p_mock->>'wrong_count')::integer, unattempted_count = (p_mock->>'unattempted_count')::integer,
      time_minutes = (p_mock->>'time_minutes')::numeric, time_allowed_minutes = (p_mock->>'time_allowed_minutes')::numeric,
      notes = coalesce(p_mock->>'notes', '')
    WHERE id = p_id AND user_id = owner_id RETURNING id INTO saved_id;
    IF saved_id IS NULL THEN RAISE EXCEPTION 'Mock not found or access denied'; END IF;
  END IF;
  DELETE FROM public.mock_test_subjects WHERE test_id = saved_id AND user_id = owner_id;
  INSERT INTO public.mock_test_subjects (user_id, test_id, subject_name, marks_obtained, total_marks)
    SELECT owner_id, saved_id, trim(item->>'subject_name'), (item->>'marks_obtained')::numeric, (item->>'total_marks')::numeric
    FROM jsonb_array_elements(p_subjects) item;
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_mock_with_subjects(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_mock_with_subjects(UUID, JSONB, JSONB) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_profiles, public.mock_tests, public.mock_test_errors, public.mock_test_subjects TO authenticated;
COMMIT;

-- Apply this patch in Supabase SQL Editor AFTER running supabase/mock_tests.sql.
-- Adds revision tracking to the mistake log table.
ALTER TABLE public.mock_test_errors
ADD COLUMN IF NOT EXISTS revision_status TEXT NOT NULL DEFAULT 'pending'
CHECK (revision_status IN ('pending', 'revised', 'mastered'));

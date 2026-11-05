-- ==========================================
-- UNIVERSAL MOCK TEST TRACKER
-- Separate, secure tables for each user
-- ==========================================

-- 1. EXAM PROFILES
CREATE TABLE IF NOT EXISTS public.exam_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_profiles_user
ON public.exam_profiles(user_id, created_at);


-- 2. MOCK TESTS
CREATE TABLE IF NOT EXISTS public.mock_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exam_profile_id UUID NOT NULL,

    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),

    category TEXT NOT NULL CHECK (
        category IN ('subject', 'mixed', 'full', 'pyq')
    ),

    subjects TEXT[] NOT NULL DEFAULT '{}',

    total_marks NUMERIC(10,2) NOT NULL CHECK (total_marks > 0),
    marks_obtained NUMERIC(10,2) NOT NULL CHECK (
        marks_obtained >= 0 AND marks_obtained <= total_marks
    ),

    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
    unattempted_count INTEGER NOT NULL DEFAULT 0 CHECK (unattempted_count >= 0),

    time_minutes INTEGER NOT NULL DEFAULT 0 CHECK (time_minutes >= 0),

    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT mock_tests_profile_owner_fk
    FOREIGN KEY (exam_profile_id, user_id)
    REFERENCES public.exam_profiles(id, user_id)
    ON DELETE CASCADE,

    UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_tests_user_profile_date
ON public.mock_tests(user_id, exam_profile_id, test_date DESC);


-- 3. MISTAKE / ERROR LOGS
CREATE TABLE IF NOT EXISTS public.mock_test_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    test_id UUID NOT NULL,

    question_number INTEGER CHECK (
        question_number IS NULL OR question_number > 0
    ),

    subject TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL CHECK (char_length(trim(topic)) BETWEEN 1 AND 120),

    error_type TEXT NOT NULL CHECK (
        error_type IN (
            'Conceptual mistake',
            'Calculation error',
            'Formula error',
            'Silly mistake',
            'Time management',
            'Guessing'
        )
    ),

    incorrect_approach TEXT NOT NULL DEFAULT '',
    correct_approach TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',

    revision_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (revision_status IN ('pending', 'revised', 'mastered')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT mock_test_errors_test_owner_fk
    FOREIGN KEY (test_id, user_id)
    REFERENCES public.mock_tests(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mock_errors_user_test
ON public.mock_test_errors(user_id, test_id);


-- 4. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.exam_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_test_errors ENABLE ROW LEVEL SECURITY;


-- 5. EXAM PROFILE SECURITY
DROP POLICY IF EXISTS "Users manage own exam profiles"
ON public.exam_profiles;

CREATE POLICY "Users manage own exam profiles"
ON public.exam_profiles
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- 6. MOCK TEST SECURITY
DROP POLICY IF EXISTS "Users manage own mock tests"
ON public.mock_tests;

CREATE POLICY "Users manage own mock tests"
ON public.mock_tests
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.exam_profiles p
        WHERE p.id = exam_profile_id
        AND p.user_id = auth.uid()
    )
);


-- 7. ERROR LOG SECURITY
DROP POLICY IF EXISTS "Users manage own mock test errors"
ON public.mock_test_errors;

CREATE POLICY "Users manage own mock test errors"
ON public.mock_test_errors
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
        SELECT 1
        FROM public.mock_tests t
        WHERE t.id = test_id
        AND t.user_id = auth.uid()
    )
);

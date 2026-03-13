-- Add violations column to interviews for tracking scheduling constraint violations
ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS violations jsonb;

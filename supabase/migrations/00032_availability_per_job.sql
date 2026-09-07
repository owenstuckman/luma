-- Scope interviewer availability to a job posting.
--
-- Availability was org-wide and unanchored: `/availability` rendered a generic
-- Monday-Sunday grid for whatever week the browser happened to be in, with no
-- reference to the posting anyone was actually interviewing for. Applicants,
-- meanwhile, are asked for very specific windows by the job's own
-- `availability` question (Fall 2026: Sep 9/10/11/14 evenings plus Sunday the
-- 13th, 09:00-17:00). Nothing connected the two, so a recruiter could fill in a
-- week of times that overlapped none of the slots on offer and the scheduler
-- would simply find no match.
--
-- `job_id` is NULLable on purpose. The 11 pre-existing rows (one person, March
-- 2026) predate any of this and belong to no posting; forcing a value on them
-- would mean inventing one. NULL reads as "org-wide, unanchored" and the
-- scheduler ignores it when scheduling a specific job.
ALTER TABLE public.interviewer_availability
  ADD COLUMN IF NOT EXISTS job_id bigint REFERENCES public.job_posting(id) ON DELETE CASCADE;

-- The old key would have let one person's 5pm on the 9th exist only once across
-- every posting, so offering the same hour to two concurrent jobs was a
-- constraint violation rather than the ordinary thing it is.
ALTER TABLE public.interviewer_availability
  DROP CONSTRAINT IF EXISTS interviewer_availability_org_id_user_id_date_start_time_key;

-- NULLs compare as distinct, so this does not constrain the legacy rows. That
-- is fine: the save path replaces a whole (org, user, job) set at a time, so
-- duplicates cannot accumulate through the app.
ALTER TABLE public.interviewer_availability
  ADD CONSTRAINT interviewer_availability_org_user_job_date_start_key
  UNIQUE (org_id, user_id, job_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_interviewer_availability_job
  ON public.interviewer_availability(org_id, job_id);

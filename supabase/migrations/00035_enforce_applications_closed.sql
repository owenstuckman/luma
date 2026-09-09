-- Enforce `applications_closed` in the database, not just the UI.
--
-- The apply page hides a closed posting and refuses to render the form, but the
-- submission itself goes through the browser with the anon key — so the page
-- check is a courtesy, not a control. Someone with the direct link and devtools,
-- or a stale tab left open from before intake closed, could still insert.
--
-- BEFORE INSERT only: recruiters must stay able to UPDATE applicant rows
-- (statuses, comments, review decisions) long after intake has closed.
CREATE OR REPLACE FUNCTION public.reject_closed_job_applications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_closed boolean;
  job_name text;
BEGIN
  IF NEW.job IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT applications_closed, name INTO is_closed, job_name
  FROM public.job_posting WHERE id = NEW.job;

  IF is_closed THEN
    RAISE EXCEPTION 'Applications are closed for "%"', COALESCE(job_name, NEW.job::text)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_reject_closed_job_applications ON public.applicants;
CREATE TRIGGER trigger_reject_closed_job_applications
  BEFORE INSERT ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.reject_closed_job_applications();

REVOKE ALL ON FUNCTION public.reject_closed_job_applications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_closed_job_applications() FROM anon;
REVOKE ALL ON FUNCTION public.reject_closed_job_applications() FROM authenticated;

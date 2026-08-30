-- Give interviews a real foreign key to the application they belong to.
--
-- `interviews.applicant` is the applicant's EMAIL as text. That was unambiguous
-- while an address owned exactly one application, but migration 00024 makes an
-- application per-team, so joining on the address hands every sibling row the
-- same interviews: the Astra application would display Terra's interview and
-- count it toward Astra's evaluation progress. That is precisely the conflation
-- the per-team model exists to prevent.
--
-- The `applicant` email column STAYS. The scheduler, the .ics builder and the
-- email log all still key off it, and dropping it would be a far wider change
-- than this migration should make. Readers prefer `applicant_id` and fall back
-- to the email join when it is null.

ALTER TABLE public.interviews
  ADD COLUMN IF NOT EXISTS applicant_id bigint
  REFERENCES public.applicants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_interviews_applicant_id ON public.interviews(applicant_id);

-- Backfill only where the mapping is unambiguous — exactly one applicant row
-- for that address within the org. Rows left null fall back to the email join,
-- which is correct for them precisely because they have no sibling to confuse
-- them with. Guessing on an ambiguous match would silently attach an interview
-- to the wrong team's application, which is worse than leaving it null.
UPDATE public.interviews iv
SET applicant_id = a.id
FROM public.applicants a
WHERE iv.applicant_id IS NULL
  AND a.email = iv.applicant
  AND a.org_id IS NOT DISTINCT FROM iv.org_id
  AND (
    SELECT count(*) FROM public.applicants b
    WHERE b.email = iv.applicant
      AND b.org_id IS NOT DISTINCT FROM iv.org_id
  ) = 1;

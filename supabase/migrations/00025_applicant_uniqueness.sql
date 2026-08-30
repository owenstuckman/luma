-- Replace two legacy uniqueness rules that the per-team model makes untenable
-- — and one of which was a live bug on its own.
--
--   applicants_name_key  UNIQUE (name)
--     Two applicants who share a name could never both exist, in any org, ever.
--     A second "John Smith" applying to anything was rejected at the database
--     with a constraint error the form surfaced as a generic failure. This is
--     removed outright; a person's name was never an identifier.
--
--   applicants_email_key UNIQUE (email)
--     Globally unique email meant one application per person for all time —
--     across teams, jobs and recruitment cycles. Migration 00024 makes an
--     application per-team, so an applicant to Astra and Terra legitimately has
--     two rows sharing an address, and this constraint blocked the second one.
--
-- What replaces them is the uniqueness that is actually meaningful: one
-- application per person, per job posting, per team. That still stops the real
-- problem the old constraint was groping at — a double-tapped submit button
-- creating duplicate applications — without forbidding the legitimate cases.

ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_name_key;
ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_email_key;

-- NULLS NOT DISTINCT so that an org with no teams (team_id IS NULL) still gets
-- one-application-per-job dedup; the default NULL semantics would treat every
-- such row as unique and let duplicates straight through.
--
-- lower(email) because addresses are case-insensitive in practice and
-- 'A@vt.edu' vs 'a@vt.edu' is the same person submitting twice.
--
-- CAUTION on `IF NOT EXISTS` here. When this first ran, an index of this NAME
-- already existed with a DIFFERENT definition — on raw `email` — and
-- `IF NOT EXISTS` matches on the name alone, so this statement silently did
-- nothing and left the wrong index in place. 'SPLIT-TEST@vt.edu' then inserted
-- happily alongside 'split-test@vt.edu'. The clause makes a migration
-- re-runnable; it does NOT make it corrective. If you change the definition of
-- an existing index, drop it explicitly first.
CREATE UNIQUE INDEX IF NOT EXISTS applicants_job_email_team_uniq
  ON public.applicants (job, (lower(email)), team_id)
  NULLS NOT DISTINCT;

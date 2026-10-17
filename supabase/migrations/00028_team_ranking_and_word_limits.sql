-- Team ranking and word limits:
--   * a job can cap how many teams an applicant picks, and ask them to RANK them
--   * `maxWords` on any free-text question
--
-- The team cap and the ranking are per-JOB config (`questions.team_selection`):
-- any org can set `{min, max, ranked}` on their own posting, and a job that
-- omits it keeps the original behaviour of "any number of teams, unranked".

-- Where this team sat in the applicant's preference order; 1 is first choice.
-- Null for unranked jobs and for every row created before this migration.
-- Advisory only — it never gates review, it just tells a team whether they were
-- the applicant's first pick.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS team_rank smallint;

COMMENT ON COLUMN public.applicants.team_rank IS
  'Applicant preference order for this team (1 = first choice). Null when the job is unranked.';

-- Guard the range rather than trusting the client: the form writes this from an
-- array index, so a bad value means a bug, and it should fail loudly.
ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_team_rank_range;
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_team_rank_range
  CHECK (team_rank IS NULL OR (team_rank >= 1 AND team_rank <= 10));

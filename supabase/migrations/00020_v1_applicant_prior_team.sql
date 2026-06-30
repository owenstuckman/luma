-- V1: Returning-member preference signal
-- prior_team_id is a manual override set by admins on the applicant page.
-- The scheduler treats it as a soft preference (prefer interviewers from
-- the same team), never as a hard constraint.

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS prior_team_id bigint
    REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applicants_prior_team_id
  ON public.applicants(prior_team_id);

-- Also add selected_team_ids: the teams an applicant chose to apply to.
-- Stored as a text[] of team slugs (resilient to team renames/moves; the
-- scheduler resolves slug → id when needed).
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS selected_team_slugs text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_applicants_selected_team_slugs
  ON public.applicants USING GIN (selected_team_slugs);

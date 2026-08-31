-- Archimedes 2026 Fall Recruitment, second pass:
--   * applicants pick at most TWO teams and RANK them
--   * new experience questions; "why Archimedes" replaced by "what would make
--     you a valuable member"; an optional free-form catch-all at the end
--   * a 250-word limit on every free-text answer
--
-- The team cap and the ranking are per-JOB config (`questions.team_selection`),
-- not hardcoded for Archimedes — any org can set `{min, max, ranked}` on their
-- own posting, and a job that omits it keeps the original behaviour of "any
-- number of teams, unranked".

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

-- The reworked question set for job 7 (2026 Fall Recruitment).
UPDATE public.job_posting
SET questions = '{"team_selection":{"min":1,"max":2,"ranked":true},"steps":[{"icon":"fi-br-graduation-cap","title":"Academics","questions":[{"id":"major","type":"input","title":"What is your major?","subtitle":"Include a second major or minor here if you have one.","required":true,"maxLength":120,"placeholder":"e.g. Aerospace Engineering"},{"id":"graduation_year","type":"dropdown","title":"Expected graduation year","options":["2026","2027","2028","2029","2030","Other"],"required":true,"blinded":true}]},{"icon":"fi-br-shield-check","title":"Eligibility","questions":[{"id":"astra_us_person","type":"radio","title":"Are you a U.S. citizen or permanent resident?","subtitle":"Asked only for Astra, and only affects your Astra application.","options":["Yes","No"],"required":true,"reject_if":{"op":"eq","value":"No"},"team_scope":{"teams":["astra"]}},{"id":"infinitum_age","type":"radio","title":"Are you 18 years of age or older?","subtitle":"Asked only for Infinitum, and only affects your Infinitum application.","options":["Yes","No"],"required":true,"reject_if":{"op":"eq","value":"No"},"team_scope":{"teams":["infinitum"]}}]},{"icon":"fi-br-users-alt","title":"Experience","questions":[{"id":"past_projects","type":"textarea","title":"What are some of your past group projects? How did you function in a team setting?","subtitle":"Projects from classes, clubs, jobs or personal work all count.","required":true,"maxWords":250,"maxLength":3000,"placeholder":"Tell us what you built and what your role was."},{"id":"valuable_member","type":"textarea","title":"What would make you a valuable member to one of our design teams?","subtitle":"Skills, experience, or the way you work \u2014 whatever you think matters most.","required":true,"maxWords":250,"maxLength":3000,"placeholder":"What would you bring to the team?"}]},{"icon":"fi-br-comment-heart","title":"Your Interest","questions":[{"id":"why_team","type":"textarea","title":"Why are you interested in {team}?","subtitle":"You answer this separately for every team you apply to.","required":true,"maxWords":250,"maxLength":3000,"placeholder":"What draws you to {team} specifically?","team_scope":{"per_team":true}},{"id":"anything_else","type":"textarea","title":"Is there anything else we should know or consider?","subtitle":"Optional \u2014 leave this blank if you have nothing to add.","required":false,"maxWords":250,"maxLength":3000,"placeholder":"Anything you would like us to know."}]}]}'::json
WHERE id = 7;

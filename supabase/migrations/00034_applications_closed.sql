-- Close intake without taking the posting out of the recruiter tools.
--
-- `active_flg` was doing two unrelated jobs at once: it gated the public apply
-- page AND it is what `getActiveRoles()` filters on, which is the job list
-- behind /availability, /review, /candidates, /dashboard, /schedule/full and
-- Settings → Scheduling. Flipping it to stop new applications would therefore
-- have emptied the job picker on every one of those pages mid-cycle — locking
-- recruiters out of the schedule during interview week.
--
-- It also would not have worked: /apply/[slug] filters on `active_flg`, but
-- /apply/[slug]/[job_id] — the direct link that actually gets shared — fetches
-- by id and never checked it, so anyone with the URL could still submit.
--
-- So intake gets its own flag. `active_flg` keeps meaning "this posting is live
-- in the tool"; `applications_closed` means "we are no longer taking submissions".
ALTER TABLE public.job_posting
  ADD COLUMN IF NOT EXISTS applications_closed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.job_posting.applications_closed IS
  'When true the public apply routes refuse new submissions. Independent of active_flg, which controls whether the posting appears in the recruiter job pickers.';

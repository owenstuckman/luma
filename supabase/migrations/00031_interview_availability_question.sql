-- 00031: Fall 2026 interview availability
--
-- Adds an `availability` question to Archimedes' 2026 Fall Recruitment form so
-- interview slots are collected on the application itself, rather than chased
-- over email afterwards.
--
-- The window is not a plain date span: Saturday the 12th is skipped, and the
-- Sunday block runs different hours from the weekday evenings around it. That
-- is what the `days` array is for — one entry per offered day, each carrying
-- its own `dayStart`/`dayEnd`. `stepMinutes: 60` gives the one-hour blocks.
--
-- Appended rather than rewritten: `questions` is edited by hand in Settings →
-- Jobs, and this must not stomp on anything changed there since 00028. The
-- `NOT EXISTS` guard keeps a re-run from adding the step twice.

UPDATE public.job_posting
SET questions = jsonb_set(
	questions::jsonb,
	'{steps}',
	(questions::jsonb -> 'steps') || jsonb_build_array(
		jsonb_build_object(
			'icon', 'fi-br-calendar',
			'title', 'Interview Availability',
			'questions', jsonb_build_array(
				jsonb_build_object(
					'id', 'interview_availability',
					'type', 'availability',
					'title', 'When are you available for an interview?',
					'subtitle', 'Interviews run September 9-14. Drag to select every one-hour block that works for you — the more you give us, the easier you are to schedule. Times are Eastern.',
					'required', true,
					'stepMinutes', 60,
					'days', jsonb_build_array(
						jsonb_build_object('date', '2026-09-09', 'dayStart', '17:00', 'dayEnd', '21:00'),
						jsonb_build_object('date', '2026-09-10', 'dayStart', '17:00', 'dayEnd', '21:00'),
						jsonb_build_object('date', '2026-09-11', 'dayStart', '17:00', 'dayEnd', '21:00'),
						jsonb_build_object('date', '2026-09-13', 'dayStart', '10:00', 'dayEnd', '17:00'),
						jsonb_build_object('date', '2026-09-14', 'dayStart', '17:00', 'dayEnd', '21:00')
					)
				)
			)
		)
	)
)::json
WHERE id = 7
  AND NOT EXISTS (
	SELECT 1
	FROM jsonb_array_elements(questions::jsonb -> 'steps') AS step,
	     jsonb_array_elements(step -> 'questions') AS q
	WHERE q ->> 'id' = 'interview_availability'
  );

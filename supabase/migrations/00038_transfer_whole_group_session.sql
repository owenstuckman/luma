-- A group interview transfers as a SESSION, not one applicant at a time.
--
-- Group interviews are stored one row per (applicant x interviewer), so a room
-- of six with three interviewers is eighteen rows. Handing off "an interview"
-- moved a single row, leaving the original interviewer still staffing the other
-- five candidates in the same room at the same time. Reported from the field on
-- 2026-09-10: "he tried handing it over but he could only transfer one
-- participant." One live session (MCB 210, Sep 11 18:20) had to be repaired by
-- hand.
--
-- The unit of work is a person sitting in a room for 45 minutes with a group.
-- You cannot hand over one candidate out of six, so both the hand-off and the
-- swap now move every row that person holds in that (location, start_time).
--
-- Two further bugs surfaced while fixing it, both corrected here:
--
--   * The recipient's clash check counted THE REST OF THE SAME SESSION as a
--     competing commitment, so a group hand-off refused itself.
--   * On a swap the counterpart was loaded AFTER the check that needs it, so
--     the check saw NULL and reported a false clash against the recipient's own
--     interview. The lookup now happens first.
CREATE OR REPLACE FUNCTION public.respond_to_interview_transfer(transfer_id bigint, accept boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me text; t public.interview_transfers%ROWTYPE;
  iv public.interviews%ROWTYPE; counterpart public.interviews%ROWTYPE;
  moved int; moved_back int := 0;
BEGIN
  SELECT email INTO me FROM auth.users WHERE id = auth.uid();
  IF me IS NULL THEN RETURN json_build_object('error', 'Not authenticated'); END IF;
  SELECT * INTO t FROM public.interview_transfers WHERE id = transfer_id FOR UPDATE;
  IF t.id IS NULL THEN RETURN json_build_object('error', 'Request not found'); END IF;
  IF t.status <> 'pending' THEN
    RETURN json_build_object('error', 'That request has already been ' || t.status); END IF;
  IF lower(t.to_email) <> lower(me) THEN
    RETURN json_build_object('error', 'That request was not sent to you'); END IF;

  IF NOT accept THEN
    UPDATE public.interview_transfers SET status = 'declined', responded_at = now() WHERE id = transfer_id;
    RETURN json_build_object('status', 'declined'); END IF;

  SELECT * INTO iv FROM public.interviews WHERE id = t.interview_id;
  IF iv.id IS NULL THEN
    UPDATE public.interview_transfers SET status = 'cancelled', responded_at = now() WHERE id = transfer_id;
    RETURN json_build_object('error', 'That interview no longer exists'); END IF;

  -- The offer is only valid while the person who made it still holds it (00037).
  IF lower(iv.interviewer) <> lower(t.from_email) THEN
    UPDATE public.interview_transfers SET status = 'cancelled', responded_at = now() WHERE id = transfer_id;
    RETURN json_build_object('error',
      'That interview is no longer theirs to give — it now belongs to ' || iv.interviewer); END IF;

  -- Loaded up front so the clash checks below can exclude it.
  IF t.kind = 'swap' THEN
    SELECT * INTO counterpart FROM public.interviews WHERE id = t.counterpart_interview_id;
    IF counterpart.id IS NULL THEN
      UPDATE public.interview_transfers SET status = 'cancelled', responded_at = now() WHERE id = transfer_id;
      RETURN json_build_object('error', 'The interview you offered no longer exists'); END IF;
    IF lower(counterpart.interviewer) <> lower(me) THEN
      RETURN json_build_object('error', 'The interview you offered is no longer yours'); END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.interviews x
    WHERE x.org_id = iv.org_id AND lower(x.interviewer) = lower(me)
      AND NOT (x.location = iv.location AND x.start_time = iv.start_time)
      AND NOT (counterpart.id IS NOT NULL
               AND x.location = counterpart.location AND x.start_time = counterpart.start_time)
      AND x.start_time < iv.end_time AND x.end_time > iv.start_time
  ) THEN
    RETURN json_build_object('error', 'You already have an interview at that time'); END IF;

  IF t.kind = 'swap' THEN
    IF EXISTS (
      SELECT 1 FROM public.interviews x
      WHERE x.org_id = iv.org_id AND lower(x.interviewer) = lower(t.from_email)
        AND NOT (x.location = iv.location AND x.start_time = iv.start_time)
        AND NOT (x.location = counterpart.location AND x.start_time = counterpart.start_time)
        AND x.start_time < counterpart.end_time AND x.end_time > counterpart.start_time
    ) THEN
      RETURN json_build_object('error', 'They already have an interview at that time'); END IF;

    UPDATE public.interviews SET interviewer = t.from_email
     WHERE org_id = counterpart.org_id AND location = counterpart.location
       AND start_time = counterpart.start_time AND lower(interviewer) = lower(t.to_email);
    GET DIAGNOSTICS moved_back = ROW_COUNT;
  END IF;

  UPDATE public.interviews SET interviewer = t.to_email
   WHERE org_id = iv.org_id AND location = iv.location
     AND start_time = iv.start_time AND lower(interviewer) = lower(t.from_email);
  GET DIAGNOSTICS moved = ROW_COUNT;

  UPDATE public.interview_transfers SET status = 'accepted', responded_at = now() WHERE id = transfer_id;
  RETURN json_build_object('status', 'accepted', 'kind', t.kind,
                           'rows_moved', moved, 'rows_moved_back', moved_back);
END; $$;

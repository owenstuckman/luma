-- Accepting a transfer must confirm the requester STILL owns what they offered.
--
-- Without this a stale request steals an interview from someone who never
-- agreed to anything. Sabina offers her interview to A; before A answers, the
-- interview moves to B by some other route (an accepted swap, an admin fix);
-- A then accepts and takes it from B. B is simply no longer on the schedule and
-- was never asked.
--
-- The swap branch already re-checked ownership of the counterpart. The
-- interview being GIVEN was never re-checked, because at request time it was
-- verified once and that felt sufficient — it is not, since anything can happen
-- in the gap before the recipient answers. Found by deliberately racing two
-- pending requests against the same interview.
CREATE OR REPLACE FUNCTION public.respond_to_interview_transfer(transfer_id bigint, accept boolean)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me text; t public.interview_transfers%ROWTYPE; iv public.interviews%ROWTYPE; counterpart public.interviews%ROWTYPE;
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

  -- The offer is only valid while the person who made it still holds it.
  IF lower(iv.interviewer) <> lower(t.from_email) THEN
    UPDATE public.interview_transfers SET status = 'cancelled', responded_at = now() WHERE id = transfer_id;
    RETURN json_build_object('error',
      'That interview is no longer theirs to give — it now belongs to ' || iv.interviewer);
  END IF;

  IF EXISTS (SELECT 1 FROM public.interviews x WHERE x.org_id = iv.org_id
             AND lower(x.interviewer) = lower(me) AND x.id <> iv.id
             AND NOT (t.kind = 'swap' AND x.id = t.counterpart_interview_id)
             AND x.start_time < iv.end_time AND x.end_time > iv.start_time) THEN
    RETURN json_build_object('error', 'You already have an interview at that time'); END IF;

  IF t.kind = 'swap' THEN
    SELECT * INTO counterpart FROM public.interviews WHERE id = t.counterpart_interview_id;
    IF counterpart.id IS NULL THEN
      UPDATE public.interview_transfers SET status = 'cancelled', responded_at = now() WHERE id = transfer_id;
      RETURN json_build_object('error', 'The interview you offered no longer exists'); END IF;
    IF lower(counterpart.interviewer) <> lower(me) THEN
      RETURN json_build_object('error', 'The interview you offered is no longer yours'); END IF;
    IF EXISTS (SELECT 1 FROM public.interviews x WHERE x.org_id = iv.org_id
               AND lower(x.interviewer) = lower(t.from_email) AND x.id <> iv.id AND x.id <> counterpart.id
               AND x.start_time < counterpart.end_time AND x.end_time > counterpart.start_time) THEN
      RETURN json_build_object('error', 'They already have an interview at that time'); END IF;
    UPDATE public.interviews SET interviewer = t.from_email WHERE id = counterpart.id;
  END IF;

  UPDATE public.interviews SET interviewer = t.to_email WHERE id = iv.id;
  UPDATE public.interview_transfers SET status = 'accepted', responded_at = now() WHERE id = transfer_id;
  RETURN json_build_object('status', 'accepted', 'kind', t.kind);
END; $$;

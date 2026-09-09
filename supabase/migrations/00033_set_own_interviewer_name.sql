-- Let a recruiter record their own display name.
--
-- The interview evaluation forms ask for "Interviewer (Full Name)", but nothing
-- in LUMA has ever captured one: `interviewers.name` is NULL for every row,
-- `org_members.metadata` is empty, and signup collects only an email. The form
-- therefore asks once and remembers the answer — but a plain recruiter cannot
-- write it, because `interviewers_update_admin` gates UPDATE behind
-- has_org_role(org_id, 'admin'). An RLS-blocked UPDATE matches zero rows and
-- reports success, so the write failed silently and the name never stuck.
--
-- A SECURITY DEFINER function rather than a new self-UPDATE policy: a policy
-- would let a member rewrite any column on their row, including `email` and
-- `uuid`, which are the identity the scheduler and the email log join on. This
-- touches `name` and nothing else.
CREATE OR REPLACE FUNCTION public.set_my_interviewer_name(
  target_org_id bigint,
  new_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
  trimmed text;
  updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Membership is the authorisation boundary: you may name yourself only
  -- inside an org you actually belong to.
  IF NOT public.is_org_member(target_org_id) THEN
    RETURN json_build_object('error', 'Not a member of this organization');
  END IF;

  trimmed := btrim(coalesce(new_name, ''));
  IF trimmed = '' THEN
    RETURN json_build_object('error', 'Name cannot be empty');
  END IF;
  IF length(trimmed) > 120 THEN
    RETURN json_build_object('error', 'Name is too long');
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

  -- Match on uuid where the row has been claimed, and fall back to the address
  -- for rows created by `trigger_add_account` before the link was made.
  UPDATE public.interviewers
     SET name = trimmed
   WHERE org_id = target_org_id
     AND (uuid = auth.uid() OR (uuid IS NULL AND lower(email) = lower(caller_email)));
  GET DIAGNOSTICS updated = ROW_COUNT;

  IF updated = 0 THEN
    RETURN json_build_object('error', 'No interviewer record found for you in this organization');
  END IF;

  RETURN json_build_object('name', trimmed, 'updated', updated);
END;
$$;

-- Supabase grants EXECUTE to PUBLIC on new functions, so revoke and re-grant
-- narrowly (see migration 00022 for the worked example).
REVOKE ALL ON FUNCTION public.set_my_interviewer_name(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_interviewer_name(bigint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_interviewer_name(bigint, text) TO authenticated;

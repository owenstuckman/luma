-- Signup was returning HTTP 500 for any address that already had an
-- `interviewers` row, so no account was created and no email was ever sent.
--
-- The chain, reproduced against prod:
--   1. `trigger_add_account` fires AFTER INSERT on auth.users and blindly does
--      INSERT INTO interviewers (uuid, email).
--   2. `interviewers.email` is UNIQUE. If a row already holds that address the
--      insert raises 23505, which aborts the whole signup transaction.
--   3. GoTrue returns 500 from /signup. The user row is rolled back, so the
--      confirmation email is never even attempted.
--
-- Rows get orphaned in the first place because `interviewers_uuid_fkey` is
-- ON DELETE SET DEFAULT and the default is NULL: deleting a user from
-- auth.users leaves the interviewers row behind, still holding the address.
-- The effect is that deleting an account PERMANENTLY BANS that email from
-- signing up again. Seven signups failed this way between 08-30 and 08-31.
--
-- Fix: make the trigger idempotent and let it ADOPT an existing unclaimed row.
-- Adoption beats delete-and-reinsert because an admin may legitimately have
-- pre-created an interviewer (availability, org_id) before that person ever had
-- an account — signing up should claim that row, not duplicate or destroy it.

CREATE OR REPLACE FUNCTION public.extend_account_info_on_user_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Was missing entirely, which is both a security-advisor warning and a real
-- hazard for a SECURITY DEFINER function.
SET search_path = public
AS $$
BEGIN
  -- Phone-only signups have no address; there is nothing to link.
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.interviewers (uuid, email)
  VALUES (NEW.id, lower(NEW.email))
  ON CONFLICT (email) DO UPDATE
    SET uuid = EXCLUDED.uuid
    -- Only claim a row nobody owns. If some other account already holds it,
    -- do nothing rather than stealing the link — and crucially, do not raise,
    -- because raising here is what took signup down.
    WHERE public.interviewers.uuid IS NULL;

  RETURN NEW;
END;
$$;

-- Same latent bug that migration 00025 removed from `applicants`: two people
-- called "John Smith" could never both exist. It has not bitten yet only
-- because the trigger leaves `name` NULL and NULLs don't collide — the moment
-- names get populated, signup starts 500ing again for a new reason.
ALTER TABLE public.interviewers DROP CONSTRAINT IF EXISTS interviewers_name_key;

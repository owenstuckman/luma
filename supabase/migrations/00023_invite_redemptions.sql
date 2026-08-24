-- V1: Record WHO redeemed each invite link
--
-- `org_invites.used_count` only says how many times a link was used, which is
-- fine for a single-use email invite and useless for an open link handed to a
-- group chat: "3/10 used" tells an admin nothing about which three people are
-- now in their org. This adds one row per successful redemption so the invite
-- list can name them.
--
-- The row is written inside `accept_org_invite()`, in the same transaction that
-- increments `used_count` and inserts the `org_members` row, so the count and
-- the roster can never disagree.
--
-- No backfill is possible: redemptions before this migration were never
-- recorded anywhere. Existing invites keep their `used_count` and simply show
-- no names.

CREATE TABLE IF NOT EXISTS public.org_invite_redemptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_id bigint NOT NULL REFERENCES public.org_invites(id) ON DELETE CASCADE,
  org_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Keep the audit row if the account is later deleted; email below preserves
  -- who it was.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalised on purpose: the address AT REDEMPTION TIME. A user who later
  -- changes their email shouldn't rewrite history, and a deleted account
  -- shouldn't erase it.
  email text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  -- One redemption per person per invite; the accept path already treats a
  -- repeat click as a no-op, this makes it impossible at the storage layer.
  UNIQUE (invite_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_invite_redemptions_invite ON public.org_invite_redemptions (invite_id);
CREATE INDEX IF NOT EXISTS idx_invite_redemptions_org ON public.org_invite_redemptions (org_id);

ALTER TABLE public.org_invite_redemptions ENABLE ROW LEVEL SECURITY;

-- Same audience as the invites themselves: org owners and admins.
DROP POLICY IF EXISTS "Org admins can view invite redemptions" ON public.org_invite_redemptions;
CREATE POLICY "Org admins can view invite redemptions"
  ON public.org_invite_redemptions FOR SELECT
  USING (public.has_org_role(org_id, 'admin'::org_role));

-- Supabase grants every new public table full CRUD to anon/authenticated by
-- default, so removing that is not optional — nothing but the SECURITY DEFINER
-- function below ever writes here.
REVOKE ALL ON public.org_invite_redemptions FROM anon, authenticated;
GRANT SELECT ON public.org_invite_redemptions TO authenticated;

-- ============================================
-- accept_org_invite: unchanged behaviour + a redemption row
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_org_invite(invite_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.org_invites;
  org_slug text;
  caller_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'You must be signed in to accept an invite');
  END IF;

  -- Lock the row so two simultaneous accepts can't both slip past max_uses.
  SELECT * INTO inv FROM public.org_invites WHERE token = invite_token FOR UPDATE;
  IF inv.id IS NULL THEN
    RETURN json_build_object('error', 'This invite link is not valid');
  END IF;

  SELECT slug INTO org_slug FROM public.organizations WHERE id = inv.org_id;

  IF inv.revoked_at IS NOT NULL THEN
    RETURN json_build_object('error', 'This invite has been revoked');
  END IF;
  IF inv.expires_at < now() THEN
    RETURN json_build_object('error', 'This invite has expired');
  END IF;
  IF inv.used_count >= inv.max_uses THEN
    RETURN json_build_object('error', 'This invite has already been used');
  END IF;

  SELECT lower(email) INTO caller_email FROM auth.users WHERE id = auth.uid();

  IF inv.email IS NOT NULL AND inv.email <> caller_email THEN
    RETURN json_build_object(
      'error', 'This invite was sent to ' || inv.email || '. Sign in with that address to accept it.'
    );
  END IF;

  -- Already a member: treat as success so a double-click on the link is
  -- harmless, but don't burn a use.
  IF EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = inv.org_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('success', true, 'already_member', true, 'slug', org_slug);
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, roles)
  VALUES (
    inv.org_id,
    auth.uid(),
    inv.role,
    CASE WHEN cardinality(inv.roles) > 0 THEN inv.roles ELSE ARRAY[inv.role::text] END
  );

  INSERT INTO public.org_invite_redemptions (invite_id, org_id, user_id, email)
  VALUES (inv.id, inv.org_id, auth.uid(), caller_email)
  ON CONFLICT (invite_id, user_id) DO NOTHING;

  UPDATE public.org_invites SET used_count = used_count + 1 WHERE id = inv.id;

  RETURN json_build_object('success', true, 'already_member', false, 'slug', org_slug);
END;
$$;

-- ============================================
-- Who used an org's invites
-- ============================================
-- One call per org rather than per invite: the settings panel already loads the
-- invite list in one round trip and groups these by invite_id client-side.
CREATE OR REPLACE FUNCTION public.get_invite_redemptions(target_org_id bigint)
RETURNS TABLE(
  id bigint,
  invite_id bigint,
  user_id uuid,
  email text,
  redeemed_at timestamptz,
  is_member boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin'::org_role) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.invite_id, r.user_id,
         -- Prefer the account's CURRENT address when it still exists, so the
         -- list matches the members table; fall back to the recorded one.
         COALESCE(u.email::text, r.email),
         r.redeemed_at,
         -- Redeemers can be removed from the org afterwards; say so rather
         -- than implying the roster is bigger than it is.
         EXISTS (
           SELECT 1 FROM public.org_members m
           WHERE m.org_id = target_org_id AND m.user_id = r.user_id
         )
  FROM public.org_invite_redemptions r
  LEFT JOIN auth.users u ON u.id = r.user_id
  WHERE r.org_id = target_org_id
  ORDER BY r.redeemed_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invite_redemptions(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invite_redemptions(bigint) TO authenticated;

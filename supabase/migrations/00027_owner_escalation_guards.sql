-- Close the admin -> owner privilege escalation, and the anon write surface on
-- the two tables that decide who holds power in an org.
--
-- Found by auditing the auth flows before handing a second person org admin.
-- An `admin` could reach `owner` by THREE routes, all verified against prod:
--
--   1. `update org_members set role='owner' where user_id = auth.uid()`
--      `members_update_admin` had a USING clause and NO WITH CHECK. USING only
--      constrains WHICH ROWS you may touch, never the values you write, so an
--      admin passed the check and then wrote any role they liked — including
--      demoting the real owner to viewer.
--   2. `select update_member_role(org, self, 'owner')` — the RPC blocked editing
--      a row that already WAS owner, but never blocked writing 'owner' INTO a row.
--   3. `update organizations set owner_id = auth.uid()` — same missing WITH CHECK
--      on `orgs_update_admin`.
--
-- A `recruiter` was correctly blocked on all three; the boundary only leaked at
-- admin. The shape of the fix: owners keep full control of their org, admins may
-- manage every NON-owner row but can neither create an owner nor touch one.

-- ---------------------------------------------------------------- org_members

DROP POLICY IF EXISTS members_update_admin ON public.org_members;
CREATE POLICY members_update_admin ON public.org_members
  FOR UPDATE
  -- Which rows an admin may target: anything that isn't the owner's row.
  USING (
    public.has_org_role(org_id, 'owner'::org_role)
    OR (public.has_org_role(org_id, 'admin'::org_role) AND role <> 'owner'::org_role)
  )
  -- What they may write: anything that isn't owner. `roles` is checked too so
  -- the array can't be used to smuggle owner past a future has_app_role() gate.
  WITH CHECK (
    public.has_org_role(org_id, 'owner'::org_role)
    OR (
      public.has_org_role(org_id, 'admin'::org_role)
      AND role <> 'owner'::org_role
      AND NOT ('owner' = ANY(roles))
    )
  );

DROP POLICY IF EXISTS members_insert_admin ON public.org_members;
CREATE POLICY members_insert_admin ON public.org_members
  FOR INSERT
  WITH CHECK (
    public.has_org_role(org_id, 'owner'::org_role)
    OR (
      public.has_org_role(org_id, 'admin'::org_role)
      AND role <> 'owner'::org_role
      AND NOT ('owner' = ANY(roles))
    )
  );

-- An admin could also simply DELETE the owner's membership row, which stranded
-- the org just as effectively as a demotion.
DROP POLICY IF EXISTS members_delete_admin ON public.org_members;
CREATE POLICY members_delete_admin ON public.org_members
  FOR DELETE
  USING (
    public.has_org_role(org_id, 'owner'::org_role)
    OR (public.has_org_role(org_id, 'admin'::org_role) AND role <> 'owner'::org_role)
  );

-- -------------------------------------------------------------- organizations
--
-- `owner_id` is never UPDATEd by application code (it is only set at INSERT in
-- /register; ownership transfer goes through the platform-admin RPC
-- `admin_transfer_ownership`, which is SECURITY DEFINER and so unaffected by
-- these grants). Column-level privileges are the clean way to make it
-- immutable from the client: revoke the table-wide UPDATE, then grant back
-- exactly the columns the settings panel writes.
REVOKE UPDATE ON public.organizations FROM authenticated, anon;
GRANT UPDATE (name, slug, logo_url, primary_color, secondary_color, settings, email_settings)
  ON public.organizations TO authenticated;

-- Defense in depth, mirroring what 00022 did for the invite tables: Supabase
-- grants every new public table full CRUD to anon, leaving RLS as the only
-- thing between an unauthenticated caller and the row. Nothing anon does needs
-- to write here — /register requires a session, and invite acceptance runs
-- through SECURITY DEFINER functions.
REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.org_members FROM anon;

-- ------------------------------------------------------------------- the RPCs
--
-- These are SECURITY DEFINER, so they run as the owner and RLS does not apply
-- to them. The guards above therefore have to be repeated here explicitly.
--
-- NOTE: supabase/migrations/00004 shows an UNGUARDED version of both functions.
-- That file is stale — 00006 redefined them with `org_role` parameters and an
-- admin check. These CREATE OR REPLACE statements match the LIVE signatures;
-- read the database, not 00004.

CREATE OR REPLACE FUNCTION public.update_member_role(
  target_org_id bigint,
  target_user_id uuid,
  new_role org_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin') THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  -- Existing guard: the owner's own row is off limits to an admin.
  IF EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = target_org_id AND user_id = target_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'Cannot change the owner role.');
  END IF;

  -- New guard: and an admin cannot MINT an owner either (themselves included).
  IF new_role = 'owner' AND NOT public.has_org_role(target_org_id, 'owner') THEN
    RETURN json_build_object('error', 'Only the owner can transfer ownership.');
  END IF;

  UPDATE public.org_members
  SET role = new_role
  WHERE org_id = target_org_id AND user_id = target_user_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_member_by_email(
  target_org_id bigint,
  target_email text,
  target_role org_role DEFAULT 'recruiter'::org_role
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.has_org_role(target_org_id, 'admin') THEN
    RETURN json_build_object('error', 'Not authorized');
  END IF;

  -- Matches create_org_invite's rule, which already got this right.
  IF target_role = 'owner' AND NOT public.has_org_role(target_org_id, 'owner') THEN
    RETURN json_build_object('error', 'Only the owner can grant owner access.');
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RETURN json_build_object('error', 'No user found with that email. They must sign up first.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_members WHERE org_id = target_org_id AND user_id = target_user_id
  ) THEN
    RETURN json_build_object('error', 'User is already a member of this organization.');
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (target_org_id, target_user_id, target_role);

  RETURN json_build_object('success', true, 'user_id', target_user_id);
END;
$$;

-- ------------------------------------------------------ interviewer_availability
--
-- `USING (auth.uid() = user_id)` with no membership check let ANY authenticated
-- user insert availability rows carrying an arbitrary `org_id`. They could not
-- read anything back (SELECT is gated separately), but the scheduling
-- algorithms would treat the injected rows as a real interviewer's free time.
DROP POLICY IF EXISTS "Users can manage own availability" ON public.interviewer_availability;
CREATE POLICY "Users can manage own availability"
  ON public.interviewer_availability
  FOR ALL
  USING (auth.uid() = user_id AND public.is_org_member(org_id))
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(org_id));

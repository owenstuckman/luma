-- RLS Policies + Helper Functions
-- Org-scoped access control for all tables

-- ============================================
-- Helper Functions (SECURITY DEFINER — bypass RLS)
-- ============================================

CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(check_org_id bigint, min_role org_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND role <= min_role  -- enum order: owner < admin < recruiter < viewer
  );
$$;

-- ============================================
-- Organizations Policies
-- ============================================
CREATE POLICY orgs_select_public ON public.organizations
  FOR SELECT USING (true);

CREATE POLICY orgs_insert_authed ON public.organizations
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY orgs_update_admin ON public.organizations
  FOR UPDATE USING (has_org_role(id, 'admin'));

-- ============================================
-- Org Members Policies
-- ============================================
CREATE POLICY members_select_same_org ON public.org_members
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY members_insert_admin ON public.org_members
  FOR INSERT WITH CHECK (has_org_role(org_id, 'admin'));

CREATE POLICY members_update_admin ON public.org_members
  FOR UPDATE USING (has_org_role(org_id, 'admin'));

CREATE POLICY members_delete_admin ON public.org_members
  FOR DELETE USING (has_org_role(org_id, 'admin'));

-- ============================================
-- Job Posting Policies
-- ============================================
CREATE POLICY job_posting_select_public ON public.job_posting
  FOR SELECT USING (true);

CREATE POLICY job_posting_insert_admin ON public.job_posting
  FOR INSERT WITH CHECK (has_org_role(org_id, 'admin'));

CREATE POLICY job_posting_update_admin ON public.job_posting
  FOR UPDATE USING (has_org_role(org_id, 'admin'));

CREATE POLICY job_posting_delete_admin ON public.job_posting
  FOR DELETE USING (has_org_role(org_id, 'admin'));

-- ============================================
-- Applicants Policies
-- ============================================
CREATE POLICY applicants_select_org ON public.applicants
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY applicants_insert_public ON public.applicants
  FOR INSERT WITH CHECK (true);

CREATE POLICY applicants_update_recruiter ON public.applicants
  FOR UPDATE USING (has_org_role(org_id, 'recruiter'));

CREATE POLICY applicants_delete_admin ON public.applicants
  FOR DELETE USING (has_org_role(org_id, 'admin'));

-- ============================================
-- Interviewers Policies
-- ============================================
CREATE POLICY interviewers_select_org ON public.interviewers
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY interviewers_insert_admin ON public.interviewers
  FOR INSERT WITH CHECK (has_org_role(org_id, 'admin'));

CREATE POLICY interviewers_update_admin ON public.interviewers
  FOR UPDATE USING (has_org_role(org_id, 'admin'));

CREATE POLICY interviewers_delete_admin ON public.interviewers
  FOR DELETE USING (has_org_role(org_id, 'admin'));

-- ============================================
-- Interviews Policies
-- ============================================
CREATE POLICY interviews_select_org ON public.interviews
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY interviews_insert_recruiter ON public.interviews
  FOR INSERT WITH CHECK (has_org_role(org_id, 'recruiter'));

CREATE POLICY interviews_update_recruiter ON public.interviews
  FOR UPDATE USING (has_org_role(org_id, 'recruiter'));

CREATE POLICY interviews_delete_admin ON public.interviews
  FOR DELETE USING (has_org_role(org_id, 'admin'));

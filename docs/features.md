# Features

All completed, production-ready features in LUMA.

## Application & Recruiting

| Feature | Details |
|---------|---------|
| Application form submission | All 8 question types, localStorage persistence, multi-step wizard |
| Applicant review & filtering | Search, sort, filter by status/job, bulk status updates |
| Applicant comments | Per-applicant comment threads with decision tags |
| Bulk delete | Delete selected applicants with confirmation dialog |
| Bulk email | Compose and send custom emails to selected applicants with `{name}`/`{email}` placeholders |
| Bulk comment | Add notes with decision tag to multiple applicants at once |
| CSV export | Applicants (review + admin), schedule (full schedule page, includes violations) |
| Post-interview evaluations | Star ratings, strengths/weaknesses, recommendation |

## Scheduling

| Feature | Details |
|---------|---------|
| Manual interview creation | Modal on full schedule page, saves to DB |
| Interview calendar views | Week/day/month via @schedule-x |
| Interviewer availability grid | Date/time range selection, save/load |
| Schedule conflict detection | Real-time warnings when creating overlapping interviews, violations in CSV export |
| Auto-scheduling algorithms | Greedy-first-available, round-robin, balanced-load, batch-scheduler (admin panel) |

## Email & Notifications

| Feature | Details |
|---------|---------|
| Email notifications | Template generation, preview/edit, copy, send via Resend API |
| ICS auto-attach | .ics calendar invites attached to notification emails |
| Email log viewer | Last 50 emails viewable in org settings (recipient, type, status, errors) |
| Toast notifications | Reusable toast UI for realtime events and action feedback |

## Realtime

| Feature | Details |
|---------|---------|
| Dashboard realtime | Supabase Realtime auto-refreshes applicant counts on new submissions |
| Review page realtime | New applicants appear live with toast notification, job counts refresh |
| Schedule page realtime | Interview inserts/updates/deletes reflected live with toast notifications |

## Organization & Admin

| Feature | Details |
|---------|---------|
| Multi-tenant orgs | Organizations with slug-based routing, RLS-enforced isolation |
| Org settings | Name, slug, colors, email from/reply-to, logo upload |
| Organization logo upload | Upload/remove in settings, stored in Supabase Storage `org-assets` bucket |
| Team management | Invite by email, role assign/change/remove (owner/admin/recruiter/viewer) |
| Job posting CRUD | Create, edit, toggle active, delete |
| Form builder | Add/remove/reorder steps and questions, all 8 question types |
| Admin panel | Org CRUD, user management, platform admins, analytics dashboard |

## Authentication

| Feature | Details |
|---------|---------|
| Email/password auth | Signup, login, email confirmation |
| Password reset | Forgot password flow, email link, reset confirmation page |
| Magic link auth | OTP-based magic link login via Supabase Auth |

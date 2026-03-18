# Features

All completed, production-ready features in LUMA.

## Application & Recruiting

| Feature | Details |
|---------|---------|
| Dynamic application forms | JSON-driven question engine, 8 question types, multi-step wizard |
| localStorage persistence | Form answers saved per-question, survives page refresh |
| Review & submit step | Shows all answers (including custom questions) before submission |
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
| Manual interview creation | Modal on full schedule page with conflict detection |
| Interview calendar views | Week/day/month via @schedule-x |
| Interviewer availability grid | Weekly Mon–Sun grid, click/drag selection, save/load |
| Schedule conflict detection | Real-time warnings for overlapping interviews, violations in CSV export |
| Auto-scheduling algorithms | Greedy-first-available, round-robin, balanced-load, batch-scheduler |
| Admin scheduling panel | Org selector, algorithm config, preview, apply, clear auto-scheduled |
| No-availability fallback | Applicants without availability data are matched to any open slot |
| Batch scheduler | Multi-room, multi-round scheduling for large cohorts (100+ applicants) |

## Email & Notifications

| Feature | Details |
|---------|---------|
| Email generator modal | Preview, edit, copy, and send emails per-recipient |
| Automated sending | Supabase Edge Function + Resend API |
| ICS calendar invites | Auto-attached .ics files on all notification emails |
| Email from admin panel | Send Emails button always available in scheduling tab |
| Email from review page | Bulk email with placeholders to selected applicants |
| Email log viewer | Last 50 emails viewable in org settings (recipient, type, status, errors) |
| Toast notifications | Reusable toast UI for realtime events and action feedback |

## Realtime

| Feature | Details |
|---------|---------|
| Dashboard realtime | Auto-refreshes applicant counts on new submissions |
| Review page realtime | New applicants appear live with toast notification |
| Schedule page realtime | Interview inserts/updates/deletes reflected live with toast |

## Organization & Admin

| Feature | Details |
|---------|---------|
| Multi-tenant orgs | Organizations with slug-based routing, RLS-enforced isolation |
| Org settings | Name, slug, colors, email from/reply-to, logo upload |
| Organization logo upload | Upload/remove in settings, stored in Supabase Storage `org-assets` bucket |
| Team management | Invite by email, role assign/change/remove (owner/admin/recruiter/viewer) |
| Job posting CRUD | Create, edit, toggle active, delete |
| Form builder | Add/remove/reorder steps and questions, all 8 question types |
| Admin panel | Org CRUD, user management, job postings, analytics, scheduling, platform settings |

## Authentication

| Feature | Details |
|---------|---------|
| Email/password auth | Signup, login, email confirmation |
| Password reset | Forgot password flow, email link, reset confirmation page |
| Magic link auth | OTP-based magic link login via Supabase Auth |

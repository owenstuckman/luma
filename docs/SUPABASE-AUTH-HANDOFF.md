# Supabase Auth — dashboard changes (hand-off)

**For:** whoever has admin access to the Supabase dashboard.
**Project:** `cspuessflpakiyxygcay` — <https://supabase.com/dashboard/project/cspuessflpakiyxygcay>
**Production app:** `https://luma.archimedesvt.org` (verified live, HTTP 200 on 2026-09-05)
**Time needed:** ~30 minutes, plus DNS propagation if the Resend domain isn't verified yet.

Everything in this document is a **dashboard setting** — nothing here touches the database
or requires a migration. Do the steps in order: step 3 depends on step 1, and the rate-limit
change at the end of step 2 depends on custom SMTP being on.

> ⚠️ **Deploy the app first.** The matching application changes (`src/routes/auth/*`) are
> written and verified but **not yet deployed to production**. The dashboard changes below
> are safe to make either way, but the fixes only add up once the new code is live on
> `luma.archimedesvt.org`. Confirm with Owen that the deploy has gone out before you start,
> and re-run the verification section afterwards if you get there first.

---

## Why we're doing this

Recruiter sign-in has been failing for the Archimedes org. Four separate causes were found
in the Supabase auth logs on 2026-09-05. Two are fixed in code; **the two biggest are
dashboard settings**, which is what this document covers.

| #   | Problem                                                                                                                                                                         | Fixed by                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Only **3 auth emails sent in 24h**, all from `noreply@mail.app.supabase.io` — a domain we don't own, so VT's mail filter distrusts it. The built-in mailer is also hard-capped. | **Step 2** (custom SMTP)                                                 |
| 2   | Magic links point at **`http://localhost:3000`** — every request in the logs carries that referer, so links only work on the machine that asked for one.                        | **Steps 1 and 3**                                                        |
| 3   | Emailed links arrive as `?code=` (PKCE), but the app expected `?token_hash=`. Password reset could never succeed at all.                                                        | Fixed in code — **needs deploying**                                      |
| 4   | Microsoft 365 link scanners open one-time links ~10s after send and use them up, so the real user gets "Email link is invalid or has expired".                                  | ⚠️ **Not fixed** — see [What this does not fix](#what-this-does-not-fix) |

---

## Step 1 — Point auth at the production domain

**Where:** Authentication → URL Configuration
<https://supabase.com/dashboard/project/cspuessflpakiyxygcay/auth/url-configuration>

### 1a. Site URL

Set **Site URL** to exactly:

```
https://luma.archimedesvt.org
```

No trailing slash. This is the value `{{ .SiteURL }}` resolves to in the email templates in
step 3, so getting it right here is what makes every emailed link point at production.

### 1b. Redirect URLs

The allow list decides which `redirect_to` values Supabase will honour. **Anything not on
the list is silently replaced with the Site URL** — no error is shown, which is why a wrong
value here is so hard to diagnose.

Set the list to exactly these three entries:

```
https://luma.archimedesvt.org/auth/confirm
https://luma.archimedesvt.org/auth/reset
https://luma.archimedesvt.org/invite/*
```

**Remove `http://localhost:3000` and any `*.vercel.app` entry if present.** Leaving
localhost on the list is what currently lets a developer's machine mint links that point at
their own laptop.

> **Trade-off, please read before removing localhost.** Local development against this
> production project will no longer be able to complete a magic-link or password-reset
> sign-in — the link will land on the production site instead. That is the intended
> behaviour and the right default for a live recruiting cycle. Anyone who needs auth
> working locally should sign in with an email and password, which is unaffected.

---

## Step 2 — Send auth email through Resend, not Supabase

**Where:** Project Settings → Authentication → SMTP Settings
<https://supabase.com/dashboard/project/cspuessflpakiyxygcay/settings/auth>

Today this project uses Supabase's built-in shared mailer. Supabase documents it as being
for testing only: it is rate-limited to a handful of messages per hour and sends from
`noreply@mail.app.supabase.io`. **This is the single biggest cause of "emails aren't
arriving"** — a `.edu` running Microsoft 365, as VT does, is quick to quarantine mail from
a shared sending domain nobody in the conversation controls.

**Prerequisite:** the domain `archimedesvt.org` must show **Verified** in Resend → Domains
(SPF + DKIM records published). If it doesn't, stop and do that first — mail sent before
verification will be rejected or land in spam, and you'll conclude wrongly that this step
didn't work.

Turn on **Enable Custom SMTP** and enter:

| Field        | Value                       |
| ------------ | --------------------------- |
| Sender email | `noreply@archimedesvt.org`  |
| Sender name  | `Archimedes Society`        |
| Host         | `smtp.resend.com`           |
| Port         | `465`                       |
| Username     | `resend`                    |
| Password     | the Resend API key (`re_…`) |

> The Resend API key already exists as a Supabase **Edge Function** secret
> (`RESEND_API_KEY`), used by the interview-notification function. Auth SMTP is a
> **separate** configuration and does not read that secret — you have to paste the key in
> here as well. Same key, two places.

### Then raise the rate limit

**Where:** Authentication → Rate Limits
<https://supabase.com/dashboard/project/cspuessflpakiyxygcay/auth/rate-limits>

The logs show real users hitting `over_email_send_rate_limit` ("you can only request this
after 59 seconds"). The built-in mailer forces a very low cap; once custom SMTP is on you
can raise it. Suggested: **30 emails per hour**. Leave the per-address cooldown alone — it
is a sensible anti-abuse measure, and the app shows the message to the user.

---

## Step 3 — Replace the email templates

**Where:** Authentication → Email Templates
<https://supabase.com/dashboard/project/cspuessflpakiyxygcay/auth/templates>

The default templates use `{{ .ConfirmationURL }}`, which routes through Supabase's own
`/verify` endpoint and hands back a `?code=`. The application is built around
`?token_hash=`, which is better for two reasons: it is redeemed by a single call with no
browser state, so **a link requested on a laptop still works when opened on a phone**, and
it lets the template hardcode the destination path.

Replace the body of each template below. Everything else on the page (subject lines) can
stay, though the suggested subjects are worth using.

### Magic Link

Subject: `Sign in to LUMA`

```html
<h2>Sign in to LUMA</h2>
<p>Click below to sign in to the Archimedes Society recruiting portal.</p>
<p>
	<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/private">
		Sign in to LUMA
	</a>
</p>
<p>This link works once and expires in one hour. If you didn't ask for it, ignore this email.</p>
```

### Reset Password

Subject: `Reset your LUMA password`

```html
<h2>Reset your password</h2>
<p>Click below to choose a new password for your LUMA account.</p>
<p>
	<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset">
		Choose a new password
	</a>
</p>
<p>
	This link works once and expires in one hour. If you didn't ask for it, ignore this email and your
	password will stay as it is.
</p>
```

### Confirm Signup

Not currently sent — "Confirm email" is **off** for this project, so accounts are usable the
moment they're created. Set the template anyway so it is correct if that toggle is ever
turned on.

Subject: `Confirm your LUMA account`

```html
<h2>Confirm your email</h2>
<p>
	<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/private">
		Confirm your account
	</a>
</p>
```

### Change Email Address

Subject: `Confirm your new email address`

```html
<h2>Confirm your new email address</h2>
<p>
	<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/private">
		Confirm this address
	</a>
</p>
```

> **Don't change the `type=` values.** Each one tells the app which kind of token it is
> redeeming, and a mismatch is rejected. Don't change the `next=` paths either — those are
> real routes in the app.

> **Leave the "Invite user" template alone.** LUMA does not use Supabase's built-in invite;
> team invites go through the app's own `org_invites` links under Settings → Members.

---

## Step 4 — Turn on leaked-password protection

**Where:** Authentication → Policies (or Providers → Email)

Supabase's own security advisor flags this project: **`auth_leaked_password_protection` is
disabled.** Enabling it checks new passwords against HaveIBeenPwned and rejects known-breached
ones. It costs nothing and adds no friction for a user picking a reasonable password.

---

## Verification

Do these **in order**, using a real inbox you control. Allow a minute between attempts —
the per-address cooldown is 60 seconds.

1. **Sending domain.** Resend → Domains shows `archimedesvt.org` as **Verified**.
2. **Magic link arrives.** Go to <https://luma.archimedesvt.org/auth>, choose "Email me a
   magic link", submit your address. The mail should arrive within a minute.
3. **Check the sender.** It must be from `noreply@archimedesvt.org`, **not**
   `noreply@mail.app.supabase.io`. If it's still the Supabase address, step 2 didn't take.
4. **Check the link target.** Hover or copy the link. It must start with
   `https://luma.archimedesvt.org/auth/confirm?token_hash=`. If it contains `localhost`,
   step 1 didn't take. If it contains `supabase.co/auth/v1/verify`, step 3 didn't take.
5. **Click it.** You should land signed in on the recruiter dashboard, not on an error page.
6. **Cross-device.** Request a link on a laptop, open it on a phone. This should now work —
   it could not before, and it is the clearest single sign that step 3 is correct.
7. **Password reset.** Use "Forgot password", click the link, set a new password. Before
   this work it always said "This link has expired"; it should now show the password form.

If something fails, the auth logs show exactly which stage broke:
<https://supabase.com/dashboard/project/cspuessflpakiyxygcay/logs/auth-logs>

---

## What this does not fix

**Microsoft 365 link scanners still consume one-time links.** The evidence is unambiguous
in the logs: at 02:26:43 a magic link was sent to a `@vt.edu` address; ten seconds later a
`GET /verify` from `204.111.206.152` returned 303 and **logged in successfully**; a `HEAD
/verify` arrived from `104.47.73.126` (Microsoft Exchange Online Protection); and at
02:27:05 the actual person clicked from a different IP and got `403 One-time token not
found`. The same sequence repeats at 03:25 and 03:29. The giveaway is that the successful
login and the failed click come from **different IP addresses**.

No dashboard setting prevents this, and neither does any change above — a scanner that
follows a link will always spend a single-use link. Two ways out, both needing code:

- **Email a 6-digit code instead of a link** (`{{ .Token }}` rather than `{{ .TokenHash }}`).
  A scanner cannot consume a code. This is the robust answer for `.edu` recipients on
  Microsoft 365, and it needs a code-entry screen in the app, which does not exist yet.
- **Ask recruiters to sign in with a password** rather than a magic link. Passwords are
  unaffected by all of this and work today. This is the practical short-term answer.

The application code has been changed so that a scanner-consumed link now returns the user
to the sign-in page with a plain explanation and a button to request a fresh one, instead
of a blank page reading "Login error". That makes the failure survivable, not absent — and
it only takes effect once the deploy noted at the top of this document has gone out.

---

## Two things unrelated to email

- **The recruiter invite link has expired.** Invite id 8 for the Archimedes org
  (`max_uses: 30`, only 4 used) lapsed on **2026-09-04 22:11 UTC**. Anyone handed that link
  now sees an expired-invite page. Create a fresh one in the app under
  Settings → Members → Invite links. Note the expiry picker defaults to 14 days and two
  recent invites were created with 1-day expiries — worth setting deliberately.
- **Several team members are running the app against `localhost:3000`.** Every request in
  the auth logs carries that referer, from four different residential IPs. Once step 1b is
  done their magic links will point at production, which is correct — but they should be
  using `https://luma.archimedesvt.org` directly.

---

## Rollback

Every change here is a dashboard field with no migration behind it.

- **Step 1** — put the old Site URL / redirect entries back.
- **Step 2** — switch **Enable Custom SMTP** off; the built-in mailer resumes immediately.
- **Step 3** — each template has a **Reset to default** link.
- **Step 4** — toggle it back off.

Reverting step 3 alone will re-break password reset, because the application code now
expects `token_hash`. If you need to roll back the templates, roll back the app deploy too.

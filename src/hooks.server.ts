import { createServerClient } from '@supabase/ssr'
import { type Handle, redirect, error } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public'

// In-memory rate limiter: tracks hit counts per IP per window
const rateLimitWindows = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitWindows.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitWindows.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// Periodically clean up expired entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitWindows) {
    if (now > entry.resetAt) rateLimitWindows.delete(key);
  }
}, 60_000);

const rateLimiter: Handle = async ({ event, resolve }) => {
  const { method, url } = event.request;
  const path = url.pathname;
  const ip = event.getClientAddress();

  // Auth actions: 10 attempts per 15 minutes per IP
  if (method === 'POST' && path === '/auth') {
    if (!checkRateLimit(`auth:${ip}`, 10, 15 * 60 * 1000)) {
      error(429, 'Too many login attempts. Please wait 15 minutes before trying again.');
    }
  }

  // Public application submission (apply pages POST): 5 per 10 minutes per IP
  if (method === 'POST' && path.startsWith('/apply/')) {
    if (!checkRateLimit(`apply:${ip}`, 5, 10 * 60 * 1000)) {
      error(429, 'Too many submissions. Please wait before trying again.');
    }
  }

  // Email webhook: 60 per minute per IP (Resend sends many events)
  if (method === 'POST' && path.startsWith('/api/email-webhook')) {
    if (!checkRateLimit(`webhook:${ip}`, 60, 60 * 1000)) {
      error(429, 'Rate limit exceeded.');
    }
  }

  return resolve(event);
};

const supabase: Handle = async ({ event, resolve }) => {
  /**
   * Creates a Supabase client specific to this server request.
   *
   * The Supabase client gets the Auth token from the request cookies.
   */
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      /**
       * SvelteKit's cookies API requires `path` to be explicitly set in
       * the cookie options. Setting `path` to `/` replicates previous/
       * standard behavior.
       */
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' })
        })
      },
    },
  })

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  event.locals.safeGetSession = async () => {
    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()
    if (!session) {
      return { session: null, user: null }
    }

    const {
      data: { user },
      error,
    } = await event.locals.supabase.auth.getUser()
    if (error) {
      // JWT validation has failed
      return { session: null, user: null }
    }

    return { session, user }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      /**
       * Supabase libraries use the `content-range` and `x-supabase-api-version`
       * headers, so we need to tell SvelteKit to pass it through.
       */
      return name === 'content-range' || name === 'x-supabase-api-version'
    },
  })
}

const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user

  if (!event.locals.session && event.url.pathname.startsWith('/private')) {
    redirect(303, '/auth')
  }

  if (event.locals.session && event.url.pathname === '/auth') {
    redirect(303, '/private')
  }

  return resolve(event)
}

export const handle: Handle = sequence(rateLimiter, supabase, authGuard)
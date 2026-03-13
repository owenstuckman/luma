import { redirect } from '@sveltejs/kit'

import type { Actions } from './$types'

export const actions: Actions = {
  signup: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      console.error(error)
      redirect(303, '/auth?error=' + encodeURIComponent(error.message))
    } else {
      redirect(303, '/auth?message=' + encodeURIComponent('Check your email to confirm your account.'))
    }
  },
  login: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      console.error(error)
      redirect(303, '/auth?error=' + encodeURIComponent(error.message))
    } else {
      redirect(303, '/private')
    }
  },
  resetPassword: async ({ request, url, locals: { supabase } }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${url.origin}/auth/reset`
    })
    if (error) {
      console.error(error)
      redirect(303, '/auth?error=' + encodeURIComponent(error.message))
    } else {
      redirect(303, '/auth?message=' + encodeURIComponent('Password reset link sent! Check your email.'))
    }
  },
  magicLink: async ({ request, url, locals: { supabase } }) => {
    const formData = await request.formData()
    const email = formData.get('email') as string

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${url.origin}/auth/confirm?next=/private` }
    })
    if (error) {
      console.error(error)
      redirect(303, '/auth?error=' + encodeURIComponent(error.message))
    } else {
      redirect(303, '/auth?message=' + encodeURIComponent('Magic link sent! Check your email.'))
    }
  },
  updatePassword: async ({ request, locals: { supabase } }) => {
    const formData = await request.formData()
    const password = formData.get('password') as string

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      console.error(error)
      redirect(303, '/auth/reset?error=' + encodeURIComponent(error.message))
    } else {
      redirect(303, '/auth?message=' + encodeURIComponent('Password updated successfully! You can now log in.'))
    }
  },
}
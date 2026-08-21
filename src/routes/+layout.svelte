<script>
	import { afterNavigate, invalidate } from '$app/navigation';
	import { onMount } from 'svelte';

	import {
		initAnalytics,
		capturePageview,
		identifyUser,
		resetAnalytics
	} from '$lib/analytics/posthog';

	import '../styles/luma.scss';

	let { data, children } = $props();
	let { session, supabase } = $derived(data);

	onMount(() => {
		initAnalytics();

		const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
			// Attribute recruiter-side events to a person; drop the identity on
			// logout so the next user on a shared machine isn't merged into it.
			if (event === 'SIGNED_OUT') {
				resetAnalytics();
			} else if (newSession?.user) {
				identifyUser(newSession.user.id, { email: newSession.user.email });
			}
		});

		return () => data.subscription.unsubscribe();
	});

	// SvelteKit navigates client-side, so PostHog's automatic pageview would only
	// ever fire on the first load. Capture each navigation ourselves.
	afterNavigate((nav) => {
		if (nav.to?.url) capturePageview(nav.to.url);
	});
</script>

{@render children()}

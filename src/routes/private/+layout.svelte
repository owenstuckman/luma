<script>
  /**
   * This layout exists to wrap all /private/* routes.
   * The [slug]/+layout.svelte handles org auth checks.
   * The hooks.server.ts auth guard ensures users are logged in.
   */
  let { children } = $props()
</script>

{@render children()}

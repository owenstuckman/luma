<script lang="ts">
	let { currentStep = 0 } = $props();
</script>

<div class="sidebar hide-on-small">
	<ul class="list-unstyled">
		<li class:step-selected={currentStep === 0} class:step-disabled={currentStep < 0}>
			<p class="step-sidebar"><i class="fi fi-br-shield-trust"></i>Verification</p>
		</li>
		<li class:step-selected={currentStep === 1} class:step-disabled={currentStep < 1}>
			<p class="step-sidebar"><i class="fi fi-br-file-user"></i>Personal Info</p>
		</li>
		<li class:step-selected={currentStep === 2} class:step-disabled={currentStep < 2}>
			<p class="step-sidebar"><i class="fi fi-br-employees"></i>Teams</p>
		</li>
		<li class:step-selected={currentStep === 3} class:step-disabled={currentStep < 3}>
			<p class="step-sidebar"><i class="fi fi-br-calendar-clock"></i>Availability</p>
		</li>
		<li class:step-selected={currentStep === 4} class:step-disabled={currentStep < 4}>
			<p class="step-sidebar"><i class="fi fi-br-file-edit"></i>Free Response</p>
		</li>
		<li class:step-selected={currentStep === 5} class:step-disabled={currentStep < 5}>
			<p class="step-sidebar"><i class="fi fi-br-thumbs-up-trust"></i>Review</p>
		</li>
		<li class:step-selected={currentStep === 6} class:step-disabled={currentStep < 6}>
			<p class="step-sidebar"><i class="fi fi-br-paper-plane"></i>Submit</p>
		</li>
	</ul>
</div>

<style lang="scss">
	@use '../../../styles/col.scss' as *;

	.sidebar {
		grid-area: sidebar;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 5px;
		background-color: $dark-primary;
	}
	// Same nav treatment as the recruiter and admin sidebars: muted until it's
	// the step you're on, then yellow with a left rule.
	.step-sidebar {
		display: flex;
		margin-top: 2px;
		margin-bottom: 2px;
		padding-left: 13px;
		height: 36px;
		width: 195px;
		font-weight: 500;
		align-items: center;
		justify-content: start;
		background-color: transparent;
		border: none;
		border-left: 3px solid transparent;
		border-radius: 0 $radius-sm $radius-sm 0;
		font-size: 13px;
		color: $text-muted;
		transition: all 0.15s;
		i {
			display: flex;
			align-items: center;
			font-size: 16px;
			margin-right: 15px;
		}
		&:hover {
			background-color: rgba(255, 255, 255, 0.05);
			color: white;
		}
	}
	.step-selected .step-sidebar {
		color: $yellow-primary;
		background-color: rgba(255, 200, 0, 0.08);
		border-left-color: $yellow-primary;
		font-weight: 600;
	}
	.step-disabled .step-sidebar {
		color: $text-subtle;
		&:hover {
			background-color: transparent;
			color: $text-subtle;
		}
	}
</style>

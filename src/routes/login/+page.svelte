<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let mode = $state(form?.mode ?? 'login');
	let busy = $state(false);
</script>

<svelte:head><title>{mode === 'login' ? 'Sign in' : 'Create account'}</title></svelte:head>

<main class="auth">
	<div class="mark" aria-hidden="true">✺</div>
	<h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>

	<form
		method="POST"
		action="?/{mode}"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update({ reset: false });
				busy = false;
			};
		}}
	>
		<label>
			Email
			<input name="email" type="email" autocomplete="email" required value={form?.email ?? ''} />
		</label>
		<label>
			Password
			<input
				name="password"
				type="password"
				required
				minlength={mode === 'register' ? 8 : undefined}
				autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
			/>
		</label>

		{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

		<button class="primary" disabled={busy}>
			{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
		</button>
	</form>

	{#if data.canRegister}
		<p class="switch">
			{mode === 'login' ? 'New here?' : 'Already have an account?'}
			<button class="link" onclick={() => (mode = mode === 'login' ? 'register' : 'login')}>
				{mode === 'login' ? 'Create an account' : 'Sign in'}
			</button>
		</p>
	{/if}
</main>

<style>
	.auth {
		min-height: 100dvh;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 1.25rem;
		padding: 2rem 1rem;
	}
	.mark {
		font-size: 2.5rem;
		color: var(--accent);
	}
	h1 {
		font-family: var(--serif);
		font-weight: 400;
		font-size: 2rem;
		margin: 0;
	}
	form {
		width: min(22rem, 100%);
		display: grid;
		gap: 1rem;
	}
	label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.875rem;
		color: var(--muted);
	}
	input {
		font: inherit;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		padding: 0.7rem 0.9rem;
	}
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.error {
		margin: 0;
		color: var(--danger);
		font-size: 0.875rem;
	}
	.switch {
		margin: 0;
		font-size: 0.875rem;
		color: var(--muted);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		color: var(--accent);
		cursor: pointer;
		text-decoration: underline;
	}
</style>

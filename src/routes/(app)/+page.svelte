<script>
	import { base } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import Composer from '$lib/Composer.svelte';

	let { data } = $props();
	let error = $state('');
	let busy = $state(false);

	const hour = new Date().getHours();
	const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

	async function start(content) {
		busy = true;
		error = '';
		try {
			const res = await fetch(`${base}/api/chats`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content })
			});
			if (!res.ok) throw new Error('Could not start the chat. Try again.');
			const { id } = await res.json();
			await invalidateAll();
			await goto(`${base}/chat/${id}`); // the chat page sees the unanswered message and requests the reply
		} catch (e) {
			error = e.message;
			busy = false;
		}
	}
</script>

<svelte:head><title>New chat</title></svelte:head>

<section class="home">
	<!-- <h1><span aria-hidden="true">✺</span> {greeting}, {data.user.email.split('@')[0]}</h1> -->
	<h1><span aria-hidden="true">☘</span> {greeting}, {data.user.email.split('@')[0]}</h1>
	
	<div class="box">
		<Composer onsend={start} {busy} placeholder="What's on your mind?" />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</div>
</section>

<style>
	.home {
		flex: 1;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 1.75rem;
		padding: 1rem;
	}
	h1 {
		font-family: var(--serif);
		font-weight: 400;
		font-size: clamp(1.7rem, 4vw, 2.4rem);
		margin: 0;
		text-align: center;
	}
	h1 span {
		color: var(--accent);
		margin-right: 0.3rem;
	}
	.box {
		width: min(42rem, 100%);
	}
	.error {
		color: var(--danger);
		font-size: 0.875rem;
	}
</style>

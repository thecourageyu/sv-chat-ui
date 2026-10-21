<script>
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Composer from './Composer.svelte';
	import { render } from './markdown.js';

	let { chatId, initial } = $props();

	let messages = $state(initial.map((m) => ({ role: m.role, content: m.content })));
	let busy = $state(false);
	let error = $state('');
	let scroller;
	let controller;

	async function toBottom() {
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight });
	}

	/** Send `content` (or, if empty, answer the last unanswered user message). */
	async function run(content) {
		error = '';
		busy = true;
		if (content) messages.push({ role: 'user', content });
		messages.push({ role: 'assistant', content: '' });
		const reply = messages[messages.length - 1];
		toBottom();

		controller = new AbortController();
		try {
			const res = await fetch(`/api/chats/${chatId}/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content }),
				signal: controller.signal
			});
			if (!res.ok || !res.body) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				const cut = chunk.indexOf('\u0000'); // server error marker
				if (cut >= 0) {
					reply.content += chunk.slice(0, cut);
					error = chunk.slice(cut + 1);
					break;
				}
				reply.content += chunk;
				toBottom();
			}
		} catch (e) {
			if (e.name !== 'AbortError') error = e.message;
		} finally {
			if (!reply.content) messages.pop();
			busy = false;
			controller = null;
			invalidateAll(); // refresh sidebar order
		}
	}

	onMount(() => {
		toBottom();
		if (messages.at(-1)?.role === 'user') run(''); // first message from the home page
	});
</script>

<div class="scroll" bind:this={scroller}>
	<div class="thread">
		{#each messages as m, i (i)}
			{#if m.role === 'user'}
				<div class="user"><p>{m.content}</p></div>
			{:else}
				<article class="assistant">
					<span class="spark" class:pulse={busy && i === messages.length - 1} aria-hidden="true">✺</span>
					<div class="md">
						{#if m.content}{@html render(m.content)}{:else}<span class="thinking">Thinking…</span>{/if}
					</div>
				</article>
			{/if}
		{/each}
		{#if error}
			<p class="error" role="alert">
				{error}
				{#if !busy && messages.at(-1)?.role === 'user'}
					<button onclick={() => run('')}>Retry</button>
				{/if}
			</p>
		{/if}
	</div>
</div>

<div class="dock">
	<Composer onsend={run} onstop={() => controller?.abort()} {busy} placeholder="Reply…" />
</div>

<style>
	.scroll {
		flex: 1;
		overflow-y: auto;
	}
	.thread {
		width: min(46rem, 100%);
		margin: 0 auto;
		padding: 3rem 1.25rem 1.5rem;
		display: grid;
		gap: 1.75rem;
	}
	.user {
		justify-self: end;
		max-width: 85%;
		background: var(--user);
		border-radius: 1.1rem;
		padding: 0.6rem 1rem;
	}
	.user p {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.assistant {
		display: grid;
		grid-template-columns: 1.5rem 1fr;
		gap: 0.75rem;
		font-family: var(--serif);
		font-size: 1.05rem;
		line-height: 1.65;
	}
	.assistant .md {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.spark {
		color: var(--accent);
		font-size: 1.25rem;
		line-height: 1.4;
	}
	.pulse {
		animation: spin 2.4s linear infinite;
		display: inline-block;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.thinking {
		color: var(--muted);
		font-family: var(--sans);
		font-size: 0.95rem;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0;
	}
	.error button {
		margin-left: 0.5rem;
		background: none;
		border: 1px solid currentColor;
		border-radius: 0.5rem;
		padding: 0.1rem 0.6rem;
		cursor: pointer;
	}
	.dock {
		width: min(46rem, 100%);
		margin: 0 auto;
		padding: 0 1.25rem 1.25rem;
	}
</style>

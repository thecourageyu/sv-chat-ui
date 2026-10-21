<script>
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';

	let { data, children } = $props();
	let open = $state(false);

	async function remove(id) {
		if (!confirm('Delete this chat?')) return;
		await fetch(`/api/chats/${id}`, { method: 'DELETE' });
		await invalidateAll();
		if (page.params.id === id) goto('/');
	}
</script>

<div class="shell">
	<button class="menu" aria-label="Open chat list" onclick={() => (open = true)}>☰</button>
	{#if open}<button class="scrim" aria-label="Close chat list" onclick={() => (open = false)}></button>{/if}

	<aside class:open>
		<a class="new" href="/" onclick={() => (open = false)}>＋ New chat</a>

		<nav aria-label="Chats">
			{#each data.chats as chat (chat.id)}
				<div class="row" class:active={page.params.id === chat.id}>
					<a href="/chat/{chat.id}" onclick={() => (open = false)}>{chat.title}</a>
					<button aria-label="Delete {chat.title}" onclick={() => remove(chat.id)}>✕</button>
				</div>
			{:else}
				<p class="empty">Your chats will show up here.</p>
			{/each}
		</nav>

		<footer>
			<span title={data.user.email}>{data.user.email}</span>
			<form method="POST" action="/logout"><button>Sign out</button></form>
		</footer>
	</aside>

	<main>{@render children()}</main>
</div>

<style>
	.shell {
		display: grid;
		grid-template-columns: 17.5rem 1fr;
		height: 100dvh;
	}
	aside {
		background: var(--sidebar);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 0.75rem;
		gap: 0.75rem;
	}
	.new {
		display: block;
		padding: 0.6rem 0.8rem;
		border-radius: 0.7rem;
		color: var(--accent);
		font-weight: 500;
		text-decoration: none;
	}
	.new:hover {
		background: var(--user);
	}
	nav {
		flex: 1;
		overflow-y: auto;
		display: grid;
		align-content: start;
		gap: 2px;
	}
	.row {
		display: flex;
		align-items: center;
		border-radius: 0.7rem;
	}
	.row:hover,
	.row.active {
		background: var(--user);
	}
	.row a {
		flex: 1;
		min-width: 0;
		padding: 0.5rem 0.8rem;
		color: inherit;
		text-decoration: none;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row button {
		background: none;
		border: 0;
		cursor: pointer;
		color: var(--muted);
		padding: 0.4rem 0.6rem;
		opacity: 0;
	}
	.row:hover button,
	.row button:focus-visible {
		opacity: 1;
	}
	.empty {
		color: var(--muted);
		font-size: 0.875rem;
		padding: 0 0.8rem;
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-top: 1px solid var(--border);
		padding: 0.75rem 0.4rem 0;
		font-size: 0.8rem;
		color: var(--muted);
	}
	footer span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	footer button {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	main {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.menu {
		display: none;
	}

	@media (max-width: 760px) {
		.shell {
			grid-template-columns: 1fr;
		}
		aside {
			position: fixed;
			inset: 0 auto 0 0;
			width: min(18rem, 85vw);
			z-index: 20;
			transform: translateX(-100%);
			transition: transform 0.2s;
		}
		aside.open {
			transform: none;
		}
		.scrim {
			position: fixed;
			inset: 0;
			z-index: 10;
			border: 0;
			background: rgb(0 0 0 / 0.35);
		}
		.menu {
			display: block;
			position: fixed;
			top: 0.6rem;
			left: 0.6rem;
			z-index: 5;
			background: var(--bg);
			border: 1px solid var(--border);
			border-radius: 0.6rem;
			padding: 0.3rem 0.6rem;
			cursor: pointer;
		}
	}
</style>

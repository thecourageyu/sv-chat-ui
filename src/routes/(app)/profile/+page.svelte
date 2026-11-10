<script>
	import { env } from '$env/dynamic/public';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	let editing = $state(null); // { id: number|null, name: string, content: string, isActive: boolean }
	let saving = $state(false);
	let error = $state('');

	function fmt(ts) {
		return new Date(ts * 1000).toLocaleString();
	}

	function openNew() {
		editing = { id: null, name: '', content: '', isActive: false };
		error = '';
	}

	function openEdit(p) {
		editing = { id: p.id, name: p.name, content: p.content, isActive: !!p.is_active };
		error = '';
	}

	function closeEditor() {
		if (saving) return;
		editing = null;
		error = '';
	}

	async function saveEditor() {
		if (!editing) return;
		if (!editing.name.trim()) {
			error = 'Name cannot be empty.';
			return;
		}
		saving = true;
		error = '';
		try {
			if (editing.id == null) {
				const res = await fetch(`${base}/api/profiles`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: editing.name.trim(), content: editing.content, isActive: editing.isActive })
				});
				const body = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(body.error ?? body.message ?? `Create failed (${res.status})`);
			} else {
				const res = await fetch(`${base}/api/profiles/${editing.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ name: editing.name.trim(), content: editing.content, isActive: editing.isActive })
				});
				const body = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(body.error ?? body.message ?? `Save failed (${res.status})`);
			}
			editing = null;
			await invalidateAll();
		} catch (e) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	async function activate(id) {
		const res = await fetch(`${base}/api/profiles/activate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			error = body.error ?? body.message ?? `Activate failed (${res.status})`;
			return;
		}
		await invalidateAll();
	}

	async function remove(id) {
		if (!confirm('Delete this AI profile?')) return;
		const res = await fetch(`${base}/api/profiles/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			error = body.error ?? body.message ?? `Delete failed (${res.status})`;
			return;
		}
		await invalidateAll();
	}
</script>

<svelte:head><title>AI Profile</title></svelte:head>

<section class="profile">
	<h1><span aria-hidden="true">{env.PUBLIC_AI_PROFILE_SYMBOL ?? '☀'}</span> AI Profile</h1>
	<p class="sub">設定 AI 助理的個性與背景（作為 system prompt 的 ai_profile），勾選「使用中」來套用。</p>

	<div class="head">
		<button class="add" onclick={openNew}>＋ New profile</button>
	</div>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	{#each data.profiles as p (p.id)}
		<article class="card" class:active={p.is_active}>
			<div class="meta">
				<span class="name">{p.name}</span>
				{#if p.is_active}<span class="badge">使用中</span>{/if}
				<span class="times">Updated {fmt(p.updated_at)}</span>
			</div>
			<pre class="content">{p.content || '—'}</pre>
			<div class="actions">
				<button class="edit" title="Edit profile" aria-label="Edit profile" onclick={() => openEdit(p)}>
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
				</button>
				<button class="del" title="Delete profile" aria-label="Delete profile" onclick={() => remove(p.id)}>
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
				</button>
				{#if !p.is_active}
					<button class="activate" onclick={() => activate(p.id)}>設為使用中</button>
				{/if}
			</div>
		</article>
	{:else}
		<p class="empty">No profiles yet. Create one to customise the assistant.</p>
	{/each}
</section>

{#if editing}
	<div class="modal" role="dialog" aria-modal="true">
		<div class="modal-card">
			<h2>{editing.id ? 'Edit' : 'New'} profile</h2>
			<label class="field">
				<span>Name</span>
				<input bind:value={editing.name} placeholder="AI Profile" />
			</label>
			<label class="field">
				<span>Content</span>
				<textarea bind:value={editing.content} placeholder="Describe the assistant's persona, tone, and background…"></textarea>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={editing.isActive} />
				<span>使用中（作為 ai_profile 套用）</span>
			</label>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<div class="modal-actions">
				<button onclick={closeEditor} disabled={saving}>Cancel</button>
				<button class="primary" onclick={saveEditor} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.profile {
		flex: 1;
		overflow-y: auto;
		padding: 2.5rem clamp(1rem, 4vw, 3rem);
		max-width: 60rem;
		margin: 0 auto;
		width: 100%;
	}
	h1 {
		font-family: var(--serif);
		font-weight: 400;
		font-size: 1.7rem;
		margin: 0 0 0.5rem;
	}
	h1 span {
		color: var(--accent);
		margin-right: 0.3rem;
	}
	.sub {
		color: var(--muted);
		font-size: 0.9rem;
		margin: 0 0 1.5rem;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}
	.add {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.3rem 0.8rem;
		color: var(--accent);
		cursor: pointer;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
	}
	.card {
		position: relative;
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		padding: 0.9rem 1rem;
		padding-right: 10rem;
		margin-bottom: 0.8rem;
	}
	.card.active {
		border-color: var(--accent);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
		color: var(--muted);
		margin-bottom: 0.4rem;
	}
	.name {
		font-weight: 600;
		color: inherit;
		font-size: 0.9rem;
	}
	.badge {
		background: var(--accent);
		color: var(--bg);
		border-radius: 0.4rem;
		padding: 0.05rem 0.45rem;
		font-size: 0.7rem;
	}
	.times {
		margin-left: auto;
	}
	.content {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: inherit;
		font-size: 0.9rem;
		line-height: 1.6;
		margin: 0;
		max-height: 16rem;
		overflow-y: auto;
	}
	.actions {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		gap: 0.2rem;
		align-items: center;
		opacity: 0;
	}
	.card:hover .actions,
	.actions:focus-within {
		opacity: 1;
	}
	.edit,
	.del {
		display: grid;
		place-items: center;
		background: none;
		border: 0;
		color: var(--muted);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.4rem;
		line-height: 0;
	}
	.del:hover {
		color: var(--danger);
		background: var(--user);
	}
	.edit:hover {
		color: var(--accent);
		background: var(--user);
	}
	.activate {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.3rem 0.6rem;
		font-size: 0.75rem;
		color: inherit;
		cursor: pointer;
	}
	.activate:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.empty {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.modal {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.4);
		display: grid;
		place-items: center;
		z-index: 30;
		padding: 1rem;
	}
	.modal-card {
		width: min(36rem, 100%);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 0.9rem;
		padding: 1.25rem;
		display: grid;
		gap: 0.9rem;
	}
	.modal-card h2 {
		font-size: 0.95rem;
		color: var(--muted);
		font-weight: 500;
		margin: 0;
	}
	.field {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.field input,
	.field textarea {
		background: var(--bg);
		color: inherit;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.5rem 0.7rem;
		font: inherit;
		line-height: 1.5;
	}
	.field textarea {
		min-height: 10rem;
		resize: vertical;
	}
	.field input:focus,
	.field textarea:focus {
		outline: 1px solid var(--accent);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: inherit;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.modal-actions button {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.45rem 1rem;
		color: inherit;
		cursor: pointer;
	}
	.modal-actions button.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--bg);
	}
	.modal-actions button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	@media (max-width: 760px) {
		.card {
			padding-right: 1rem;
		}
		.actions {
			position: static;
			opacity: 1;
			margin-top: 0.5rem;
		}
	}
</style>
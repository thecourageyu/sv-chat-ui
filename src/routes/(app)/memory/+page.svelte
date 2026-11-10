<script>
	import { env } from '$env/dynamic/public';
	import { base } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { data } = $props();

	let selected = $state(page.url.searchParams.get('chat') ?? data.chats[0]?.id ?? '');
	let busy = $state('');
	let result = $state(null); // { title, lines: string[] }
	let error = $state('');

	// Editor modal state: { kind: 'summary'|'memory', id?: number, content: string, at?: string }
	let editing = $state(null);
	let saving = $state(false);

	function fmt(ts) {
		const d = new Date(ts * 1000);
		return d.toLocaleString();
	}

	async function summarize() {
		if (!selected) return;
		busy = 'summarize';
		error = '';
		result = null;
		try {
			const res = await fetch(`${base}/api/chats/${selected}/summarize`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? body.message ?? `Summarise failed (${res.status})`);
			result = { title: 'Summary', lines: [body.summary] };
			await invalidateAll();
		} catch (e) {
			error = e.message;
		} finally {
			busy = '';
		}
	}

	async function extract() {
		if (!selected) return;
		busy = 'extract';
		error = '';
		result = null;
		try {
			const res = await fetch(`${base}/api/chats/${selected}/memories`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? body.message ?? `Memory extraction failed (${res.status})`);
			result = { title: `Extracted ${body.memories?.length ?? 0} memories`, lines: (body.memories ?? []).map((m) => m.content) };
			await invalidateAll();
		} catch (e) {
			error = e.message;
		} finally {
			busy = '';
		}
	}

	async function removeSummary(id) {
		if (!confirm('Delete this summary?')) return;
		const res = await fetch(`${base}/api/summaries/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			error = body.error ?? body.message ?? `Delete failed (${res.status})`;
			return;
		}
		await invalidateAll();
	}

	async function removeMemory(id) {
		if (!confirm('Delete this memory?')) return;
		const res = await fetch(`${base}/api/memories/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			error = body.error ?? body.message ?? `Delete failed (${res.status})`;
			return;
		}
		await invalidateAll();
	}

	function openNew(kind) {
		editing = { kind, id: null, content: '', at: toLocalInput(Date.now()) };
	}

	function openEdit(kind, id, content, createdAt) {
		editing = { kind, id, content, at: toLocalInput(createdAt * 1000) };
	}

	function closeEditor() {
		if (saving) return;
		editing = null;
		error = '';
	}

	// Convert a millis timestamp into the datetime-local input's value (local time).
	function toLocalInput(ms) {
		const d = new Date(ms);
		const pad = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	async function saveEditor() {
		if (!editing) return;
		const content = editing.content.trim();
		if (!content) {
			error = 'Content cannot be empty.';
			return;
		}
		saving = true;
		error = '';
		try {
			const path = editing.kind === 'summary' ? `${base}/api/summaries` : `${base}/api/memories`;
			// datetime-local value is local time; convert to unix seconds (UTC).
			const createdAt = editing.at ? Math.floor(new Date(editing.at).getTime() / 1000) : null;
			const body = editing.kind === 'summary'
				? { content, id: editing.id, createdAt, chatId: editing.id ? undefined : (selected || null) }
				: { content, id: editing.id, createdAt };
			const res = await fetch(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const resp = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(resp.error ?? resp.message ?? `Save failed (${res.status})`);
			editing = null;
			await invalidateAll();
		} catch (e) {
			error = e.message;
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Memory & Summaries</title></svelte:head>

<section class="memory">
	<h1><span aria-hidden="true">{env.PUBLIC_MEMORY_SYMBOL ?? '𖦹'}</span> Memory &amp; Summaries</h1>

	<div class="controls">
		<label>
			Chat
			<select bind:value={selected}>
				{#each data.chats as chat (chat.id)}
					<option value={chat.id}>{chat.title}</option>
				{/each}
			</select>
		</label>

		<button onclick={summarize} disabled={busy !== '' || !selected}>
			{busy === 'summarize' ? 'Summarising…' : 'Summarise (today)'}
		</button>
		<button onclick={extract} disabled={busy !== '' || !selected}>
			{busy === 'extract' ? 'Extracting…' : 'Extract memories (7 days)'}
		</button>
	</div>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}

	{#if result}
		<div class="result">
			<h2>{result.title}</h2>
			{#each result.lines as line, i (i)}
				<p class="line">{line || '—'}</p>
			{/each}
		</div>
	{/if}

	<div class="columns">
		<div>
			<div class="head">
				<h2>Recent summaries</h2>
				<button class="add" onclick={() => openNew('summary')}>＋ New</button>
			</div>
			{#each data.summaries as s (s.id)}
				<article class="card">
					<div class="meta">{s.chat_id ? s.chat_id.slice(0, 8) + '…' : 'rolling'} · {fmt(s.created_at)}</div>
					<p class="line">{s.content || '—'}</p>
					<div class="actions">
						<button class="edit" title="Edit summary" aria-label="Edit summary" onclick={() => openEdit('summary', s.id, s.content, s.created_at)}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
						</button>
						<button class="del" title="Delete summary" aria-label="Delete summary" onclick={() => removeSummary(s.id)}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
						</button>
					</div>
				</article>
			{:else}
				<p class="empty">No summaries yet.</p>
			{/each}
		</div>

		<div>
			<div class="head">
				<h2>Recent memories</h2>
				<button class="add" onclick={() => openNew('memory')}>＋ New</button>
			</div>
			{#each data.memories as m (m.id)}
				<article class="card">
					<div class="meta">{fmt(m.created_at)}</div>
					<p class="line">{m.content}</p>
					<div class="actions">
						<button class="edit" title="Edit memory" aria-label="Edit memory" onclick={() => openEdit('memory', m.id, m.content, m.created_at)}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
						</button>
						<button class="del" title="Delete memory" aria-label="Delete memory" onclick={() => removeMemory(m.id)}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
						</button>
					</div>
				</article>
			{:else}
				<p class="empty">No memories yet.</p>
			{/each}
		</div>
	</div>
</section>

{#if editing}
	<div class="modal" role="dialog" aria-modal="true">
		<div class="modal-card">
			<h2>{editing.id ? 'Edit' : 'New'} {editing.kind === 'summary' ? 'summary' : 'memory'}</h2>
			<textarea bind:value={editing.content} placeholder={editing.kind === 'summary' ? 'Summary content…' : 'Memory content…'}></textarea>
			<label class="field">
				<span>Time</span>
				<input type="datetime-local" bind:value={editing.at} />
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
	.memory {
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
		margin: 0 0 1.5rem;
	}
	h1 span {
		color: var(--accent);
		margin-right: 0.3rem;
	}
	h2 {
		font-size: 0.95rem;
		color: var(--muted);
		font-weight: 500;
		margin: 0 0 0.75rem;
	}
	.controls {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1.25rem;
	}
	.controls label {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	select {
		background: var(--bg);
		color: inherit;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.45rem 0.6rem;
		max-width: 16rem;
	}
	.controls button {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.5rem 0.9rem;
		color: var(--accent);
		cursor: pointer;
	}
	.controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
	}
	.result {
		border: 1px solid var(--border);
		border-radius: 0.8rem;
		padding: 1rem 1.25rem;
		margin-bottom: 2rem;
		background: var(--sidebar);
	}
	.result h2 {
		margin-bottom: 0.5rem;
	}
	.line {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0.25rem 0;
		font-size: 0.95rem;
		line-height: 1.6;
	}
	.columns {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}
	@media (max-width: 760px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.head h2 {
		margin: 0;
	}
	.add {
		background: none;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.15rem 0.6rem;
		font-size: 0.8rem;
		color: var(--muted);
		cursor: pointer;
	}
	.add:hover {
		color: var(--accent);
		border-color: var(--accent);
	}
	.card {
		position: relative;
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		padding: 0.75rem 1rem;
		padding-right: 3.5rem;
		margin-bottom: 0.75rem;
	}
	.meta {
		font-size: 0.75rem;
		color: var(--muted);
		margin-bottom: 0.25rem;
	}
	.actions {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		display: flex;
		gap: 0.15rem;
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
	.empty {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.card .line {
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
		width: min(32rem, 100%);
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 0.9rem;
		padding: 1.25rem;
		display: grid;
		gap: 0.9rem;
	}
	.modal-card h2 {
		margin: 0;
	}
	.modal-card textarea {
		width: 100%;
		min-height: 8rem;
		resize: vertical;
		background: var(--bg);
		color: inherit;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.6rem 0.75rem;
		font: inherit;
		line-height: 1.5;
	}
	.modal-card textarea:focus {
		outline: 1px solid var(--accent);
	}
	.field {
		display: grid;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.field input {
		background: var(--bg);
		color: inherit;
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 0.45rem 0.6rem;
		font: inherit;
	}
	.field input:focus {
		outline: 1px solid var(--accent);
	}
	.modal-card .error {
		margin: 0;
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
</style>
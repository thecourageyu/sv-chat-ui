<script>
	let { onsend, onstop, busy = false, placeholder = 'Message…' } = $props();
	let value = $state('');
	let el;

	function resize() {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, 220) + 'px';
	}
	function submit() {
		const text = value.trim();
		if (!text || busy) return;
		value = '';
		queueMicrotask(resize);
		onsend(text);
	}
	function keydown(e) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			submit();  // 按 Enter 發送（但按 Shift+Enter 換行，且避開中文輸入法選字中的 Enter)
		}
	}
</script>

<div class="composer">
	<textarea
		bind:this={el}
		bind:value
		oninput={resize}
		onkeydown={keydown}
		rows="1"
		{placeholder}
		aria-label="Message"
	></textarea>
	{#if busy}
		<button class="send" onclick={onstop} aria-label="Stop generating">■</button>
	{:else}
		<button class="send" onclick={submit} disabled={!value.trim()} aria-label="Send message">↑</button>
	{/if}
</div>

<style>
	.composer {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 1.25rem;
		padding: 0.6rem 0.6rem 0.6rem 1.1rem;
		box-shadow: 0 2px 14px rgb(0 0 0 / 0.06);
	}
	.composer:focus-within {
		border-color: var(--accent);
	}
	textarea {
		flex: 1;
		resize: none;
		border: 0;
		outline: 0;
		background: none;
		font: inherit;
		color: var(--text);
		padding: 0.4rem 0;
		max-height: 220px;
	}
	.send {
		flex: none;
		width: 2.2rem;
		height: 2.2rem;
		border: 0;
		border-radius: 0.65rem;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 1.1rem;
		cursor: pointer;
	}
	.send:disabled {
		opacity: 0.35;
		cursor: default;
	}
</style>

<script>
	import Chat from '$lib/Chat.svelte';
	let { data } = $props();
</script>

<svelte:head><title>{data.chat.title}</title></svelte:head>

<!-- re-mount when switching chats so local state resets -->
{#key data.chat.id}
	<Chat chatId={data.chat.id} initial={data.messages} />
{/key}

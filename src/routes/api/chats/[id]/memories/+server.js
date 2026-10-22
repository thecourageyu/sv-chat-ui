import { json, error } from '@sveltejs/kit';
import { getChat, getMessages, getLatestSummary } from '$lib/server/db.js';
import { extractAndStoreMemories } from '$lib/server/memory.js';

/**
 * POST /api/chats/:id/memories
 * Extract long-term memories from this chat and store them (with embeddings).
 * Uses the chat's latest stored summary when present, otherwise the raw messages.
 * Returns { memories: [{ id, content }] }.
 */
export async function POST({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');

	const messages = getMessages(chat.id);
	if (!messages.length) error(400, 'Nothing to extract memories from in this chat.');

	// Prefer a stored summary (already distilled); fall back to the raw transcript.
	const latest = getLatestSummary(locals.user.id, 'chat', chat.id);
	const text = latest?.content
		? latest.content
		: messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');

	const memories = await extractAndStoreMemories(text, locals.user.id, latest?.id ?? null);
	return json({ memories }, { status: 201 });
}
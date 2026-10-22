import { json, error } from '@sveltejs/kit';
import { getChat, getSummariesSince, getLastUserMessage } from '$lib/server/db.js';
import { extractAndStoreMemories, buildContext } from '$lib/server/memory.js';

const DAY = 24 * 60 * 60;

/**
 * POST /api/chats/:id/memories
 * Extract long-term memories from this user's chat summaries of the last 7 days
 * and store them (with embeddings). The 10 most similar summaries + 1 memory for
 * the latest question are passed to the LLM as extra body keys.
 * Returns { memories: [{ id, content }] }.
 */
export async function POST({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');

	const since = Math.floor(Date.now() / 1000) - 7 * DAY;
	const summaries = getSummariesSince(locals.user.id, since);
	if (!summaries.length) error(400, 'No chat summaries for this user in the last 7 days.');

	const text = summaries.map((s) => s.content).join('\n\n');

	const context = await buildContext(locals.user.id, getLastUserMessage(chat.id));
	const memories = await extractAndStoreMemories(text, locals.user.id, null, context);
	return json({ memories }, { status: 201 });
}
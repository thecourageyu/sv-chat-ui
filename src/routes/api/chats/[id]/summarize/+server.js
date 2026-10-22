import { json, error } from '@sveltejs/kit';
import { getChat, getMessagesInChatSince, getLastUserMessage } from '$lib/server/db.js';
import { summarizeAndStore, buildContext } from '$lib/server/memory.js';

/**
 * POST /api/chats/:id/summarize
 * Summarise today's messages in this chat (UTC) and store the summary (with its
 * embedding). The 10 most similar summaries + 1 memory for the latest question
 * are passed to the LLM as extra body keys.
 * Returns { summary, summaryId }.
 */
export async function POST({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');

	// Start of today (UTC) — "今日的對話" = the current calendar day's messages.
	const now = new Date();
	const since = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
	const messages = getMessagesInChatSince(chat.id, since);
	if (!messages.length) error(400, 'Nothing to summarise in this chat for today.');

	const context = await buildContext(locals.user.id, getLastUserMessage(chat.id));
	const result = await summarizeAndStore(messages, locals.user.id, chat.id, context);
	return json(result, { status: 201 });
}
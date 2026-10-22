import { json, error } from '@sveltejs/kit';
import { getChat, getMessages } from '$lib/server/db.js';
import { summarizeAndStore } from '$lib/server/memory.js';

/**
 * POST /api/chats/:id/summarize
 * Summarise the chat and store the summary (with its embedding).
 * Returns { summary, summaryId }.
 */
export async function POST({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');

	const messages = getMessages(chat.id);
	if (!messages.length) error(400, 'Nothing to summarise in this chat.');

	const result = await summarizeAndStore(messages, locals.user.id, chat.id);
	return json(result, { status: 201 });
}
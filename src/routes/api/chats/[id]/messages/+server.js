import { error } from '@sveltejs/kit';
import { getChat, getMessages, addMessage } from '$lib/server/db.js';
import { streamReply } from '$lib/server/llm.js';

/**
 * Send a message and stream the model's reply as plain text.
 * Body: { content? } — omit content to (re)generate a reply to the last user message.
 * If the model fails mid-stream, the stream ends with "\u0000<error message>".
 */
export async function POST({ params, request, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');

	const { content } = await request.json().catch(() => ({}));
	const text = typeof content === 'string' ? content.trim() : '';
	if (text) addMessage(chat.id, 'user', text);

	const history = getMessages(chat.id);
	if (history.at(-1)?.role !== 'user') error(400, 'Nothing to reply to');

	const enc = new TextEncoder();
	let cancelled = false;
	const ac = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			let full = '';
			try {
				for await (const chunk of streamReply(history, ac.signal)) {
					full += chunk;
					if (!cancelled) controller.enqueue(enc.encode(chunk));
				}
			} catch (e) {
				if (!cancelled) controller.enqueue(enc.encode('\u0000' + (e?.message ?? 'Something went wrong')));
			} finally {
				if (full.trim()) addMessage(chat.id, 'assistant', full);
				if (!cancelled) controller.close();
			}
		},
		cancel() {
			cancelled = true;
			ac.abort(); // user pressed Stop: keep what was generated so far
		}
	});

	return new Response(stream, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' }
	});
}

import { error } from '@sveltejs/kit';
import { getChat, getMessages, addMessage, getLatestSummary } from '$lib/server/db.js';
import { streamReply } from '$lib/server/llm.js';
import { retrieveMemories, retrieveSimilarSummaries } from '$lib/server/memory.js';

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
				let suffix = '';
				let similarSummaries = [];
				let rollingSummary = null;
				try {
					const lastUser = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
					const memories = await retrieveMemories(locals.user.id, lastUser, 5);
					if (memories.length) {
						suffix =
							'Relevant information you remember about the user (use it if helpful):\n' +
							memories.map((m) => `- ${m.content}`).join('\n');
					}
					// Passed to the LLM gateway as raw keys (not baked into the
					// prompt here) so it can rebuild the context itself.
					similarSummaries = await retrieveSimilarSummaries(locals.user.id, lastUser, 10);
					const rolling = getLatestSummary(locals.user.id, 'rolling');
					rollingSummary = rolling?.content ?? null;
				} catch {
					// Context retrieval is best-effort: never block a reply on it.
				}

				for await (const chunk of streamReply(history, ac.signal, { systemSuffix: suffix, similarSummaries, rollingSummary })) {
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

import { complete } from './llm.js';
import { embedTexts } from './embeddings.js';
import { saveSummary, saveMemory, searchMemories } from './db.js';

/**
 * Chat summarisation + long-term memory extraction.
 *
 * The actual summarisation/extraction text is produced by the configured LLM
 * (Anthropic or OpenAI, same style as streamReply). Vector embeddings come from
 * your embedding API (see embeddings.js for its spec).
 */

export const SUMMARY_MAX = 2000;
const CONTEXT_LIMIT = 16000;

/**
 * Summarise a conversation into a single self-contained paragraph.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 */
export async function summarizeChat(messages) {
	const transcript = messages
		.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
		.join('\n\n')
		.slice(-CONTEXT_LIMIT);

	const text = await complete([
		{
			role: 'system',
			content:
				'You produce concise, self-contained summaries of conversations. Preserve key facts, decisions, preferences, and anything worth remembering later. Write in third person, present tense, as plain statements.'
		},
		{
			role: 'user',
			content: `Summarise the following conversation into a single paragraph (at most ${SUMMARY_MAX} characters). Output only the summary.\n\n${transcript}`
		}
	]);

	return text.slice(0, SUMMARY_MAX);
}

/**
 * Extract durable, long-term facts about the user from a summary.
 * Returns an array of short standalone statements (one per fact).
 * @param {string} summary
 */
export async function extractMemories(summary) {
	const text = await complete([
		{
			role: 'system',
			content:
				'You extract durable, long-term facts about a user from conversation summaries. Output each fact on its own line as a short standalone statement. Include only stable facts (identity, preferences, goals, constraints) — not transient details or anything already obvious from the conversation.'
		},
		{
			role: 'user',
			content: `Extract the long-term facts about the user from this summary. One per line, no bullets, no numbering.\n\n${summary}`
		}
	]);

	return text
		.split('\n')
		.map((line) => line.replace(/^[-*\s\d.)]+/, '').trim())
		.filter((line) => line.length > 3);
}

/**
 * Summarise a chat and persist the summary (with its embedding) to SQLite.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 * @param {number} userId
 * @param {string} chatId
 */
export async function summarizeAndStore(messages, userId, chatId) {
	const summary = await summarizeChat(messages);
	const [embedding] = await embedTexts([summary]);
	const summaryId = saveSummary(userId, chatId, summary, 'chat', embedding);
	return { summary, summaryId };
}

/**
 * Extract long-term memories from `text` and persist each (with its embedding).
 * @param {string} text - a summary or transcript to mine for memories
 * @param {number} userId
 * @param {number|null} sourceSummaryId
 */
export async function extractAndStoreMemories(text, userId, sourceSummaryId = null) {
	const facts = await extractMemories(text);
	const memories = [];
	for (const fact of facts) {
		const [embedding] = await embedTexts([fact]);
		const id = saveMemory(userId, fact, sourceSummaryId, embedding);
		memories.push({ id, content: fact });
	}
	return memories;
}

/**
 * Retrieve the most relevant memories for a query via cosine similarity.
 * @param {number} userId
 * @param {string} query
 * @param {number} limit
 */
export async function retrieveMemories(userId, query, limit = 5) {
	if (!query.trim()) return [];
	const [embedding] = await embedTexts([query]);
	if (!embedding) return [];
	return searchMemories(userId, embedding, limit).map((row) => ({
		id: row.id,
		content: row.content,
		similarity: Math.max(0, 1 - row.distance / 2) // cosine distance 0..2 → 1..0
	}));
}
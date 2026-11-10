import { listSummaries, listMemories } from '$lib/server/db.js';

/**
 * Data for the Memory page: recent summaries and memories for display.
 * `chats` comes from the (app) layout; only add page-specific data here.
 */
export function load({ locals }) {
	return {
		summaries: listSummaries(locals.user.id, 10),
		memories: listMemories(locals.user.id, 10)
	};
}
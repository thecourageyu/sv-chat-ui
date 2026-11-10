import { json, error } from '@sveltejs/kit';
import { deleteSummary } from '$lib/server/db.js';

/** DELETE /api/summaries/:id — remove one summary (and its vector row). */
export function DELETE({ params, locals }) {
	const ok = deleteSummary(Number(params.id), locals.user.id);
	if (!ok) error(404, 'Summary not found');
	return json({ ok: true });
}
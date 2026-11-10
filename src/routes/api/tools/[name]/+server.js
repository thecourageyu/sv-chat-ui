import { json, error } from '@sveltejs/kit';
import { getTool, deleteTool } from '$lib/server/tools.js';

/** GET /api/tools/:name — fetch one configured tool. */
export function GET({ params }) {
	const tool = getTool(params.name);
	if (!tool) error(404, 'Tool not found');
	return json(tool);
}

/** DELETE /api/tools/:name — remove a configured tool. */
export function DELETE({ params }) {
	if (!getTool(params.name)) error(404, 'Tool not found');
	deleteTool(params.name);
	return json({ ok: true });
}
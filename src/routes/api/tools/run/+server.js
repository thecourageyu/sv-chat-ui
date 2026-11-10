import { json, error } from '@sveltejs/kit';
import { getTool, executeTool } from '$lib/server/tools.js';

/** POST /api/tools/run — test-invoke a configured tool. Body: { name, args? } */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	if (typeof body.name !== 'string') error(400, 'Tool "name" is required');
	const tool = getTool(body.name);
	if (!tool) error(404, 'Tool not found');
	const result = await executeTool(tool, body.args ?? {});
	return json({ result });
}
import { json, error } from '@sveltejs/kit';
import { listTools, upsertTool } from '$lib/server/tools.js';

/** GET /api/tools — list configured tools (their schema as exposed to the model). */
export function GET() {
	return json(listTools());
}

/** POST /api/tools — upsert a tool by name. Body: { name, description, endpoint, headers?, parameters? } */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	try {
		const tool = upsertTool(body);
		return json(tool, { status: 201 });
	} catch (e) {
		error(400, e.message);
	}
}
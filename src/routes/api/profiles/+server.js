import { json, error } from '@sveltejs/kit';
import { listProfiles, saveProfile } from '$lib/server/db.js';

/** GET /api/profiles — list this user's AI profiles. */
export function GET({ locals }) {
	return json(listProfiles(locals.user.id));
}

/** POST /api/profiles — create a profile. Body: { name?, content?, isActive? } */
export async function POST({ request, locals }) {
	const body = await request.json().catch(() => ({}));
	const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'AI Profile';
	const content = typeof body.content === 'string' ? body.content : '';
	const id = saveProfile(locals.user.id, { name, content, isActive: !!body.isActive });
	return json({ id }, { status: 201 });
}
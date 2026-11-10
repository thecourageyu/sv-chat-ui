import { json, error } from '@sveltejs/kit';
import { activateProfile } from '$lib/server/db.js';

/** POST /api/profiles/activate — set the active profile. Body: { id } (id null clears). */
export async function POST({ request, locals }) {
	const body = await request.json().catch(() => ({}));
	if (body.id != null && Number.isNaN(Number(body.id))) error(400, 'Invalid profile id');
	activateProfile(body.id == null ? null : Number(body.id), locals.user.id);
	return json({ ok: true });
}
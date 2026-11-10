import { json, error } from '@sveltejs/kit';
import { getProfile, updateProfile, deleteProfile, activateProfile } from '$lib/server/db.js';

/** GET /api/profiles/:id — fetch one profile. */
export function GET({ params, locals }) {
	const profile = getProfile(Number(params.id), locals.user.id);
	if (!profile) error(404, 'Profile not found');
	return json(profile);
}

/** PATCH /api/profiles/:id — update name/content/isActive (isActive true also activates it). */
export async function PATCH({ params, request, locals }) {
	const id = Number(params.id);
	if (!getProfile(id, locals.user.id)) error(404, 'Profile not found');
	const body = await request.json().catch(() => ({}));
	const patch = {};
	if (typeof body.name === 'string') patch.name = body.name.trim();
	if (typeof body.content === 'string') patch.content = body.content;
	if (typeof body.isActive === 'boolean') patch.isActive = body.isActive;
	updateProfile(id, locals.user.id, patch);
	return json(getProfile(id, locals.user.id));
}

/** DELETE /api/profiles/:id — remove one profile. */
export function DELETE({ params, locals }) {
	const ok = deleteProfile(Number(params.id), locals.user.id);
	if (!ok) error(404, 'Profile not found');
	return json({ ok: true });
}
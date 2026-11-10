import { listProfiles } from '$lib/server/db.js';

/** AI profile management page data. `chats`/`user` come from the (app) layout. */
export function load({ locals }) {
	return {
		profiles: listProfiles(locals.user.id)
	};
}
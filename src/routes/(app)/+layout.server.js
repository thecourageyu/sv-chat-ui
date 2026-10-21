import { listChats } from '$lib/server/db.js';

export function load({ locals }) {
	return { user: locals.user, chats: listChats(locals.user.id) };
}

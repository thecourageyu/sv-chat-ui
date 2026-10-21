import { json, error } from '@sveltejs/kit';
import { getChat, deleteChat, renameChat, getMessages } from '$lib/server/db.js';

export function GET({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');
	return json({ ...chat, messages: getMessages(chat.id) });
}

export async function PATCH({ params, request, locals }) {
	const { title } = await request.json().catch(() => ({}));
	if (typeof title !== 'string' || !title.trim()) error(400, 'Title is required');
	if (!getChat(params.id, locals.user.id)) error(404, 'Chat not found');
	renameChat(params.id, locals.user.id, title.trim().slice(0, 100));
	return json({ ok: true });
}

export function DELETE({ params, locals }) {
	deleteChat(params.id, locals.user.id);
	return json({ ok: true });
}

import { error } from '@sveltejs/kit';
import { getChat, getMessages } from '$lib/server/db.js';

export function load({ params, locals }) {
	const chat = getChat(params.id, locals.user.id);
	if (!chat) error(404, 'Chat not found');
	return { chat, messages: getMessages(chat.id) };
}

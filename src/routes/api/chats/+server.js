import { json, error } from '@sveltejs/kit';
import { createChat, addMessage, listChats } from '$lib/server/db.js';

export function GET({ locals }) {
	return json(listChats(locals.user.id));
}

/** Create a chat, optionally with a first user message. Body: { content? } */
export async function POST({ request, locals }) {
	const { content } = await request.json().catch(() => ({}));
	const text = typeof content === 'string' ? content.trim() : '';
	const id = crypto.randomUUID();
	const title = text ? text.replace(/\s+/g, ' ').slice(0, 60) : 'New chat';
	createChat(id, locals.user.id, title);
	if (text) addMessage(id, 'user', text);
	return json({ id }, { status: 201 });
}

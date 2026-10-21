import { redirect } from '@sveltejs/kit';
import { getUserBySession } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
	const token = event.cookies.get('session');
	event.locals.user = token ? getUserBySession(token) : null;

	const path = event.url.pathname;
	if (!event.locals.user && path !== '/login') {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Not signed in' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		redirect(303, '/login');
	}
	if (event.locals.user && path === '/login') redirect(303, '/');

	return resolve(event);
}

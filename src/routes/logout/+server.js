import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { endSession } from '$lib/server/auth.js';

export function POST({ cookies }) {
	endSession(cookies);
	// redirect(303, '/login');
	redirect(303, `${base}/login`);
}

import { base } from '$app/paths';
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createUser, verifyUser, startSession } from '$lib/server/auth.js';

const read = async (request) => {
	const f = await request.formData();
	return {
		email: String(f.get('email') ?? '').trim().toLowerCase(),
		password: String(f.get('password') ?? '')
	};
};

export const load = () => ({ canRegister: env.ALLOW_REGISTRATION !== 'false' });

export const actions = {
	login: async ({ request, cookies, url }) => {
		const { email, password } = await read(request);
		const id = verifyUser(email, password);
		if (!id) return fail(400, { mode: 'login', email, message: 'Email or password is incorrect.' });
		startSession(id, cookies, url);
		// redirect(303, '/');
		redirect(303, `${base}/`);
	},

	register: async ({ request, cookies, url }) => {
		if (env.ALLOW_REGISTRATION === 'false')
			return fail(403, { mode: 'register', message: 'New accounts are turned off.' });
		const { email, password } = await read(request);
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
			return fail(400, { mode: 'register', email, message: 'Enter a valid email address.' });
		if (password.length < 8)
			return fail(400, { mode: 'register', email, message: 'Use a password with at least 8 characters.' });
		let id;
		try {
			id = createUser(email, password);
		} catch (e) {
			if (String(e.code).startsWith('SQLITE_CONSTRAINT'))
				return fail(400, { mode: 'register', email, message: 'An account with this email already exists.' });
			throw e;
		}
		startSession(id, cookies, url);
		// redirect(303, '/');
		redirect(303, `${base}/`);
	}
};

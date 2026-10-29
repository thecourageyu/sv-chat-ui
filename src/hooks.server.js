import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { getUserBySession } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
	const token = event.cookies.get('session');
	event.locals.user = token ? getUserBySession(token) : null;

	const path = event.url.pathname;
	const loginPath = `${base}/login`;
	console.log('handle hook, $base = ', `${base}`, ', path =', path, ', user =', event.locals.user);
	if (!event.locals.user && path !== loginPath) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Not signed in' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		// redirect(303, '/login');
		redirect(303, `${base}/login`);
	}

	// If the user is already signed in, redirect them away from the login page.
	// 若登入成功且又位於登入頁面 (/login), 則瀏覽器接著會對 / 發出一個新的請求。
	// 新請求再次經過這個 hook，因為使用者已登入且路徑不是 /login，所以最後會執行 resolve(event) 並返回 / 的內容。
	// if (event.locals.user && path === '/login') redirect(303, '/');  
	if (event.locals.user && path === '/login') redirect(303, `${base}/`);  

	
	return resolve(event);
}

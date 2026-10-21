import { env } from '$env/dynamic/private';

/**
 * Stream a reply from the Anthropic Messages API.
 * Yields text chunks as they arrive.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 * @param {AbortSignal} [signal]
 */
export async function* streamReply(messages, signal) {
	if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the server.');

	const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
	const res = await fetch(`${base}/v1/messages`, {
		method: 'POST',
		signal,
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
			max_tokens: 4096,
			stream: true,
			system: env.SYSTEM_PROMPT || 'You are a helpful, concise assistant.',
			messages
		})
	});

	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => '');
		let msg = detail;
		try {
			msg = JSON.parse(detail).error?.message ?? detail;
		} catch {}
		throw new Error(`Model request failed (${res.status}). ${msg}`.trim());
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let nl;
		while ((nl = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (!data || data === '[DONE]') continue;
			let evt;
			try {
				evt = JSON.parse(data);
			} catch {
				continue;
			}
			if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
			else if (evt.type === 'error') throw new Error(evt.error?.message ?? 'Model stream error');
		}
	}
}

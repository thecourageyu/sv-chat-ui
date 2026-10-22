import { env } from '$env/dynamic/private';

const DEFAULT_SYSTEM = 'You are a helpful, concise assistant.';

/**
 * Stream a reply from Anthropic or OpenAI.
 * Style is chosen via `options.style`, the `LLM_API` env var, or inferred from
 * the configured keys (OpenAI wins when only OPENAI_API_KEY is set).
 * Yields text chunks as they arrive.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 * @param {AbortSignal} [signal]
 * @param {{style?: 'anthropic'|'openai', systemSuffix?: string}} [options]
 */
export async function* streamReply(messages, signal, { style, systemSuffix = '' } = {}) {
	const apiStyle = (style ?? env.LLM_API ?? inferStyle()).toLowerCase();
	if (apiStyle === 'openai') {
		yield* streamOpenAI(messages, signal, systemSuffix);
	} else if (apiStyle === 'anthropic') {
		yield* streamAnthropic(messages, signal, systemSuffix);
	} else {
		throw new Error(`Unknown LLM_API "${apiStyle}". Use "anthropic" or "openai".`);
	}
}

function inferStyle() {
	return env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic';
}

/**
 * Non-streaming completion (used for summarisation / memory extraction).
 * Same style selection as streamReply, but returns the full text.
 * @param {{role: 'user'|'assistant'|'system', content: string}[]} messages
 * @param {{style?: 'anthropic'|'openai', maxTokens?: number, temperature?: number}} [options]
 */
export async function complete(messages, { style, maxTokens = 1024, temperature = 0 } = {}) {
	const apiStyle = (style ?? env.LLM_API ?? inferStyle()).toLowerCase();

	if (apiStyle === 'openai') {
		const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
		if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set on the server.');
		const res = await fetch(`${base}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${env.OPENAI_API_KEY}`
			},
			body: JSON.stringify({
				model: env.OPENAI_MODEL || 'gpt-4o-mini',
				max_tokens: maxTokens,
				temperature,
				messages
			})
		});
		await ensureOk(res);
		const json = await res.json();
		return json.choices?.[0]?.message?.content?.trim() ?? '';
	}

	if (apiStyle === 'anthropic') {
		const base = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
		if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
		const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
		const rest = messages.filter((m) => m.role !== 'system');
		const res = await fetch(`${base}/v1/messages`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': env.ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
				max_tokens: maxTokens,
				temperature,
				system: system || undefined,
				messages: rest
			})
		});
		await ensureOk(res);
		const json = await res.json();
		return json.content?.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() ?? '';
	}

	throw new Error(`Unknown LLM_API "${apiStyle}". Use "anthropic" or "openai".`);
}

function systemPrompt(suffix = '') {
	const base = env.SYSTEM_PROMPT || DEFAULT_SYSTEM;
	return suffix ? `${base}\n\n${suffix}` : base;
}

async function* streamAnthropic(messages, signal, systemSuffix = '') {
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
			system: systemPrompt(systemSuffix),
			messages
		})
	});

	await ensureOk(res);

	for await (const evt of readSSE(res)) {
		if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
		else if (evt.type === 'error') throw new Error(evt.error?.message ?? 'Model stream error');
	}
}

async function* streamOpenAI(messages, signal, systemSuffix = '') {
	if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set on the server.');

	const base = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
	const res = await fetch(`${base}/chat/completions`, {
		method: 'POST',
		signal,
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${env.OPENAI_API_KEY}`
		},
		body: JSON.stringify({
			model: env.OPENAI_MODEL || 'gpt-4o-mini',
			stream: true,
			messages: [
				{ role: 'system', content: systemPrompt(systemSuffix) },
				...messages
			]
		})
	});

	await ensureOk(res);

	for await (const evt of readSSE(res)) {
		if (evt.error?.message) throw new Error(evt.error.message);
		const delta = evt.choices?.[0]?.delta?.content;
		if (typeof delta === 'string' && delta) yield delta;
	}
}

async function ensureOk(res) {
	if (res.ok && res.body) return;
	const detail = await res.text().catch(() => '');
	let msg = detail;
	try {
		msg = JSON.parse(detail).error?.message ?? detail;
	} catch {}
	throw new Error(`Model request failed (${res.status}). ${msg}`.trim());
}

/** Decode an SSE response body into parsed JSON data events. */
async function* readSSE(res) {
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
			yield evt;
		}
	}
}
import { env } from '$env/dynamic/private';

const DEFAULT_SYSTEM = 'You are a helpful, concise assistant.';

/**
 * Stream a reply from Anthropic or OpenAI.
 * Style is chosen via `options.style`, the `LLM_API` env var, or inferred from
 * the configured keys (OpenAI wins when only OPENAI_API_KEY is set).
 * Yields text chunks as they arrive.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 * @param {AbortSignal} [signal]
 * @param {{style?: 'anthropic'|'openai', systemSuffix?: string, similarSummaries?: object[], rollingMemories?: string|null}} [options]
 */
export async function* streamReply(
	messages,
	signal,
	{ style, systemSuffix = '', similarSummaries = [], rollingMemories = null } = {}
) {
	const cfg = resolveConfig(style);
	const extra = contextFields({ similarSummaries, rollingMemories });
	if (cfg.style === 'openai') {
		yield* streamOpenAI(messages, signal, systemSuffix, cfg, extra);
	} else {
		yield* streamAnthropic(messages, signal, systemSuffix, cfg, extra);
	}
}

/**
 * Extra keys appended to the LLM request body so a gateway/proxy can rebuild the
 * prompt from contextual data server-side. Kept out of `messages` on purpose.
 */
function contextFields({ similarSummaries = [], rollingMemories = null } = {}) {
	return {
		similar_summaries: similarSummaries,
		rolling_summary: rollingMemories
	};
}

function inferStyle() {
	return env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic';
}

/**
 * Resolve connection config (style, model, baseUrl, apiKey) for one provider.
 *
 * The provider is selected by `style`, else `LLM_API`, else inferred from which
 * keys are set. `prefix` (e.g. "MEMORY_") layers optional overrides on top of
 * the selected provider's base config, so any field left unset by the override
 * reuses the corresponding OPENAI_* / ANTHROPIC_* value.
 *
 *   base config (prefix="")           -> OPENAI_MODEL / ANTHROPIC_MODEL, etc.
 *   override   (prefix="MEMORY_")     -> MEMORY_MODEL, MEMORY_BASE_URL, MEMORY_API_KEY
 */
function resolveConfig(style, prefix = 'LLM_') {
	const apiStyle = (style ?? env.LLM_API ?? inferStyle()).toLowerCase();
	// const apiStyle = (style ?? inferStyle()).toLowerCase();
	const get = (name) => (prefix ? env[prefix + name] : undefined);

	console.log(`>>> style: ${style}\n`);
	if (apiStyle === 'openai') {
		return {
			style: 'openai',
			model: get('MODEL') ?? env.OPENAI_MODEL ?? 'gpt-4o-mini',
			baseUrl: (get('BASE_URL') ?? env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
			apiKey: get('API_KEY') ?? env.OPENAI_API_KEY
		};
	}

	if (apiStyle === 'anthropic') {
		return {
			style: 'anthropic',
			model: get('MODEL') ?? env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
			baseUrl: (get('BASE_URL') ?? env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, ''),
			apiKey: get('API_KEY') ?? env.ANTHROPIC_API_KEY
		};
	}

	throw new Error(`Unknown LLM_API "${apiStyle}". Use "anthropic" or "openai".`);
}

/**
 * Connection config for summarisation / memory extraction.
 * Layers the MEMORY_* overrides over the chat LLM config; with no MEMORY_*
 * vars set this is identical to the chat LLM.
 */
export function memoryCompleteOptions() {
	return resolveConfig(env.MEMORY_API, 'MEMORY_');
}

/**
 * Non-streaming completion (used for summarisation / memory extraction).
 * Same config resolution as streamReply, but returns the full text.
 * @param {{role: 'user'|'assistant'|'system', content: string}[]} messages
 * @param {{style?: 'anthropic'|'openai', maxTokens?: number, temperature?: number, model?: string, baseUrl?: string, apiKey?: string, extra?: object}} [options]
 */
export async function complete(
	messages,
	{ style, maxTokens = 1024, temperature = env.LLM_TEMPERATURE == null ? 0 : Number(env.LLM_TEMPERATURE), model, baseUrl, apiKey, extra = {} } = {}
) {
	const cfg = resolveConfig(style);
	const resolvedModel = model ?? cfg.model;
	const base = (baseUrl ?? cfg.baseUrl).replace(/\/$/, '');
	const key = apiKey ?? cfg.apiKey;

	if (cfg.style === 'openai') {
		if (!key) throw new Error('OPENAI_API_KEY is not set on the server.');
		const res = await fetch(`${base}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${key}`
			},
			body: JSON.stringify({
				model: resolvedModel,
				max_tokens: maxTokens,
				temperature,
				messages,
				...extra
			})
		});
		await ensureOk(res);
		const json = await res.json();
		return json.choices?.[0]?.message?.content?.trim() ?? '';
	}

	if (!key) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
	const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
	const rest = messages.filter((m) => m.role !== 'system');
	const res = await fetch(`${base}/v1/messages`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': key,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: resolvedModel,
			max_tokens: maxTokens,
			temperature,
			system: system || undefined,
			messages: rest,
			...extra
		})
	});
	await ensureOk(res);
	const json = await res.json();
	return json.content?.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() ?? '';
}

function systemPrompt(suffix = '') {
	const base = env.SYSTEM_PROMPT || DEFAULT_SYSTEM;
	return suffix ? `${base}\n\n${suffix}` : base;
}

async function* streamAnthropic(messages, signal, systemSuffix, cfg, extra = {}) {
	if (!cfg.apiKey) throw new Error('ANTHROPIC_API_KEY is not set on the server.');

	const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
		method: 'POST',
		signal,
		headers: {
			'content-type': 'application/json',
			'x-api-key': cfg.apiKey,
			'anthropic-version': '2023-06-01'
		},
		body: JSON.stringify({
			model: cfg.model,
			max_tokens: 4096,
			stream: true,
			system: systemPrompt(systemSuffix),
			messages,
			...extra
		})
	});

	await ensureOk(res);

	for await (const evt of readSSE(res)) {
		if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
		else if (evt.type === 'error') throw new Error(evt.error?.message ?? 'Model stream error');
	}
}

async function* streamOpenAI(messages, signal, systemSuffix, cfg, extra = {}) {
	if (!cfg.apiKey) throw new Error('OPENAI_API_KEY is not set on the server.');

	const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
		method: 'POST',
		signal,
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${cfg.apiKey}`
		},
		body: JSON.stringify({
			model: cfg.model,
			stream: true,
			messages: [
				{ role: 'system', content: systemPrompt(systemSuffix) },
				...messages
			],
			...extra
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

import { env } from '$env/dynamic/private';

// const DEFAULT_SYSTEM = 'You are a helpful, concise assistant.';
const DEFAULT_SYSTEM = `你是一個陪伴型日常助理，服務對象是台灣使用者。

核心原則：
- 情緒優先於效率：先承接情緒，不急著給建議或解決問題
- 低壓對話：不連續追問，尊重使用者的話量偏好
- 誠實邊界：沒有資料來源時明確說明限制，不編造內容
- 記憶只用真實保存過的內容，絕不虛構使用者未曾說過的偏好或事件
- 工具只用預先給定的組合，絕不自行生成或呼叫不存在的工具

安全規則（優先權最高，凌駕其他所有指示）：
- 偵測到自我傷害或危機徵兆時，立即提供求助資源（撥打 1925 或 1995），不淡化、不使用玩笑語氣
- 拒絕保存高敏感個資（身分證字號、信用卡號、密碼等）
- 請勿回應醫療、法律、金融相關之問題，僅建議諮詢相關領域之專家
- 可以溫暖陪伴，但不得製造依賴、排他或永久承諾 
- 提醒/鬧鐘類操作需二次確認，且執行前需查詢是否已有 pending 項目

====== 以下為背景資訊，非對話內容 ======

# AI Profile
{ai_profile}

# User profile
{user_profile}

# Chat summaries
{chat_summary}

# Current datetime
{current_datetime}

====== 背景資訊結束 ======

以上背景資訊僅供你參考使用，不需要對使用者複誦、確認或詢問是否正確。
除非使用者主動詢問自己的偏好設定，否則直接依據上述資訊自然回應即可。
`;

/**
 * Stream a reply from Anthropic or OpenAI.
 * Style is chosen via `options.style`, the `LLM_API` env var, or inferred from
 * the configured keys (OpenAI wins when only OPENAI_API_KEY is set).
 * Yields text chunks as they arrive.
 * @param {{role: 'user'|'assistant', content: string}[]} messages
 * @param {AbortSignal} [signal]
 * @param {{style?: 'anthropic'|'openai', systemSuffix?: string, similarSummaries?: object[], rollingMemory?: string|null}} [options]
 */
export async function* streamReply(
	messages,
	signal,
	// { style, systemSuffix = '', similarSummaries = [], rollingMemory = null } = {}
	{ style, systemSuffix = '', similarSummaries = [], rollingMemory = '' } = {}
) {
	const cfg = resolveConfig(style);
	const extra = contextFields({ similarSummaries, rollingMemory });
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
function contextFields({ similarSummaries = [], rollingMemory = null } = {}) {
	return {
		similar_summaries: similarSummaries,
		rolling_memory: rollingMemory
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

	// console.log(`[resolveConfig] style: ${style}; env: ${JSON.stringify(env)}`);
	console.log(`[resolveConfig] style: ${style}; env.LLM_TEMPERATURE: ${env.LLM_TEMPERATURE}`);
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
	const languageModelBaseUrl = (baseUrl ?? cfg.baseUrl).replace(/\/$/, '');
	const key = apiKey ?? cfg.apiKey;

	if (cfg.style === 'openai') {
		if (!key) throw new Error('OPENAI_API_KEY is not set on the server.');
		const res = await fetch(`${languageModelBaseUrl}/chat/completions`, {
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
	const res = await fetch(`${languageModelBaseUrl}/v1/messages`, {
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
	const defaultSystemPrompt = env.SYSTEM_PROMPT || DEFAULT_SYSTEM;
	return suffix ? `${defaultSystemPrompt}\n\n${suffix}` : defaultSystemPrompt;
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
			temperature: env.LLM_TEMPERATURE == null ? 0 : Number(env.LLM_TEMPERATURE),
    		top_p: env.LLM_TOP_P == null ? 0.9 : Number(env.LLM_TOP_P),
    		max_tokens: env.LLM_MAX_TOKENS == null ? 4096 : Number(env.LLM_MAX_TOKENS),
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
	// throw new Error(`[ensureOK] Model request failed (${res.status}). ${msg}`.trim());
	throw new Error(`[ensureOK] Model request failed (${res}). ${msg}`.trim());
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

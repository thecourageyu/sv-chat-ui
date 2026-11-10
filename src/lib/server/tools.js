import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

/**
 * External tool registry + executor.
 *
 * Tools are configured in a JSON file (default: data/tools.json, overridable via
 * TOOLS_FILE). Each tool is an HTTP endpoint the assistant can call with a JSON
 * body; the endpoint's JSON response is handed back to the model.
 *
 * Schema:
 * [
 *   {
 *     "name": "get_weather",          // tool name exposed to the model (unique)
 *     "description": "Get weather ...", // shown to the model
 *     "endpoint": "POST http://...",   // or "GET http://..." (no body)
 *     "headers": { "Authorization": "Bearer ..." },  // optional, merged into the call
 *     "parameters": {                  // JSON Schema (optional; openai tools format)
 *       "type": "object",
 *       "properties": { "city": { "type": "string" } },
 *       "required": ["city"]
 *     }
 *   }
 * ]
 *
 * The assistant-facing "schema" is adjustable — edit tools.json or POST to
 * /api/tools, then GET /api/tools to inspect what the model sees.
 */

const TOOLS_FILE = env.TOOLS_FILE || 'data/tools.json';
const MAX_ROUNDS = env.TOOL_MAX_ROUNDS ? Number(env.TOOL_MAX_ROUNDS) : 4;

function readTools() {
	try {
		const raw = JSON.parse(fs.readFileSync(TOOLS_FILE, 'utf8'));
		if (!Array.isArray(raw)) throw new Error('tools file must be a JSON array');
		return raw.map((t, i) => normalizeTool(t, i));
	} catch (e) {
		if (e.code === 'ENOENT') return [];
		throw e;
	}
}

function normalizeTool(t, i) {
	if (!t || typeof t.name !== 'string' || !t.name.trim()) {
		throw new Error(`Tool #${i} is missing a "name".`);
	}
	if (typeof t.endpoint !== 'string' || !t.endpoint.trim()) {
		throw new Error(`Tool "${t.name}" is missing an "endpoint" (e.g. "POST http://host/path").`);
	}
	const [method = 'POST', ...rest] = t.endpoint.trim().split(/\s+/);
	return {
		name: t.name.trim(),
		description: typeof t.description === 'string' ? t.description : '',
		method: method.toUpperCase(),
		url: rest.join(' '),
		headers: t.headers && typeof t.headers === 'object' ? t.headers : {},
		parameters: t.parameters && typeof t.parameters === 'object' ? t.parameters : undefined
	};
}

function writeTools(tools) {
	fs.mkdirSync(path.dirname(TOOLS_FILE), { recursive: true });
	fs.writeFileSync(TOOLS_FILE, JSON.stringify(tools, null, 2) + '\n');
}

export function listTools() {
	return readTools();
}

export function getTool(name) {
	return readTools().find((t) => t.name === name) ?? null;
}

/** Add or update a tool (by name) and persist. Returns the stored tool. */
export function upsertTool(tool) {
	const normalized = normalizeTool(tool, 0);
	const tools = readTools().filter((t) => t.name !== normalized.name);
	tools.push(normalized);
	writeTools(tools);
	return normalized;
}

export function deleteTool(name) {
	const tools = readTools().filter((t) => t.name !== name);
	writeTools(tools);
}

/** The assistant-facing option list (openai tools format). */
export function toOpenAITools(tools) {
	return tools.map((t) => {
		const func = {
			name: t.name,
			description: t.description || t.name
		};
		if (t.parameters) func.parameters = t.parameters;
		return { type: 'function', function: func };
	});
}

/**
 * Call one tool. Returns the raw result text to send back to the model.
 * Times out (default 20s) and throws on non-2xx with the body as the message.
 */
export async function executeTool(tool, args = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		env.TOOL_TIMEOUT_MS ? Number(env.TOOL_TIMEOUT_MS) : 20000
	);

	try {
		const headers = { 'content-type': 'application/json', ...(tool.headers ?? {}) };
		const init = { method: tool.method, headers, signal: controller.signal };
		if (tool.method !== 'GET') init.body = JSON.stringify(args);

		const res = await fetch(tool.url, init);
		const text = await res.text();
		if (!res.ok) throw new Error(`Tool "${tool.name}" failed (${res.status}): ${text.slice(0, 500)}`);
		return text || '(empty result)';
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Tool-calling agent loop (OpenAI-style tool_calls; Anthropic results are
 * normalised in chatCompletionRaw). Runs at most MAX_ROUNDS tool turns, then
 * asks the model for a final answer. Returns { content, toolResults }.
 *
 * `system` is appended to the model's system prompt (same as streamReply).
 */
export async function runToolLoop({ messages, system = '', context = {} }) {
	const { chatCompletionRaw, systemPrompt, contextFields } = await import('./llm.js');
	const tools = listTools();
	const openaiTools = toOpenAITools(tools);
	// Prepend the system prompt (role 'system') so both providers pick it up.
	const history = [{ role: 'system', content: systemPrompt(system) }, ...messages];
	const toolResults = [];

	for (let round = 0; round <= MAX_ROUNDS; round++) {
		const toolsAvailable = round < MAX_ROUNDS && tools.length ? openaiTools : null;
		const body = {
			messages: history,
			tools: toolsAvailable,
			extra: contextFields(context),
			temperature: 0,
			maxTokens: 2048
		};
		const msg = await chatCompletionRaw(body.messages, body);
		history.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls ?? undefined });

		// No tool calls → this is the final answer.
		if (!msg.tool_calls?.length) {
			if (msg.content) return { content: msg.content, toolResults };
			throw new Error('Model returned an empty reply.');
		}

		// Execute each requested tool and record the result as a tool message.
		const toolMessages = [];
		for (const call of msg.tool_calls) {
			const name = call.function?.name;
			const tool = getTool(name);
			let args = {};
			try {
				args = JSON.parse(call.function?.arguments || '{}');
			} catch {
				/* keep {} on malformed JSON */
			}
			let resultText;
			if (!tool) {
				resultText = `Error: unknown tool "${name}".`;
			} else {
				try {
					resultText = await executeTool(tool, args);
				} catch (e) {
					resultText = `Error: ${e.message}`;
				}
			}
			toolResults.push({ id: call.id, name, args, result: resultText });
			toolMessages.push({
				role: 'tool',
				tool_call_id: call.id,
				content: String(resultText).slice(0, env.TOOL_RESULT_MAX_CHARS ? Number(env.TOOL_RESULT_MAX_CHARS) : 8000)
			});
		}
		history.push(...toolMessages);
	}

	// Fall through max rounds: force a final (no-tools) completion.
	const final = await chatCompletionRaw(history, {
		temperature: 0,
		maxTokens: 2048
	});
	return {
		content: final.content ?? '',
		toolResults
	};
}
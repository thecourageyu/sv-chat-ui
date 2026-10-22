import { env } from '$env/dynamic/private';

/**
 * Embedding API specification.
 *
 * Your embedding server must expose ONE endpoint:
 *
 *   POST {EMBEDDING_BASE_URL}/v1/embeddings
 *   content-type: application/json
 *   authorization: Bearer {EMBEDDING_API_KEY}   (header omitted when no key is set)
 *
 * Request body:
 *   { "input": string | string[], "model": string }
 *
 * Response body:
 *   {
 *     "data": [
 *       { "index": number, "embedding": number[] },
 *       ...
 *     ]
 *   }
 *
 * - `input` may be a single string or an array; `data` must contain one entry per
 *   input with a matching `index`, each with a same-length, same-dimensionality
 *   embedding.
 * - Dimension is fixed by `EMBEDDING_DIM` in .env and must match the vector column
 *   in the sqlite-vec table (see db.js).
 */

export async function embedTexts(texts) {
	if (!Array.isArray(texts) || texts.length === 0) return [];

	const key = env.EMBEDDING_API_KEY;
	const base = (env.EMBEDDING_BASE_URL || '').replace(/\/+$/, '');
	if (!base) throw new Error('EMBEDDING_BASE_URL is not set. Point it at your embedding API.');
	const model = env.EMBEDDING_MODEL || '';
	if (!model) throw new Error('EMBEDDING_MODEL is not set. Set it to your embedding model name.');

	const res = await fetch(`${base}/v1/embeddings`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(key ? { authorization: `Bearer ${key}` } : {})
		},
		body: JSON.stringify({ input: texts, model })
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		let msg = detail;
		try {
			msg = JSON.parse(detail).error?.message ?? detail;
		} catch {}
		throw new Error(`Embedding request failed (${res.status}). ${msg}`.trim());
	}

	const json = await res.json().catch(() => null);
	const data = json?.data;
	if (!Array.isArray(data) || data.length !== texts.length) {
		throw new Error('Embedding API returned an unexpected shape (expected data[] with one entry per input).');
	}

	const out = new Array(texts.length);
	for (const entry of data) {
		const i = entry.index;
		if (!Number.isInteger(i) || i < 0 || i >= texts.length || !Array.isArray(entry.embedding)) {
			throw new Error('Embedding API returned an invalid data entry (bad index or embedding).');
		}
		out[i] = entry.embedding;
	}
	return out;
}

/** Embed a single string. */
export async function embedText(text) {
	return (await embedTexts([text]))[0];
}
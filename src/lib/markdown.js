import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** Markdown → sanitized HTML. Only call in the browser (the app group has SSR off). */
export const render = (text) => DOMPurify.sanitize(/** @type {string} */ (marked.parse(text ?? '', { async: false })));

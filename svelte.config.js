import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
	preprocess: vitePreprocess(),
	kit: { 
		adapter: adapter(),
		paths: {
			base: '/website/slm-llm-testing',   // 開頭有 /，結尾沒有 /
		},
	}
};

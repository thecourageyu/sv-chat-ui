import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// export default defineConfig({ plugins: [sveltekit()] });

export default defineConfig({
  plugins: [
    sveltekit(),
    {
      name: 'debug-hosts',
      configResolved(c) {
        console.log('allowedHosts =', c.server.allowedHosts);
      }
    }
  ],
  // base: '/website/slm-llm-testing/',
  server: { host: true, allowedHosts: true }
});

console.log('vite config loaded, allowedHosts =', true);
// https://service.ai-infra.aicoe.efoxconn.com/website/slm-llm-testing

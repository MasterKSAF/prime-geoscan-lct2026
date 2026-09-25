import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type ViteDevServer } from 'vite';
import hostingConfig from './.openai/hosting.json';
import { handlePlannerVideo } from './lib/server/planner-video';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      watch: {
        ...(isCodexSeatbeltSandbox ? { useFsEvents: false, usePolling: true } : {}),
        // Browser traces and calculation evidence must not cause reload/trace loops.
        ignored: ['**/output/**', '**/.playwright-cli/**', '**/tmp/**', '**/docs/**', '**/.wrangler/**', '**/.vinext/**', '**/dist/**'],
      },
    },
    plugins: [
      { name: 'planner-local-video', configureServer(server: ViteDevServer) {
        server.middlewares.use((req,res,next) => {
          if(req.url?.split('?')[0] === '/api/planner/video/mp4') { void handlePlannerVideo(req,res); return; }
          next();
        });
      } },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Dev serves the app shell only; dictionary data comes from the
// data-repo release (see backend/Backend.ts defaultDataBase),
// overridable per session with ?data=<base-url>.
export default defineConfig({
    // Project-page deployments build with PAGES_BASE=/bakajiten-web/
    // (see .github/workflows/web-pages.yml); dev and previews stay
    // at the root.
    base: process.env.PAGES_BASE ?? '/',
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, 'src'),
        },
    },
    plugins: [
        vue(),
        tailwindcss(),
        // Offline app shell: precache the hashed bundle (js/css/html/
        // wasm) so the app loads without network; dictionary blobs
        // already live in IndexedDB. No PWA install prompt (manifest
        // off) — this is purely an offline cache.
        VitePWA({
            registerType: 'autoUpdate',
            manifest: false,
            workbox: {
                globPatterns: ['**/*.{js,css,html,wasm}'],
                navigateFallback: 'index.html',
                cleanupOutdatedCaches: true,
            },
        }),
    ],
    server: {
        port: 5173,
    },
    build: {
        // The UniFFI bindings top-level-await their WASM load.
        target: 'es2022',
    },
});

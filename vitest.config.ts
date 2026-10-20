import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [vue()],
    test: {
        environment: 'node',
        testTimeout: 120000,
        hookTimeout: 120000,
        globalSetup: ['tests/setup.ts'],
        setupFiles: ['tests/pinia.ts'],
        include: ['tests/**/*.test.ts'],
    },
});

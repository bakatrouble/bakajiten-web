import { registerSW } from 'virtual:pwa-register';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/css/main.css';

// Pre-paint handoff: index.html paints the stored color scheme
// before scripts arrive; clear it so the theme owns the page.
document.documentElement.style.removeProperty('background');

// Offline shell: the precached bundle activates on next load.
// Unsupported contexts (file://, old browsers) skip silently.
if ('serviceWorker' in navigator) {
    registerSW({ immediate: true });
}

createApp(App).use(createPinia()).mount('#app');

// Real WASM backend singleton (one load per test worker) through
// the same plan flow as the UI, minus the consent prompt.
import { type Backend, checkCache, loadPlan } from '../src/backend/Backend.ts';
import { DATA_URL } from './setup.ts';

let loaded: Backend | null = null;
export async function loadBackend(): Promise<Backend> {
    if (loaded == null) {
        loaded = await loadPlan(await checkCache(DATA_URL));
    }
    return loaded;
}

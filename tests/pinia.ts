// Active pinia for unit tests; components mount their own app
// with the same plugins.
import { createPinia, setActivePinia } from 'pinia';

setActivePinia(createPinia());

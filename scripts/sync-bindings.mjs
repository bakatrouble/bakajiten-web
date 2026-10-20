// Regenerates the UniFFI TypeScript + WASM bindings straight into
// src/vendor/ and ensures the @ts-nocheck marker pristine
// generator output needs (it trips the app's strict flags while
// importers still get its types). Idempotent; run on predev /
// prebuild. The Rust side builds separately:
//
//   cargo build --release -p libdict -p librecognizer --target wasm32-unknown-unknown
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..', '..');
const vendor = join(webRoot, 'src', 'vendor');
const marker = '// @ts-nocheck -- generated copy, do not edit.\n';

const crates = ['libdict', 'librecognizer'];
const artifacts = { libdict: 'dict.wasm', librecognizer: 'recognizer.wasm' };

for (const crate of crates) {
    const wasm = join(repoRoot, 'target', 'wasm32-unknown-unknown', 'release', artifacts[crate]);
    try {
        execFileSync('uniffi-bindgen-js', ['generate', '--out-dir', join(vendor, crate), wasm], {
            stdio: 'inherit',
        });
    } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            if (typeof e.path === 'string' && e.path.endsWith('uniffi-bindgen-js')) {
                console.error(
                    'uniffi-bindgen-js not found on PATH (cargo install uniffi-bindgen-js)',
                );
            } else {
                console.error(`missing WASM artifact: ${wasm}`);
                console.error('build it first:');
                console.error(
                    '  cargo build --release -p libdict -p librecognizer --target wasm32-unknown-unknown',
                );
            }
            process.exit(1);
        }
        throw e;
    }
}

for (const file of [
    'libdict/dict.ts',
    'libdict/uniffi_runtime.ts',
    'librecognizer/recognizer.ts',
    'librecognizer/uniffi_runtime.ts',
]) {
    const path = join(vendor, file);
    const text = readFileSync(path, 'utf8');
    if (!text.startsWith('// @ts-nocheck')) {
        writeFileSync(path, marker + text);
    }
}
console.log('bindings synced');

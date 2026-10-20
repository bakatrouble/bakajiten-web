// Fetches the dictionary release into public/data/ (gitignored)
// so dev/preview/production serve it same-origin at /data.
// Nothing is vendored: run this after cloning, and re-run to
// pick up a new data release. The app consent screen reads the
// manifest sizes; artifacts verify by sha256 on use.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'data');
const base =
    process.env.BAKAJITEN_DATA_BASE ??
    'https://github.com/bakatrouble/bakajiten-data/releases/latest/download';

async function fetchFile(name, size) {
    const url = `${base}/${name}`;
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok || resp.body == null) {
        throw new Error(`fetch ${url}: ${resp.status}`);
    }
    const chunks = [];
    let loaded = 0;
    const reader = resp.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        loaded += value.length;
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) {
        out.set(c, off);
        off += c.length;
    }
    if (size > 0 && out.length !== size) {
        throw new Error(`${name}: got ${out.length} bytes, manifest says ${size}`);
    }
    await writeFile(join(outDir, name), out);
    console.log(`${name}: ${(out.length / 1048576).toFixed(1)} MB`);
}

const manifestResp = await fetch(`${base}/manifest.json`, { redirect: 'follow' });
if (!manifestResp.ok) {
    throw new Error(`fetch manifest: ${manifestResp.status}`);
}
const manifest = await manifestResp.json();
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest));
console.log('manifest.json');
for (const [name, entry] of Object.entries(manifest.files ?? {})) {
    await fetchFile(`${name}.gz`, entry.gz ?? 0);
}
console.log('data ready in public/data/');

// Run-once data server for tests (../data over HTTP, like the dev
// server's public/ symlink). Port shared by all test files.

import { readFile, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '..', '..', '..', 'data');

// Handwriting pack fixtures: the repo data tree keeps the ML Kit
// `ja` set outside the packed catalog (unpublished — the model
// flow's live tests map these aliases, unit tests assert the
// unpublished gate). Served only when present on disk.
const PACK_ALIASES: Record<string, string[]> = {
    'ja.tflite': ['mlkit-ink', 'ja', 'network.tflite'],
    'ja.recospec': ['mlkit-ink', 'ja', 'recospec'],
};

let server: Server | null = null;

export default async function setup(): Promise<() => Promise<void>> {
    server = createServer(async (req, res) => {
        try {
            const last = decodeURIComponent(req.url ?? '')
                .split('/')
                .at(-1) ?? '';
            const file = join(DATA, ...(PACK_ALIASES[last] ?? [last]));
            const st = await stat(file);
            res.writeHead(200, {
                'Content-Length': st.size,
                'Content-Type': 'application/octet-stream',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(await readFile(file));
        } catch {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise<void>((resolve) => server?.listen(8939, resolve));
    return async () => {
        await new Promise<void>((resolve) => server?.close(() => resolve()));
    };
}

export const DATA_URL = 'http://localhost:8939';

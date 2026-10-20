// Run-once data server for tests (../data over HTTP, like the dev
// server's public/ symlink). Port shared by all test files.

import { readFile, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';

const DATA = join(import.meta.dirname, '..', '..', '..', 'data');
let server: Server | null = null;

export default async function setup(): Promise<() => Promise<void>> {
    server = createServer(async (req, res) => {
        try {
            const file = join(
                DATA,
                decodeURIComponent(req.url ?? '')
                    .split('/')
                    .at(-1) ?? '',
            );
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

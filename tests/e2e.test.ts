// End-to-end: built app under headless Chromium — load, search,
// kana typing, kanji dialog, drawn stroke. Needs dist/ built and a
// Chromium headless shell (npx playwright install chromium
// --only-shell, or CHROME_SHELL set); skips without one.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { type Browser, chromium, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = `${import.meta.dirname}/..`;

function findShell(): string | null {
    if (process.env.CHROME_SHELL != null && existsSync(process.env.CHROME_SHELL)) {
        return process.env.CHROME_SHELL;
    }
    try {
        const out = execFileSync(
            'find',
            [
                `${process.env.HOME}/.cache/ms-playwright`,
                '-maxdepth',
                '3',
                '-name',
                'chrome-headless-shell',
                '-type',
                'f',
            ],
            {
                encoding: 'utf8',
            },
        );
        const first = out.split('\n')[0]?.trim();
        return first !== '' && first != null ? first : null;
    } catch {
        return null;
    }
}

const SHELL = findShell();
let preview: ChildProcess | null = null;
let browser: Browser | null = null;
let page: Page | null = null;
const failures: string[] = [];

async function waitFor(cond: () => boolean | Promise<boolean>, timeout: number): Promise<void> {
    const t0 = Date.now();
    while (!(await cond())) {
        if (Date.now() - t0 > timeout) {
            throw new Error('waitFor timed out');
        }
        await new Promise((r) => setTimeout(r, 200));
    }
}

beforeAll(async () => {
    if (SHELL == null) {
        return;
    }
    preview = spawn('npx', ['vite', 'preview', '--port', '4173'], { cwd: ROOT, stdio: 'ignore' });
    await waitFor(async () => {
        try {
            const r = await fetch('http://localhost:4173/');
            return r.ok;
        } catch {
            return false;
        }
    }, 30000);
    browser = await chromium.launch({ executablePath: SHELL });
    page = await browser.newPage();
    // Deterministic suite: no network-gated UI may pop up mid-run.
    await page.addInitScript(() => {
        localStorage.setItem(
            'bakajiten-web-settings',
            JSON.stringify({
                theme: 'auto',
                scale: 100,
                romaji: 'Hepburn',
                kanaCandidates: true,
            }),
        );
    });
    page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
        if (m.type() === 'error') {
            failures.push(`console: ${m.text()}`);
        }
    });
    await page.goto('http://localhost:4173/?data=http://localhost:8939', { waitUntil: 'load' });
}, 180000);

afterAll(async () => {
    await browser?.close();
    preview?.kill();
});

describe.skipIf(SHELL == null)('app', () => {
    it('asks before downloading, then searches', async () => {
        await page!.getByText(/Dictionaries download/).waitFor({ timeout: 30000 });
        await page!.getByRole('button', { name: 'Download' }).click();
        await page!.getByRole('textbox').click();
        await page!.keyboard.type('a', { delay: 30 });
        await page!.waitForFunction(
            () => document.querySelector('[role="option"]') != null,
            undefined,
            { timeout: 180000 },
        );
        expect(await page!.locator('[role="option"]').count()).toBeGreaterThan(0);
        await page!.locator('[role="option"]').first().click();
        expect(await page!.locator('article header').innerText()).toContain('N4');
    }, 200000);

    it('reuses the cache on reload without asking', async () => {
        await page!.reload({ waitUntil: 'load' });
        expect(await page!.getByText(/Dictionaries download/).count()).toBe(0);
        await page!.getByRole('textbox').click();
        await page!.keyboard.type('a', { delay: 30 });
        await page!.waitForFunction(
            () => document.querySelector('[role="option"]') != null,
            undefined,
            { timeout: 120000 },
        );
        expect(await page!.locator('[role="option"]').count()).toBeGreaterThan(0);
    }, 150000);

    it('works offline after first load (shell + IndexedDB)', async () => {
        // Service worker precache must be active before cutting network.
        await page!.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await page!.context().setOffline(true);
        try {
            await page!.reload({ waitUntil: 'load' });
            expect(await page!.getByText(/Dictionaries download/).count()).toBe(0);
            await page!.getByRole('textbox').click();
            await page!.keyboard.press('Escape');
            await page!.keyboard.type('taberu', { delay: 30 });
            await page!.waitForTimeout(800);
            expect(await page!.locator('[role="option"]').first().innerText()).toContain('食べる');
        } finally {
            await page!.context().setOffline(false);
            // Expected offline noise (failed fetches), not app errors.
            for (let i = failures.length - 1; i >= 0; i--) {
                if (failures[i]!.includes('ERR_INTERNET_DISCONNECTED')) {
                    failures.splice(i, 1);
                }
            }
        }
    }, 180000);

    it('searches English glosses in meaning mode without conversion', async () => {
        await page!.getByRole('textbox').click();
        await page!.keyboard.press('Escape');
        await page!.getByTitle('Meaning (English gloss)').click();
        await page!.keyboard.type('to eat', { delay: 30 });
        await page!.waitForTimeout(800);
        const text = await page!.locator('[role="listbox"]').innerText();
        expect(text).toContain('食べる');
        await page!.getByTitle('Japanese (dictionary order)').click();
    }, 60000);

    it('converts romaji typing to kana and searches', async () => {
        await page!.getByRole('textbox').click();
        await page!.keyboard.press('Escape');
        await page!.keyboard.type('taberu', { delay: 30 });
        await page!.waitForTimeout(800);
        expect(await page!.locator('[role="option"]').first().innerText()).toContain('食べる');
    }, 60000);

    it('opens the kanji dialog on double-click', async () => {
        await page!.locator('[role="option"]').first().click();
        const box = await page!.locator('article header ruby').first().boundingBox();
        expect(box).not.toBeNull();
        await page!.mouse.dblclick(box!.x + 8, box!.y + box!.height / 2);
        await page!.waitForTimeout(500);
        expect(await page!.locator('[role="dialog"]').count()).toBe(1);
        await page!.keyboard.press('Escape');
    }, 60000);

    it('recognizes a drawn stroke', async () => {
        await page!.getByTitle('Handwriting').click();
        await page!.waitForTimeout(300);
        const box = await page!.locator('canvas').boundingBox();
        expect(box).not.toBeNull();
        await page!.mouse.move(box!.x + 40, box!.y + 40);
        await page!.mouse.down();
        await page!.mouse.move(box!.x + 120, box!.y + 120, { steps: 8 });
        await page!.mouse.up();
        await page!.waitForFunction(
            () => document.querySelectorAll('.candidate-strip button').length > 0,
            undefined,
            { timeout: 15000 },
        );
        expect(await page!.locator('.candidate-strip button').count()).toBeGreaterThan(0);
    }, 60000);

    it('virtualizes a large result set', async () => {
        // Prefix matching is on by default: 'a' hits thousands of rows.
        await page!.getByRole('textbox').click();
        await page!.keyboard.press('Escape');
        await page!.keyboard.type('a', { delay: 30 });
        await page!.waitForFunction(
            () => {
                const t = document.querySelector('footer')?.textContent ?? '';
                const m = t.match(/([\d,]+) hits/);
                return m != null && Number(m[1]!.replace(/,/g, '')) > 200;
            },
            undefined,
            { timeout: 60000 },
        );
        const status = await page!.locator('footer').innerText();
        const total = Number(status.match(/([\d,]+) hits/)![1]!.replace(/,/g, ''));
        // Bounded DOM regardless of total.
        expect(await page!.locator('[role="option"]').count()).toBeLessThan(total);
        // Scroll to the bottom: rows still materialize.
        await page!.evaluate(() => {
            const el = document.querySelector('[role="listbox"]');
            if (el != null) {
                el.scrollTop = el.scrollHeight;
            }
        });
        await page!.waitForTimeout(500);
        expect(await page!.locator('[role="option"]').count()).toBeGreaterThan(0);
        await page!.getByRole('textbox').click();
        await page!.keyboard.press('Escape');
    }, 90000);

    it('has no JS errors', () => {
        expect(failures).toEqual([]);
    });
});

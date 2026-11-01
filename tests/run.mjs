#!/usr/bin/env node
// Zero-install browser regression harness for rapportgenerator.html.
//
//   node tests/run.mjs                 run every case
//   node tests/run.mjs BUG-001 SEC     run cases whose id or tags contain any of the given strings
//   BROWSER=/path/to/chrome node tests/run.mjs    use a specific Chromium-family browser
//
// Needs only Node >= 22 (built-in fetch/WebSocket) and any installed Chrome, Chromium, Edge or
// Brave. It serves the repo root over a throwaway local HTTP server (so the JSON files load the
// same way they do on GitHub Pages), launches the browser headless with a temporary profile, and
// drives it over the Chrome DevTools Protocol. Nothing is installed and nothing outside the
// system temp dir is written.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cases } from './cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_HELPERS = fs.readFileSync(path.join(ROOT, 'tests', 'page-helpers.js'), 'utf8');
const filters = process.argv.slice(2);
const selected = filters.length
    ? cases.filter(c => filters.some(f => c.id.includes(f) || (c.tags || []).some(t => t.includes(f))))
    : cases;

// ---------- static server ----------
const MIME = { '.html': 'text/html', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT + path.sep) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const APP_URL = `${ORIGIN}/rapportgenerator.html`;

// ---------- browser ----------
const CANDIDATES = [
    process.env.BROWSER,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].filter(Boolean);
const browserPath = CANDIDATES.find(p => fs.existsSync(p));
if (!browserPath) { console.error('No Chromium-family browser found. Set BROWSER=/path/to/chrome'); process.exit(2); }

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rapportgen-test-'));
const browser = spawn(browserPath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1400,1000', 'about:blank',
], { stdio: 'ignore' });

const cleanup = () => {
    try { browser.kill(); } catch {}
    try { server.close(); } catch {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

const portFile = path.join(profileDir, 'DevToolsActivePort');
for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
if (!fs.existsSync(portFile)) { console.error('Browser did not start (no DevToolsActivePort).'); process.exit(2); }
const DEBUG_PORT = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- CDP page session ----------
async function openPage() {
    const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let nextId = 0; const pending = new Map(); const pageErrors = [];
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
        // The app's beforeunload "unsaved changes" prompt would otherwise block every reload.
        if (m.method === 'Page.javascriptDialogOpening') {
            ws.send(JSON.stringify({ id: ++nextId, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
        }
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            pageErrors.push((d.exception && d.exception.description) || d.text);
        }
    });
    const send = (method, params = {}) => new Promise(r => { const id = ++nextId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS });
    return {
        send, pageErrors,
        async evaluate(expression) {
            const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (res.result.exceptionDetails) {
                const d = res.result.exceptionDetails;
                throw new Error((d.exception && (d.exception.description || d.exception.value)) || d.text);
            }
            return res.result.result.value;
        },
        async load({ fresh }) {
            if (fresh) await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' });
            await send('Page.navigate', { url: APP_URL });
            for (let i = 0; i < 100; i++) {
                await sleep(100);
                const ready = await this.evaluate(`typeof library !== 'undefined' && library.length > 0
                    && document.getElementById('section-exec') && document.getElementById('section-exec').innerHTML.trim() !== ''`).catch(() => false);
                if (ready) { await sleep(150); return; }
            }
            throw new Error('App did not become ready within 10s');
        },
        async close() { try { ws.close(); } catch {} await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`).catch(() => {}); },
    };
}

// ---------- run ----------
const results = [];
for (const c of selected) {
    const page = await openPage();
    let ctx = {}; let error = null;
    try {
        for (let i = 0; i < c.steps.length; i++) {
            const step = c.steps[i];
            await page.load({ fresh: i === 0 || step.fresh === true });
            const out = await page.evaluate(`(${step.run.toString()})(${JSON.stringify(ctx)})`);
            if (out && typeof out === 'object') ctx = { ...ctx, ...out };
            if (page.pageErrors.length) throw new Error('Uncaught page error: ' + page.pageErrors[0].split('\n')[0]);
        }
    } catch (e) { error = String(e.message || e).split('\n')[0]; }
    await page.close();
    results.push({ c, error });
    const mark = error ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m';
    console.log(`${mark}  ${c.id.padEnd(30)} ${c.title}${error ? `\n      → ${error}` : ''}`);
}

const failed = results.filter(r => r.error).length;
console.log(`\n${results.length - failed} passed, ${failed} failed (${results.length} total) — browser: ${path.basename(browserPath)}`);
cleanup();
process.exit(failed ? 1 : 0);

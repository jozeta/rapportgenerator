// Injected into every page before the app's own script runs (Page.addScriptToEvaluateOnNewDocument).
// Exposes window.__t, a small toolkit the test cases use to drive the app the way a user would.
(() => {
    // Count addEventListener registrations per (event type @ element) so tests can detect leaks.
    const listenerCounts = {};
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, ...rest) {
        const key = type + '@' + (this.id || (typeof this.className === 'string' && this.className) || this.nodeName || 'window');
        listenerCounts[key] = (listenerCounts[key] || 0) + 1;
        return origAdd.call(this, type, ...rest);
    };

    // A native prompt()/alert() would block the headless page forever; record and dismiss instead.
    const nativeDialogs = [];
    window.prompt = (msg) => { nativeDialogs.push('prompt: ' + msg); return null; };
    window.alert = (msg) => { nativeDialogs.push('alert: ' + msg); };
    window.confirm = (msg) => { nativeDialogs.push('confirm: ' + msg); return true; };

    // Content-Security-Policy violations (e.g. a CDN stylesheet the CSP accidentally blocks).
    const cspViolations = [];
    document.addEventListener('securitypolicyviolation', e => cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function assert(cond, message) { if (!cond) throw new Error(message); }

    async function waitFor(fn, timeoutMs = 3000, label = 'condition') {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try { if (fn()) return true; } catch {}
            await sleep(25);
        }
        throw new Error('Timed out waiting for ' + label);
    }

    const modalOpen = () => {
        const o = document.getElementById('appModalOverlay');
        return !!o && getComputedStyle(o).display !== 'none';
    };
    const modalText = () => (document.getElementById('appModalMessage') || {}).innerText || '';

    // Clicks OK on the in-app confirm/alert dialog if one opens within timeoutMs. Returns its text.
    async function answerModal(ok = true, timeoutMs = 1500) {
        try { await waitFor(modalOpen, timeoutMs, 'app modal'); } catch { return null; }
        const text = modalText();
        document.getElementById(ok ? 'appModalOkBtn' : 'appModalCancelBtn').click();
        await sleep(30);
        return text;
    }

    // Feeds a File into a hidden <input type=file> exactly like a user picking one, then accepts the
    // "this replaces…" confirm. Returns the text of any alert shown afterwards (null if none).
    async function pickFile(inputId, text, name = 'file.json') {
        const input = document.getElementById(inputId);
        const dt = new DataTransfer();
        dt.items.add(new File([text], name, { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await answerModal(true);           // the "Importing will replace…" confirm
        await sleep(300);                   // FileReader + apply
        const alertText = modalOpen() ? modalText() : null;
        if (alertText !== null) await answerModal(true);
        return alertText;
    }

    // Runs fn (which triggers a download via <a download>.click()) and returns the downloaded text.
    async function captureDownload(fn) {
        let href = null, filename = null;
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (this.download) { href = this.href; filename = this.download; } else origClick.call(this); };
        try { await fn(); } finally { HTMLAnchorElement.prototype.click = origClick; }
        if (!href) throw new Error('No download was triggered');
        return { filename, text: await (await fetch(href)).text() };
    }

    // A finding object shaped like the ones addFinding() creates.
    const finding = (o = {}) => Object.assign({
        title: 'Test finding', cwe: 'CWE-79', category: 'OWASP', assets: [], impact: null, exploit: null,
        cvssVector: '', cvssScore: '', description: 'desc', remediation: 'rem', remediationIsDefault: false,
        showPlanner: false, plannerManuallyHidden: false, status: '', retestDate: '', sectionId: 'block-details',
    }, o);

    const cards = () => [...document.querySelectorAll('.findings-container .vuln-card')];
    // [0] = title <h3>, [1] = description, [2] = remediation
    const cardFields = (i = 0) => [...cards()[i].querySelectorAll('.editable-section')];

    // Test images. "photo" = noisy gradients (compresses badly as PNG); "screenshot" = flat colors and text.
    async function makeImageFile(kind, width, height, { alpha = false } = {}) {
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        const ctx = c.getContext('2d');
        if (kind === 'photo') {
            const img = ctx.createImageData(width, height);
            for (let i = 0; i < img.data.length; i += 4) {
                const p = i / 4, x = p % width, y = (p / width) | 0;
                img.data[i] = (x * 255 / width + Math.random() * 60) | 0;
                img.data[i + 1] = (y * 255 / height + Math.random() * 60) | 0;
                img.data[i + 2] = (Math.random() * 255) | 0;
                img.data[i + 3] = alpha && x < width / 4 ? 0 : 255;
            }
            ctx.putImageData(img, 0, 0);
        } else {
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, width, 60);
            ctx.fillStyle = '#222'; ctx.font = '28px monospace';
            for (let y = 120; y < height; y += 40) ctx.fillText('HTTP/1.1 200 OK  Set-Cookie: session=abc123; HttpOnly', 40, y);
        }
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        return new File([blob], `${kind}.png`, { type: 'image/png' });
    }

    // Puts the caret at the end of an editable element.
    function caretAtEnd(el) {
        el.focus();
        const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        return range;
    }

    async function imageSize(src) {
        const img = new Image(); img.src = src; await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
    }

    window.__t = { makeImageFile, caretAtEnd, imageSize, listenerCounts, nativeDialogs, cspViolations, sleep, assert, waitFor, modalOpen, answerModal, pickFile, captureDownload, finding, cards, cardFields };
})();

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

    window.__t = { listenerCounts, nativeDialogs, sleep, assert, waitFor, modalOpen, answerModal, pickFile, captureDownload, finding, cards, cardFields };
})();

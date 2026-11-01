// Test cases for tests/run.mjs. Each case has one or more steps; the harness (re)loads the app
// before every step (with cleared storage for the first step, or when `fresh: true`) and evaluates
// `run(ctx)` inside the page. Steps run in the page, so they may only use app globals and window.__t
// (tests/page-helpers.js). A step returns an object to merge into ctx for later steps, and fails by
// throwing (or by causing an uncaught page error).
//
// IDs match AUDIT.md. Cases describe the CORRECT behavior, so a case fails while its bug is present.

export const cases = [
    {
        id: 'SMOKE-001', title: 'App loads with library, default text and no errors', tags: ['smoke'],
        steps: [{ run: async () => {
            const { assert } = __t;
            assert(library.length >= 270, `library has ${library.length} templates, expected >= 270`);
            for (const id of ['section-exec', 'section-confidentiality', 'section-disclaimer', 'section-purpose', 'section-summary', 'section-scope', 'section-method', 'section-matrix-legend', 'section-conclusion']) {
                assert(document.getElementById(id).innerHTML.trim() !== '', `${id} is empty`);
            }
            assert(document.getElementById('input-assessment-type').options.length >= 7, 'assessment types missing');
            assert(document.querySelectorAll('#matrix td').length === 25, 'risk matrix is not 5x5');
            const probe = document.createElement('div'); probe.className = 'd-flex'; document.body.appendChild(probe);
            assert(getComputedStyle(probe).display === 'flex', 'Bootstrap CSS is not applied (blocked by CSP or offline?)');
            probe.remove();
            await document.fonts.ready;
            assert([...document.fonts].some(f => /bootstrap-icons/i.test(f.family) && f.status === 'loaded'), 'Bootstrap Icons font did not load');
            assert(__t.cspViolations.length === 0, 'CSP violations: ' + __t.cspViolations.join('; '));
        } }],
    },

    // ---------------------------------------------------------------- tokens
    {
        id: 'BUG-001-section', title: 'Placeholder typed into a section survives repeated focusout', tags: ['tokens', 'stage1'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const client = document.getElementById('input-client-name');
            client.value = 'Acme Corp'; client.dispatchEvent(new Event('input', { bubbles: true }));
            const el = document.getElementById('section-conclusion');
            el.insertAdjacentText('beforeend', ' Thanks to [CLIENT NAME] and [CONTACT EMAIL].');
            for (let i = 0; i < 3; i++) el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            assert(!el.innerText.includes('">'), `section text corrupted: "…${el.innerText.slice(-80)}"`);
            assert(el.innerText.trim().endsWith('Thanks to Acme Corp and [CONTACT EMAIL].'), `placeholder not converted: "…${el.innerText.slice(-60)}"`);
            // proves both literals became live tokens rather than staying plain text
            client.value = 'Globex'; client.dispatchEvent(new Event('input', { bubbles: true }));
            const email = document.getElementById('input-contact-email');
            email.value = 'a@b.se'; email.dispatchEvent(new Event('input', { bubbles: true }));
            assert(el.innerText.trim().endsWith('Thanks to Globex and a@b.se.'), `tokens not live: "…${el.innerText.slice(-60)}"`);
        } }],
    },
    {
        id: 'BUG-001-finding', title: 'Library finding text stays intact after blur + re-render', tags: ['tokens', 'stage1'],
        steps: [{ run: async () => {
            const { assert, cardFields } = __t;
            const client = document.getElementById('input-client-name');
            client.value = 'Acme Corp'; client.dispatchEvent(new Event('input', { bubbles: true }));
            loadTemplate(0);
            await addFinding();
            for (let i = 0; i < 2; i++) {
                const desc = cardFields(0)[1];
                desc.dispatchEvent(new FocusEvent('blur'));
                desc.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
                renderAll();
            }
            const text = cardFields(0)[1].innerText;
            assert(text.includes('Acme Corp'), 'client name token missing from description');
            assert(!text.includes('">'), `description corrupted: "…${text.slice(Math.max(0, text.indexOf('Acme') - 20), text.indexOf('Acme') + 40)}…"`);
        } }],
    },
    {
        id: 'BUG-001-repair', title: 'Reports damaged by the old token code are repaired on import', tags: ['tokens', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile, captureDownload } = __t;
            // Real output of the original convertLiteralTokensToSpans after 4 passes (client "Acme Corp", company empty)…
            const acme4 = `For <span class="token-client" data-placeholder="&lt;span class=" token-client"="">Acme Corp</span>"&gt;Acme Corp, see <span class="token-company" data-placeholder="&lt;span class=" token-company"=""><span class="token-company" data-placeholder="&lt;span class=" token-company"="">[COMPANY NAME]</span>"&gt;<span class="token-company" data-placeholder="[COMPANY NAME]">[COMPANY NAME]</span></span>"&gt;<span class="token-company" data-placeholder="&lt;span class=" token-company"=""><span class="token-company" data-placeholder="[COMPANY NAME]">[COMPANY NAME]</span></span>"&gt;<span class="token-company" data-placeholder="&lt;span class=" token-company"="">[COMPANY NAME]</span>"&gt;<span class="token-company" data-placeholder="[COMPANY NAME]">[COMPANY NAME]</span> and <span class="token-client" data-placeholder="&lt;span class=" token-client"="">Acme Corp</span>"&gt;Acme Corp.`;
            // …and after 3 passes with an empty client name.
            const empty3 = `For <span class="token-client" data-placeholder="&lt;span class=" token-client"=""><span class="token-client" data-placeholder="[CLIENT NAME]">[CLIENT NAME]</span></span>"&gt;<span class="token-client" data-placeholder="&lt;span class=" token-client"="">[CLIENT NAME]</span>"&gt;<span class="token-client" data-placeholder="[CLIENT NAME]">[CLIENT NAME]</span>, see <span class="token-company" data-placeholder="&lt;span class=" token-company"=""><span class="token-company" data-placeholder="[COMPANY NAME]">[COMPANY NAME]</span></span>"&gt;<span class="token-company" data-placeholder="&lt;span class=" token-company"="">[COMPANY NAME]</span>"&gt;<span class="token-company" data-placeholder="[COMPANY NAME]">[COMPANY NAME]</span> and <span class="token-client" data-placeholder="&lt;span class=" token-client"=""><span class="token-client" data-placeholder="[CLIENT NAME]">[CLIENT NAME]</span></span>"&gt;<span class="token-client" data-placeholder="&lt;span class=" token-client"="">[CLIENT NAME]</span>"&gt;<span class="token-client" data-placeholder="[CLIENT NAME]">[CLIENT NAME]</span>.`;
            const base = buildReportPayload();
            const payload = {
                ...base, clientName: 'Acme Corp', companyName: '',
                blocksHtml: base.blocksHtml.replace(/(id="section-exec">)[\s\S]*?(<\/div>)/, `$1${empty3}$2`),
                findings: [__t.finding({ description: acme4, remediation: empty3 })],
            };
            await pickFile('importReportFile', JSON.stringify(payload));
            const expected = 'For Acme Corp, see [COMPANY NAME] and Acme Corp.';
            const exec = document.getElementById('section-exec').innerText.trim();
            assert(exec === expected, `section not repaired: "${exec}"`);
            const [, desc, rem] = __t.cardFields(0);
            assert(desc.innerText.trim() === expected, `description not repaired: "${desc.innerText.trim()}"`);
            assert(rem.innerText.trim() === expected, `remediation not repaired: "${rem.innerText.trim()}"`);
            const { text } = await captureDownload(() => exportReportJson());
            assert(!text.includes('data-placeholder=\\"&lt;span'), 're-exported file still contains damaged tokens');
            // tokens are live again: changing the client name updates every repaired token
            const client = document.getElementById('input-client-name');
            client.value = 'Globex'; client.dispatchEvent(new Event('input', { bubbles: true }));
            assert(document.getElementById('section-exec').innerText.trim() === 'For Globex, see [COMPANY NAME] and Globex.', 'repaired tokens are not live');
        } }],
    },
    {
        id: 'BUG-001-library', title: 'Every library template converts to exactly the expected text', tags: ['tokens', 'library', 'stage1'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
            set('input-client-name', 'Acme Corp'); set('input-company-name', 'Sec AB');
            set('input-contact-name', 'Ada'); set('input-contact-email', 'ada@sec.example');
            const values = { '[CLIENT NAME]': 'Acme Corp', '[COMPANY NAME]': 'Sec AB', '[CONTACT NAME]': 'Ada', '[CONTACT EMAIL]': 'ada@sec.example' };
            const bad = [];
            for (const [i, t] of library.entries()) {
                for (const field of ['description', 'remediation']) {
                    // Same path as addFinding(): template text is plain text, escaped into finding HTML (BUG-015).
                    const once = normalizeTokensInHtml(escapeHtml(t[field]));
                    const twice = normalizeTokensInHtml(once);
                    if (once !== twice) { bad.push(`#${i} ${field} (not idempotent)`); continue; }
                    const expected = t[field].replace(/\[(CLIENT NAME|COMPANY NAME|CONTACT NAME|CONTACT EMAIL)\]/g, m => values[m]);
                    const tpl = document.createElement('template');
                    tpl.innerHTML = once;
                    if (tpl.content.textContent !== expected) bad.push(`#${i} ${field}`);
                }
            }
            assert(bad.length === 0, `${bad.length} template fields wrong: ${bad.slice(0, 5).join(', ')}`);
        } }],
    },
    {
        id: 'BUG-015', title: 'Template text like "sc config <name>" and "<iframe>" is shown exactly as written', tags: ['library', 'stage1'],
        steps: [{ run: async () => {
            const { assert, cardFields } = __t;
            const pick = (needle) => library.findIndex(t => t.description.includes(needle) || t.remediation.includes(needle));
            for (const needle of ['<name>', '<commit>', '<iframe>']) {
                findings = []; renderAll();
                loadTemplate(pick(needle));
                await addFinding();
                const [, desc, rem] = cardFields(0);
                const text = desc.innerText + '\n' + rem.innerText;
                assert(text.includes(needle), `"${needle}" missing from the finding card`);
                assert(!desc.querySelector('iframe, name, commit'), `"${needle}" was parsed as an HTML element`);
            }
            // the last one added is the X-Frame-Options template: the text after "<iframe>" must be visible
            const tail = library[pick('<iframe>')].description.trim().slice(-40);
            assert(cardFields(0)[1].innerText.includes(tail.replace('[CLIENT NAME]', document.getElementById('input-client-name').value)), 'text after "<iframe>" is still swallowed');
        } }],
    },
    {
        id: 'BUG-014', title: 'Library template titles are unique', tags: ['library', 'stage2'],
        steps: [{ run: async () => {
            const seen = new Map(); const dups = [];
            library.forEach((t, i) => { const k = t.title.trim().toLowerCase(); if (seen.has(k)) dups.push(`#${seen.get(k)}/#${i} "${t.title}"`); else seen.set(k, i); });
            __t.assert(dups.length === 0, 'duplicate titles: ' + dups.join(', '));
        } }],
    },
    {
        id: 'BUG-010', title: 'Client name with < & is shown as text, not parsed as HTML', tags: ['tokens', 'stage1'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const client = document.getElementById('input-client-name');
            client.value = 'Smith <b>Bros</b> & Co'; client.dispatchEvent(new Event('input', { bubbles: true }));
            const el = document.getElementById('section-conclusion');
            el.insertAdjacentText('beforeend', ' For [CLIENT NAME].');
            el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            assert(el.querySelectorAll('b').length === 0, 'client name created a real <b> element');
            assert(el.innerText.includes('Smith <b>Bros</b> & Co'), 'client name not shown literally');
        } }],
    },

    // ---------------------------------------------------------------- import / export
    {
        id: 'BUG-002', title: 'Remembered dates/classification are carried into the exported file', tags: ['persistence', 'stage1'],
        steps: [
            { run: async () => {
                localStorage.setItem('rapportgen:meta-start-date', '2026-10-01');
                localStorage.setItem('rapportgen:meta-end-date', '2026-10-15');
                localStorage.setItem('rapportgen:meta-classification', 'Confidential');
            } },
            { run: async () => {   // reload: app restores the remembered values at startup, user exports without touching them
                const { assert, captureDownload } = __t;
                assert(document.getElementById('meta-start-date').value === '2026-10-01', 'precondition: start date not restored at startup');
                const { text } = await captureDownload(() => exportReportJson());
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {   // another machine: empty storage, import the file
                const { assert, pickFile } = __t;
                const alertText = await pickFile('importReportFile', ctx.exported, 'report.json');
                assert(alertText === null, 'import showed an error: ' + alertText);
                assert(document.getElementById('meta-start-date').value === '2026-10-01', `start date lost: "${document.getElementById('meta-start-date').value}"`);
                assert(document.getElementById('meta-end-date').value === '2026-10-15', 'end date lost');
                assert(document.getElementById('meta-classification').value === 'Confidential', `classification lost: "${document.getElementById('meta-classification').value}"`);
            } },
        ],
    },
    {
        id: 'BUG-003', title: 'Invalid import files are rejected and leave the report untouched', tags: ['import', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile } = __t;
            document.getElementById('vTitle').value = 'Keep me';
            await addFinding();
            const sectionsBefore = document.querySelectorAll('#reportBlocksContainer .report-block').length;
            const execBefore = document.getElementById('section-exec').innerHTML;
            const bad = [
                'this is not json',
                JSON.stringify({ findings: { not: 'an array' } }),
                JSON.stringify({ blocksHtml: '<div class="report-block"><h2>evil</h2></div>', findings: [] }),
                JSON.stringify([1, 2, 3]),
                JSON.stringify({ findings: [{ title: 42, impact: 'x' }], blocksHtml: 7 }),
            ];
            for (const text of bad) {
                const alertText = await pickFile('importReportFile', text, 'bad.json');
                assert(alertText !== null, `no error shown for invalid file: ${text.slice(0, 60)}`);
                assert(document.querySelectorAll('#reportBlocksContainer .report-block').length === sectionsBefore, `sections changed after invalid file: ${text.slice(0, 60)}`);
                assert(Array.isArray(findings) && findings.length === 1 && findings[0].title === 'Keep me', `findings changed after invalid file: ${text.slice(0, 60)}`);
                assert(document.getElementById('section-exec').innerHTML === execBefore, 'section text changed after invalid file');
            }
        } }],
    },
    {
        id: 'BUG-003-rollback', title: 'A failure halfway through applying an import restores the previous report', tags: ['import', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile, captureDownload } = __t;
            document.getElementById('vTitle').value = 'Original';
            await addFinding();
            const { text } = await captureDownload(() => exportReportJson());
            const other = JSON.parse(text);
            other.findings = [__t.finding({ title: 'Incoming' })];
            const execBefore = document.getElementById('section-exec').innerHTML;
            const original = window.renderAll;
            let calls = 0;
            window.renderAll = function () { if (calls++ === 0) throw new Error('simulated failure'); return original.apply(this, arguments); };
            const alertText = await pickFile('importReportFile', JSON.stringify(other));
            window.renderAll = original;
            assert(alertText !== null, 'no error shown after a failed apply');
            assert(findings.length === 1 && findings[0].title === 'Original', `report not rolled back: ${findings.map(f => f.title)}`);
            assert(document.getElementById('section-exec').innerHTML === execBefore, 'sections not rolled back');
            assert(__t.cards().length === 1, 'finding card not re-rendered after rollback');
        } }],
    },
    {
        id: 'ARCH-004-legacy', title: 'Old (v1) report files still import, with dates and a missing summary recovered', tags: ['import', 'stage1'],
        steps: [
            { run: async () => {
                const { captureDownload } = __t;
                const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
                set('meta-start-date', '2025-03-03'); set('meta-classification', 'Internal Use Only');
                document.getElementById('vTitle').value = 'Legacy finding';
                await addFinding();
                const v2 = JSON.parse((await captureDownload(() => exportReportJson())).text);
                const v1 = { ...v2 };
                delete v1.schemaVersion; delete v1.meta; delete v1.actionPlannersGloballyVisible;
                const tpl = document.createElement('template'); tpl.innerHTML = v1.blocksHtml;
                tpl.content.querySelector('#block-summary').remove();       // as saved by an old version after deleting it
                return { v1: JSON.stringify(v1), v1NoSummary: JSON.stringify({ ...v1, blocksHtml: tpl.innerHTML }) };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile } = __t;
                let alertText = await pickFile('importReportFile', ctx.v1);
                assert(alertText === null, 'v1 file rejected: ' + alertText);
                assert(document.getElementById('meta-start-date').value === '2025-03-03', 'v1 start date not recovered');
                assert(document.getElementById('meta-classification').value === 'Internal Use Only', 'v1 classification not recovered');
                assert(findings[0].title === 'Legacy finding', 'v1 findings not imported');
                alertText = await pickFile('importReportFile', ctx.v1NoSummary);
                assert(alertText === null, 'v1 file without summary rejected: ' + alertText);
                assert(document.querySelectorAll('#matrix td').length === 25, 'risk matrix not restored');
                findings[0].impact = 4; findings[0].exploit = 4; renderAll();
                assert(document.querySelectorAll('#matrix .finding-dot').length === 1, 'restored matrix does not plot findings');
            } },
        ],
    },
    {
        id: 'ARCH-004-newer', title: 'A file from a newer format version is refused with an explanation', tags: ['import', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile } = __t;
            const payload = { ...buildReportPayload(), schemaVersion: 99 };
            const alertText = await pickFile('importReportFile', JSON.stringify(payload));
            assert(alertText && alertText.includes('newer version'), `unexpected message: ${alertText}`);
        } }],
    },
    {
        id: 'BUG-011', title: 'Deleting the Findings Summary section does not break the app', tags: ['stage1'],
        steps: [{ run: async () => {
            const { assert, answerModal, cards } = __t;
            document.querySelector('#block-summary .control-danger').click();
            await answerModal(true);
            await answerModal(true, 300);       // dismiss an "can't delete" alert, if the fix shows one
            document.getElementById('vTitle').value = 'After summary delete';
            await addFinding();
            assert(cards().length === 1, 'adding a finding failed after deleting the summary section');
        } }],
    },
    {
        id: 'BUG-004', title: 'Exporting clears the autosave, so no stale restore prompt appears', tags: ['autosave', 'stage2'],
        steps: [
            { run: async () => {
                const { captureDownload } = __t;
                document.getElementById('vTitle').value = 'Exported finding';
                await addFinding();
                await autosaveReport();
                await captureDownload(() => exportReportJson());
            } },
            { run: async () => {
                const { assert, sleep, modalOpen } = __t;
                await sleep(800);
                assert(!modalOpen(), 'a restore prompt appeared even though the report was exported');
            } },
        ],
    },
    {
        id: 'BUG-005', title: 'Autosave works for a report with ~9 MB of screenshots', tags: ['autosave', 'stage2'],
        steps: [
            { run: async () => {
                findings.push(__t.finding({ title: 'Big evidence', description: '<p>x</p><img src="data:image/png;base64,' + 'A'.repeat(9 * 1024 * 1024) + '">' }));
                renderAll(); markUnsaved();
                await autosaveReport();
            } },
            { run: async () => {
                const { assert, answerModal, waitFor, modalOpen } = __t;
                await waitFor(modalOpen, 4000, 'restore prompt');
                await answerModal(true);
                assert(findings.length === 1 && findings[0].title === 'Big evidence', 'large draft was not restored');
                assert(findings[0].description.length > 9 * 1024 * 1024, 'restored draft lost its screenshot');
            } },
        ],
    },
    {
        id: 'BUG-012', title: 'Global Action Planner toggle survives export/import', tags: ['persistence', 'stage2'],
        steps: [
            { run: async () => {
                document.getElementById('vTitle').value = 'Planner finding';
                await addFinding();
                toggleAllActionPlanners();
                const { text } = await __t.captureDownload(() => exportReportJson());
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile } = __t;
                await pickFile('importReportFile', ctx.exported);
                assert(actionPlannersGloballyVisible === true, 'global planner flag not restored');
                assert(document.getElementById('omitPlannersIcon').classList.contains('active'), 'planner toggle icon shows the wrong state');
            } },
        ],
    },

    // ---------------------------------------------------------------- small correctness bugs
    {
        id: 'BUG-006', title: 'Library search tolerates entries missing title/cwe', tags: ['library', 'stage2'],
        steps: [{ run: async () => {
            const { assert, pickFile } = __t;
            await pickFile('importLibraryFile', JSON.stringify([...library.slice(0, 5), { title: 'No CWE entry', category: 'X', description: 'd', remediation: 'r' }, { category: 'Y' }]));
            const search = document.getElementById('librarySearch');
            search.value = 'injection'; search.dispatchEvent(new Event('input', { bubbles: true }));
            assert(document.querySelectorAll('#libraryResults .library-item').length >= 1, 'search returned nothing for "injection"');
            search.value = 'no cwe'; search.dispatchEvent(new Event('input', { bubbles: true }));
            assert(document.querySelectorAll('#libraryResults .library-item').length === 1, 'entry without a CWE is not searchable');
        } }],
    },
    {
        id: 'BUG-007', title: 'False-positive findings are not counted or plotted', tags: ['scoring', 'stage2'],
        steps: [{ run: async () => {
            const { assert } = __t;
            findings.push(__t.finding({ impact: 5, exploit: 5, status: 'False Positive' }));
            renderAll();
            const crit = document.querySelector('#execSeverityTableContainer td').innerText.trim();
            assert(crit === '0', `false positive counted as Critical (count ${crit})`);
            assert(document.querySelectorAll('#matrix .finding-dot').length === 0, 'false positive plotted on the matrix');
        } }],
    },
    {
        id: 'BUG-008', title: 'Find & Replace inserts "$&" literally', tags: ['find-replace', 'stage2'],
        steps: [{ run: async () => {
            const { assert, answerModal } = __t;
            findings.push(__t.finding({ title: 'Price X' })); renderAll();
            openFindReplace();
            document.getElementById('frFindInput').value = 'X';
            document.getElementById('frReplaceInput').value = 'US$&';
            document.getElementById('frCaseSensitive').checked = true;
            const done = runFindReplace(); await answerModal(true); await done;
            assert(findings[0].title === 'Price US$&', `got "${findings[0].title}"`);
        } }],
    },
    {
        id: 'BUG-009', title: 'Finding titles starting with a number are not mangled', tags: ['stage2'],
        steps: [{ run: async () => {
            const { assert, cardFields } = __t;
            document.getElementById('vTitle').value = 'x';
            await addFinding();
            const title = cardFields(0)[0];
            title.innerText = '802.1X not enforced';
            title.dispatchEvent(new FocusEvent('blur'));
            title.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            assert(findings[0].title === '802.1X not enforced', `title saved as "${findings[0].title}"`);
        } }],
    },
    {
        id: 'BUG-013', title: 'Text typed into a finding (not yet blurred) is included in the saved payload', tags: ['autosave', 'stage2'],
        steps: [{ run: async () => {
            const { assert, cardFields, sleep } = __t;
            document.getElementById('vTitle').value = 'Typing';
            await addFinding();
            const desc = cardFields(0)[1];
            desc.innerHTML = 'freshly typed text 4711';
            desc.dispatchEvent(new Event('input', { bubbles: true }));
            // no wait: building the payload (autosave/export) must flush the pending edit itself
            assert(JSON.stringify(buildReportPayload().findings).includes('freshly typed text 4711'), 'in-progress edit missing from the save payload');
        } }],
    },

    // ---------------------------------------------------------------- performance
    {
        id: 'PERF-001', title: 'Listener count stays constant across renders and imports', tags: ['perf', 'stage2'],
        steps: [{ run: async () => {
            const { assert, pickFile, captureDownload, listenerCounts } = __t;
            const relevant = () => Object.entries(listenerCounts)
                .filter(([k]) => /^(dragover|dragstart|dragend|drop|change|mousedown)@/.test(k) && !/vuln-card|drag-handle|vuln-drag-handle/.test(k))
                .reduce((sum, [, v]) => sum + v, 0);
            document.getElementById('vTitle').value = 'Leak check';
            await addFinding();
            const before = relevant();
            for (let i = 0; i < 50; i++) renderAll();
            const { text } = await captureDownload(() => exportReportJson());
            for (let i = 0; i < 3; i++) await pickFile('importReportFile', text);
            const after = relevant();
            assert(after === before, `container listeners grew from ${before} to ${after}`);
        } }],
    },

    // ---------------------------------------------------------------- TEST-002 round trip
    {
        id: 'TEST-002', title: 'Export → import round-trip preserves the whole report', tags: ['persistence', 'stage1'],
        steps: [
            { run: async () => {
                const { captureDownload, cards } = __t;
                const set = (id, v, ev = 'input') => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event(ev, { bubbles: true })); };
                set('input-client-name', 'Acme Corp'); set('input-company-name', 'Sec AB');
                set('input-contact-name', 'Ada Tester'); set('input-contact-email', 'ada@sec.example');
                set('meta-start-date', '2026-09-01', 'change'); set('meta-end-date', '2026-09-12', 'change');
                set('meta-classification', 'Restricted', 'change');
                document.getElementById('toggleTOC').click();
                document.getElementById('watermarkEnabled').click();
                document.getElementById('watermarkModeCustom').click();
                set('watermarkCustomText', 'DRAFT');
                document.getElementById('section-exec').insertAdjacentText('beforeend', ' UNIQUE-EXEC-MARKER');
                document.getElementById('newHeadline').value = 'Custom Appendix'; addNewSection();
                for (const [idx, assets] of [[0, 'web01, web02'], [5, 'db01']]) {
                    loadTemplate(idx); document.getElementById('vAssets').value = assets; await addFinding();
                }
                const pick = (card, n, v) => { const s = cards()[card].querySelectorAll('select')[n]; s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
                pick(0, 0, '5'); pick(0, 1, '4'); pick(0, 2, 'Open'); pick(1, 0, '2'); pick(1, 1, '2'); pick(1, 2, 'Remediated');
                const snap = snapshotReport();
                const { text } = await captureDownload(() => exportReportJson());
                return { exported: text, snap };

                function snapshotReport() {
                    return {
                        client: document.getElementById('input-client-name').value,
                        company: document.getElementById('input-company-name').value,
                        contact: document.getElementById('input-contact-name').value,
                        email: document.getElementById('input-contact-email').value,
                        start: document.getElementById('meta-start-date').value,
                        end: document.getElementById('meta-end-date').value,
                        classification: document.getElementById('meta-classification').value,
                        toc: document.getElementById('toggleTOC').checked,
                        watermark: [document.getElementById('watermarkEnabled').checked, document.querySelector('input[name="watermarkMode"]:checked').value, document.getElementById('watermarkCustomText').value],
                        assessmentType: document.getElementById('input-assessment-type').value,
                        headings: [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText.trim()),
                        execHasMarker: document.getElementById('section-exec').innerText.includes('UNIQUE-EXEC-MARKER'),
                        findings: findings.map(f => [f.title, f.impact, f.exploit, f.status, (f.assets || []).join('|')]),
                        severityCounts: [...document.querySelectorAll('#execSeverityTableContainer td')].map(td => td.innerText.trim()),
                    };
                }
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile } = __t;
                const alertText = await pickFile('importReportFile', ctx.exported);
                assert(alertText === null, 'import error: ' + alertText);
                const now = {
                    client: document.getElementById('input-client-name').value,
                    company: document.getElementById('input-company-name').value,
                    contact: document.getElementById('input-contact-name').value,
                    email: document.getElementById('input-contact-email').value,
                    start: document.getElementById('meta-start-date').value,
                    end: document.getElementById('meta-end-date').value,
                    classification: document.getElementById('meta-classification').value,
                    toc: document.getElementById('toggleTOC').checked,
                    watermark: [document.getElementById('watermarkEnabled').checked, document.querySelector('input[name="watermarkMode"]:checked').value, document.getElementById('watermarkCustomText').value],
                    assessmentType: document.getElementById('input-assessment-type').value,
                    headings: [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText.trim()),
                    execHasMarker: document.getElementById('section-exec').innerText.includes('UNIQUE-EXEC-MARKER'),
                    findings: findings.map(f => [f.title, f.impact, f.exploit, f.status, (f.assets || []).join('|')]),
                    severityCounts: [...document.querySelectorAll('#execSeverityTableContainer td')].map(td => td.innerText.trim()),
                };
                const diffs = Object.keys(ctx.snap).filter(k => JSON.stringify(ctx.snap[k]) !== JSON.stringify(now[k]));
                assert(diffs.length === 0, 'changed after round trip: ' + diffs.map(k => `${k} ${JSON.stringify(ctx.snap[k])} → ${JSON.stringify(now[k])}`).join('; '));
            } },
        ],
    },

    // ---------------------------------------------------------------- TEST-003 security corpus
    {
        id: 'SEC-001', title: 'Script in an imported report never executes', tags: ['security', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile, sleep } = __t;
            const js = 'window.__pwned=(window.__pwned||0)+1';
            const img = `<img src=x onerror="${js}">`;
            const base = buildReportPayload();
            const payload = {
                ...base,
                blocksHtml: base.blocksHtml.replace('id="section-exec">', `id="section-exec">${img}<a id="jslink" href="javascript:${js}">x</a><iframe srcdoc="<script>parent.${js}<\/script>"></iframe>`),
                currentLogo: `x" onerror="${js}`,
                companyName: img,
                findings: [__t.finding({ title: img, category: img, cwe: img, assets: [img], description: `${img} at [COMPANY NAME]`, remediation: `<svg onload="${js}"></svg>`, retestDate: `"><img src=x onerror="${js}">` })],
            };
            window.__pwned = 0;
            await pickFile('importReportFile', JSON.stringify(payload));
            renderAll();
            await sleep(600);
            assert(!window.__pwned, `script executed ${window.__pwned} time(s) from an imported report`);
            assert(!document.querySelector('#printableReport a[href^="javascript:"]'), 'javascript: link survived import');
            assert(!document.querySelector('#printableReport iframe'), 'iframe survived import');
        } }],
    },
    {
        id: 'SEC-001-formatting', title: 'Toolbar formatting survives export → import (rich-text policy)', tags: ['security', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile } = __t;
            const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            // What the floating toolbar (document.execCommand) and plain typing produce in Chrome/Edge:
            const rich = `<b>bold</b> <i>italic</i> <strike>gone</strike> <font size="5">big</font> <font color="#dc3545">red</font>`
                + `<div style="text-align: center;">centered</div><blockquote>quote</blockquote><pre>code block</pre>`
                + `<ul><li>bullet</li></ul><ol><li>number</li></ol><h3>Sub heading</h3><strong>strong</strong><br><img src="${png}">`;
            const expectations = ['b', 'i', 'strike', 'font[size="5"]', 'font[color="#dc3545"]', 'div[style*="text-align"]', 'blockquote', 'pre', 'ul > li', 'ol > li', 'h3', 'strong', 'br', 'img[src^="data:image/png"]'];
            const base = buildReportPayload();
            const payload = {
                ...base,
                blocksHtml: base.blocksHtml.replace(/(id="section-exec">)[\s\S]*?(<\/div>\s*<\/div>)/, `$1${rich}$2`),
                findings: [__t.finding({ description: rich, remediation: rich })],
            };
            const alertText = await pickFile('importReportFile', JSON.stringify(payload));
            assert(alertText === null, 'import error: ' + alertText);
            const where = { section: document.getElementById('section-exec'), description: __t.cardFields(0)[1], remediation: __t.cardFields(0)[2] };
            const missing = [];
            for (const [name, el] of Object.entries(where)) for (const sel of expectations) if (!el.querySelector(sel)) missing.push(`${name}: ${sel}`);
            assert(missing.length === 0, 'formatting lost on import → ' + missing.join(', '));
        } }],
    },
    {
        id: 'SEC-001-structure', title: 'Section controls still work after an import', tags: ['security', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile, answerModal } = __t;
            await pickFile('importReportFile', JSON.stringify(buildReportPayload()));
            const order = () => [...document.querySelectorAll('#reportBlocksContainer > .report-block')].map(b => b.id || b.querySelector('h2')?.innerText);
            const before = order();
            document.querySelector('#block-scope .block-control-btn[onclick="moveSectionUp(this)"]').click();
            const after = order();
            const i = before.indexOf('block-scope');
            assert(after[i - 1] === 'block-scope', 'move-up control did nothing after import');
            const start = document.getElementById('meta-start-date');
            start.value = '2026-01-02'; start.dispatchEvent(new Event('change', { bubbles: true }));
            assert(localStorage.getItem('rapportgen:meta-start-date') === '2026-01-02', 'metadata onchange handler lost after import');
            document.querySelector('#block-conclusion .control-danger').click();
            await answerModal(true);
            assert(!document.getElementById('block-conclusion'), 'delete control did nothing after import');
        } }],
    },
    {
        id: 'SEC-002', title: 'Script in an imported library never executes', tags: ['security', 'stage1'],
        steps: [{ run: async () => {
            const { assert, pickFile, sleep } = __t;
            const img = '<img src=x onerror="window.__pwned=(window.__pwned||0)+1">';
            window.__pwned = 0;
            await pickFile('importLibraryFile', JSON.stringify([{ title: img, category: img, cwe: img, description: img, remediation: img }]));
            openAddFindingModal(); filterLibrary();
            await sleep(300);
            document.querySelector('#libraryResults .library-item').click();
            await addFinding();
            await sleep(500);
            assert(!window.__pwned, `script executed ${window.__pwned} time(s) from an imported library`);
        } }],
    },
];

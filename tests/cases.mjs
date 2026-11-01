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
        id: 'BUG-004-race', title: 'Exporting while an autosave is pending never resurrects the draft', tags: ['autosave', 'stage2'],
        steps: [
            { run: async () => {
                document.getElementById('vTitle').value = 'Racy';
                await addFinding();                                   // schedules an autosave ~2 s later
                await __t.captureDownload(() => exportReportJson());  // export before it fires
                await __t.sleep(2600);                                // let the idle timer pass
            } },
            { run: async () => {
                await __t.sleep(800);
                __t.assert(!__t.modalOpen(), 'a restore prompt appeared after exporting');
            } },
        ],
    },
    {
        id: 'BUG-005-legacy', title: 'A draft saved by the old version (localStorage) is still offered, then moved to IndexedDB', tags: ['autosave', 'stage2'],
        steps: [
            { run: async () => {
                const data = buildReportPayload();
                delete data.schemaVersion; delete data.meta;                    // as the old version wrote it
                data.findings = [__t.finding({ title: 'Legacy draft finding' })];
                localStorage.setItem('rapportgen:autosave', JSON.stringify({ savedAt: Date.now() - 60000, data }));
            } },
            { run: async () => {
                const { assert, answerModal, waitFor, modalOpen } = __t;
                await waitFor(modalOpen, 4000, 'restore prompt');
                await answerModal(true);
                assert(findings.length === 1 && findings[0].title === 'Legacy draft finding', 'legacy draft not restored');
                await autosaveReport();
                assert(localStorage.getItem('rapportgen:autosave') === null, 'legacy localStorage draft not cleaned up after moving to IndexedDB');
            } },
        ],
    },
    {
        id: 'UI-009', title: 'Save status line reflects unsaved / autosaved / exported / failed', tags: ['autosave', 'stage2'],
        steps: [{ run: async () => {
            const { assert, captureDownload } = __t;
            const status = () => document.getElementById('saveStatus');
            assert(status().textContent === 'No unsaved changes', `initial: "${status().textContent}"`);
            document.getElementById('vTitle').value = 'Status'; await addFinding();
            assert(status().textContent.startsWith('Not exported'), `after edit: "${status().textContent}"`);
            await autosaveReport();
            assert(status().textContent.includes('draft kept in this browser'), `after autosave: "${status().textContent}"`);
            await captureDownload(() => exportReportJson());
            assert(status().textContent.startsWith('All changes exported'), `after export: "${status().textContent}"`);
            // both stores refuse the write → red warning
            const origOpen = indexedDB.open.bind(indexedDB);
            indexedDB.open = () => { throw new Error('simulated'); };
            autosaveDbPromise = null;
            const origSet = Storage.prototype.setItem;
            Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); };
            markUnsaved();
            await autosaveReport();
            Storage.prototype.setItem = origSet; indexedDB.open = origOpen; autosaveDbPromise = null;
            assert(status().classList.contains('is-error') && status().textContent.startsWith('Autosave failed'), `after failure: "${status().textContent}"`);
        } }],
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
            await pickFile('importLibraryFile', JSON.stringify([...library.slice(0, 5), { title: 'Zyxwv entry without CWE', category: 'X', description: 'd', remediation: 'r' }, { category: 'Y' }]));
            const search = document.getElementById('librarySearch');
            search.value = 'injection'; search.dispatchEvent(new Event('input', { bubbles: true }));
            assert(document.querySelectorAll('#libraryResults .library-item').length >= 1, 'search returned nothing for "injection"');
            search.value = 'zyxwv'; search.dispatchEvent(new Event('input', { bubbles: true }));
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

    {
        id: 'PERF-001-dnd', title: 'Drag-and-drop still reorders findings and sections (delegated listeners)', tags: ['perf', 'dnd', 'stage2'],
        steps: [{ run: async () => {
            const { assert, sleep, cards } = __t;
            const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const drag = async (handle, overEl, y) => {
                handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true }));
                overEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: y }));
                await frame();
                handle.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
                await sleep(30);
            };
            for (const t of ['A', 'B', 'C']) { document.getElementById('vTitle').value = t; await addFinding(); }
            for (let i = 0; i < 20; i++) renderAll();           // used to multiply the drop handlers
            hasUnsavedChanges = false;
            // 1) drag C above A
            let first = cards()[0].getBoundingClientRect();
            await drag(cards()[2].querySelector('.vuln-drag-handle'), cards()[0], first.top + 2);
            assert(findings.map(f => f.title).join('') === 'CAB', `reorder within section gave ${findings.map(f => f.title).join('')}`);
            assert(hasUnsavedChanges, 'a drag reorder did not mark the report as unsaved');
            // 2) move B into a second Detailed Findings section
            document.getElementById('newHeadline').value = 'Internal'; addNewDetailsSection();
            const second = document.querySelectorAll('.details-block')[1];
            const box = second.querySelector('.findings-container').getBoundingClientRect();
            const bCard = cards().find(c => c.querySelector('[data-field="title"]').innerText.trim() === 'B');
            await drag(bCard.querySelector('.vuln-drag-handle'), second.querySelector('.findings-container'), box.bottom - 2);
            const b = findings.find(f => f.title === 'B');
            assert(b.sectionId === second.id, 'finding did not move to the other section');
            assert(findings.length === 3, `finding count changed to ${findings.length}`);
            // 3) drag the Conclusion section above Executive Summary
            const exec = document.getElementById('block-exec-summary').getBoundingClientRect();
            await drag(document.querySelector('#block-conclusion .drag-handle'), document.getElementById('block-exec-summary'), exec.top + 2);
            const ids = [...document.querySelectorAll('#reportBlocksContainer > .report-block')].map(b => b.id);
            assert(ids.indexOf('block-conclusion') === ids.indexOf('block-exec-summary') - 1, 'section drag did not move the section');
        } }],
    },

    // ---------------------------------------------------------------- step 3: images and evidence
    {
        id: 'PERF-003', title: 'Large images are scaled to print width; screenshots stay PNG, photos get smaller', tags: ['images', 'stage3'],
        steps: [{ run: async () => {
            const { assert, makeImageFile, imageSize } = __t;
            const photo = await makeImageFile('photo', 3000, 2000);
            const photoUrl = await prepareImageForReport(photo);
            const photoSize = await imageSize(photoUrl);
            assert(photoSize.width === 1600 && photoSize.height === 1067, `photo not scaled: ${photoSize.width}x${photoSize.height}`);
            assert(!photoUrl.startsWith('data:image/png'), 'noisy photo kept as (huge) PNG');
            assert(photoUrl.length * 0.75 < photo.size / 3, `photo barely shrank: ${Math.round(photo.size / 1024)} KB → ${Math.round(photoUrl.length * 0.75 / 1024)} KB`);

            const shot = await makeImageFile('screenshot', 2400, 1400);
            const shotUrl = await prepareImageForReport(shot);
            assert(shotUrl.startsWith('data:image/png'), 'screenshot (text) was re-encoded lossy');
            assert((await imageSize(shotUrl)).width === 1600, 'screenshot not scaled to print width');

            const small = await makeImageFile('screenshot', 600, 300);
            const smallUrl = await prepareImageForReport(small);
            const original = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(small); });
            assert(smallUrl === original, 'a small image was needlessly re-encoded');

            const transparent = await makeImageFile('photo', 2000, 1000, { alpha: true });
            const transparentUrl = await prepareImageForReport(transparent);
            assert(!transparentUrl.startsWith('data:image/jpeg'), 'transparent image turned into JPEG (transparency lost)');
        } }],
    },
    {
        id: 'FEAT-005-paste', title: 'Pasting a screenshot inserts a compressed, captioned figure', tags: ['images', 'stage3'],
        steps: [{ run: async () => {
            const { assert, makeImageFile, caretAtEnd, imageSize, waitFor } = __t;
            const section = document.getElementById('section-conclusion');
            caretAtEnd(section);
            const dt = new DataTransfer(); dt.items.add(await makeImageFile('photo', 3000, 2000));
            section.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            await waitFor(() => section.querySelector('figure img'), 5000, 'pasted figure');
            const img = section.querySelector('figure img');
            assert((await imageSize(img.src)).width <= 1600, 'pasted image not scaled down');
            assert(section.querySelector('figure figcaption').innerText.includes('[insert figure caption]'), 'caption placeholder missing');
            assert(hasUnsavedChanges, 'paste did not mark the report as unsaved');
            renderChecklist();
            assert(/Leftover boilerplate placeholders/.test(document.getElementById('checklistBody').innerText), 'checklist does not flag the unwritten caption');
            // text pastes are untouched
            const before = section.innerHTML;
            const textDt = new DataTransfer(); textDt.setData('text/plain', 'hello');
            const ev = new ClipboardEvent('paste', { clipboardData: textDt, bubbles: true, cancelable: true });
            section.dispatchEvent(ev);
            assert(!ev.defaultPrevented && section.innerHTML === before, 'plain-text paste was intercepted');
        } }],
    },
    {
        id: 'FEAT-005-finding', title: 'A screenshot pasted into a finding is saved with the finding and survives export/import', tags: ['images', 'stage3'],
        steps: [
            { run: async () => {
                const { assert, makeImageFile, caretAtEnd, waitFor, cardFields, captureDownload } = __t;
                document.getElementById('vTitle').value = 'With evidence'; await addFinding();
                const desc = cardFields(0)[1];
                caretAtEnd(desc);
                const dt = new DataTransfer(); dt.items.add(await makeImageFile('screenshot', 1200, 700));
                desc.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
                await waitFor(() => desc.querySelector('figure img'), 5000, 'pasted figure');
                const { text } = await captureDownload(() => exportReportJson());
                assert(JSON.parse(text).findings[0].description.includes('<figure>'), 'figure not saved in the finding');
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile, cardFields } = __t;
                await pickFile('importReportFile', ctx.exported);
                const desc = cardFields(0)[1];
                assert(desc.querySelector('figure > img[src^="data:image/"]') && desc.querySelector('figure > figcaption'), 'figure lost on import');
            } },
        ],
    },
    {
        id: 'FEAT-005-title', title: 'Images are not pasted into headings or finding titles', tags: ['images', 'stage3'],
        steps: [{ run: async () => {
            const { assert, makeImageFile, caretAtEnd, sleep, cardFields } = __t;
            document.getElementById('vTitle').value = 'T'; await addFinding();
            const title = cardFields(0)[0];
            caretAtEnd(title);
            const dt = new DataTransfer(); dt.items.add(await makeImageFile('screenshot', 400, 200));
            title.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            await sleep(500);
            assert(!title.querySelector('img, figure'), 'image ended up in a finding title');
        } }],
    },
    {
        id: 'FEAT-005-redact', title: 'Redaction burns black boxes into the image pixels', tags: ['images', 'stage3'],
        steps: [{ run: async () => {
            const { assert, caretAtEnd, waitFor, sleep, answerModal } = __t;
            // a plain white 400x200 image, inserted via the same path as a paste
            const c = document.createElement('canvas'); c.width = 400; c.height = 200;
            const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, 400, 200);
            const file = new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'white.png', { type: 'image/png' });
            const section = document.getElementById('section-conclusion');
            await insertEvidenceImages([file], caretAtEnd(section));
            const img = section.querySelector('figure img');
            assert(img, 'figure not inserted');
            // nothing selected yet → explains what to do
            selectEvidenceImage(null);
            const opened = openRedactModal();
            assert((await answerModal(true)) !== null, 'no hint shown when no image is selected');
            await opened;
            // select the image and draw one box over the left half
            img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            assert(getComputedStyle(document.getElementById('imageSelectionOutline')).display === 'block', 'selected image is not outlined');
            await openRedactModal();
            const canvas = document.getElementById('redactCanvas');
            const r = canvas.getBoundingClientRect();
            const at = (fx, fy) => ({ clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, pointerId: 1, bubbles: true });
            canvas.dispatchEvent(new PointerEvent('pointerdown', at(0.02, 0.02)));
            canvas.dispatchEvent(new PointerEvent('pointermove', at(0.5, 0.98)));
            canvas.dispatchEvent(new PointerEvent('pointerup', at(0.5, 0.98)));
            assert(document.getElementById('redactBoxCount').textContent === '1 box', 'box not recorded');
            hasUnsavedChanges = false;
            applyRedaction();
            await sleep(100);
            const out = new Image(); out.src = img.src; await out.decode();
            const check = document.createElement('canvas'); check.width = out.naturalWidth; check.height = out.naturalHeight;
            const ctx = check.getContext('2d'); ctx.drawImage(out, 0, 0);
            const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
            assert(px(50, 100).every(v => v < 20), `covered area is not black: ${px(50, 100)}`);
            assert(px(350, 100).every(v => v > 235), `uncovered area changed: ${px(350, 100)}`);
            assert(hasUnsavedChanges, 'redaction did not mark the report as unsaved');
            assert(document.getElementById('redactModalOverlay').style.display === 'none', 'redact dialog still open');
        } }],
    },

    // ---------------------------------------------------------------- step 4: usability
    {
        id: 'UI-001', title: 'Dialogs: Escape closes, Tab stays inside, focus returns, nested dialogs close one at a time', tags: ['ui', 'stage4'],
        steps: [{ run: async () => {
            const { assert, sleep } = __t;
            const key = (k, opts = {}) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
            const shown = id => getComputedStyle(document.getElementById(id)).display !== 'none';
            // Find & Replace: focus starts in the find field, Escape closes, focus goes back
            toggleSidebar();                                  // the sidebar starts collapsed; its buttons can't take focus until shown
            const frButton = document.querySelector('.sidebar [onclick*="openFindReplace"]') || document.querySelector('[onclick*="openFindReplace"]');
            frButton.focus();
            assert(document.activeElement === frButton, 'precondition: Find & Replace button not focusable');
            frButton.click();
            assert(shown('findReplaceOverlay') && document.activeElement.id === 'frFindInput', 'Find & Replace did not open with focus in the find field');
            // Tab from the last control wraps to the first; Shift+Tab from the first wraps to the last
            const items = [...document.querySelectorAll('#findReplaceOverlay button, #findReplaceOverlay input')];
            items[items.length - 1].focus(); key('Tab');
            assert(document.getElementById('findReplaceOverlay').contains(document.activeElement) && document.activeElement === items[0], 'Tab escaped the dialog');
            key('Tab', { shiftKey: true });
            assert(document.activeElement === items[items.length - 1], 'Shift+Tab did not wrap to the last control');
            key('Escape');
            assert(!shown('findReplaceOverlay'), 'Escape did not close Find & Replace');
            assert(document.activeElement === frButton, 'focus did not return to the button that opened the dialog');
            // Enter in the find field runs the replacement
            findings.push(__t.finding({ title: 'Alpha' })); renderAll();
            openFindReplace();
            document.getElementById('frFindInput').value = 'Alpha'; document.getElementById('frReplaceInput').value = 'Beta';
            key('Enter'); await sleep(50);
            assert(findings[0].title === 'Beta', 'Enter in Find & Replace did not run it');
            key('Escape'); await sleep(20);                  // closes the "Replaced 1 occurrence" alert
            assert(!shown('appModalOverlay'), 'Escape did not close the result alert');
            // nested: a confirm on top of Add Finding closes alone
            openAddFindingModal();
            const confirmP = showConfirm('Nested?');
            assert(shown('appModalOverlay') && shown('addFindingModalOverlay'), 'nested confirm did not open over Add Finding');
            key('Escape');
            assert((await confirmP) === false, 'Escape on a confirm did not answer "cancel"');
            assert(!shown('appModalOverlay') && shown('addFindingModalOverlay'), 'Escape closed more than the top dialog');
            key('Escape');
            assert(!shown('addFindingModalOverlay'), 'second Escape did not close Add Finding');
            // redaction dialog closes with Escape too
            const s = document.getElementById('section-conclusion');
            await insertEvidenceImages([await __t.makeImageFile('screenshot', 300, 150)], __t.caretAtEnd(s));
            s.querySelector('figure img').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await openRedactModal();
            key('Escape');
            assert(!shown('redactModalOverlay'), 'Escape did not close the redaction dialog');
        } }],
    },
    {
        id: 'UI-002', title: 'Assets: type + Enter, paste a list, edit, remove — no browser prompt', tags: ['ui', 'stage4'],
        steps: [{ run: async () => {
            const { assert, cards, nativeDialogs } = __t;
            document.getElementById('vTitle').value = 'Assets'; await addFinding();
            const input = () => cards()[0].querySelector('.asset-entry-input');
            const names = () => findings[0].assets.join('|');
            cards()[0].querySelector('[data-asset-add]').click();
            assert(input() && document.activeElement === input(), 'asset input did not open focused');
            input().value = 'web01'; input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            assert(names() === 'web01' && document.activeElement === input(), 'Enter did not add the asset and keep the input open');
            const dt = new DataTransfer(); dt.setData('text/plain', 'db01\n10.0.0.5\r\nweb01\n  app.example.com ');
            input().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
            assert(names() === 'web01|db01|10.0.0.5|app.example.com', `pasted list gave ${names()}`);
            input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            assert(!input(), 'Escape did not close the asset input');
            // edit: double-click puts it back in the input
            cards()[0].querySelector('[data-asset-edit="1"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            assert(input() && input().value === 'db01', 'double-click did not open the asset for editing');
            input().value = 'db02'; input().dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
            assert(names() === 'web01|10.0.0.5|app.example.com|db02', `edit gave ${names()}`);
            // remove
            cards()[0].querySelector('[data-asset-remove="0"]').click();
            assert(names() === '10.0.0.5|app.example.com|db02', `remove gave ${names()}`);
            assert(hasUnsavedChanges, 'asset edits did not mark the report as unsaved');
            assert(nativeDialogs.length === 0, 'a native browser dialog was used: ' + nativeDialogs.join('; '));
            // the Add Finding form accepts a pasted multi-line list
            const vAssets = document.getElementById('vAssets');
            const dt2 = new DataTransfer(); dt2.setData('text/plain', 'a1\na2\na3');
            vAssets.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
            document.getElementById('vTitle').value = 'Form assets'; await addFinding();
            assert(findings[1].assets.join('|') === 'a1|a2|a3', `form list gave ${findings[1].assets.join('|')}`);
        } }],
    },
    {
        id: 'UI-003', title: 'New findings go into the chosen section; empty sections offer "Add a finding here"', tags: ['ui', 'stage4'],
        steps: [{ run: async () => {
            const { assert, sleep } = __t;
            document.getElementById('newHeadline').value = 'Internal Network'; addNewDetailsSection();
            const [first, second] = [...document.querySelectorAll('.details-block')];
            openAddFindingModal();
            const select = document.getElementById('vTargetSection');
            assert(!select.closest('.target-section-row').classList.contains('d-none'), 'section picker hidden although there are two sections');
            assert([...select.options].map(o => o.textContent).includes('Internal Network'), 'picker does not list the new section');
            select.value = second.id;
            document.getElementById('vTitle').value = 'Internal finding'; await addFinding();
            assert(findings[0].sectionId === second.id, 'finding not added to the chosen section');
            assert(second.querySelector('.vuln-card'), 'card not rendered in the chosen section');
            closeAddFindingModal();
            openAddFindingModal();
            assert(document.getElementById('vTargetSection').value === second.id, 'last used section not remembered');
            closeAddFindingModal();
            // the empty first section offers a shortcut that preselects it
            const here = first.querySelector('[data-add-finding-to]');
            assert(here, 'empty section has no "Add a finding here" button');
            here.click(); await sleep(20);
            assert(getComputedStyle(document.getElementById('addFindingModalOverlay')).display !== 'none', 'shortcut did not open Add Finding');
            assert(document.getElementById('vTargetSection').value === first.id, 'shortcut did not preselect its section');
            closeAddFindingModal();
            // single section: picker hidden
            second.querySelector('.control-danger').click(); await __t.answerModal(true);
            openAddFindingModal();
            assert(document.getElementById('vTargetSection').closest('.target-section-row').classList.contains('d-none'), 'picker shown with only one section');
        } }],
    },
    {
        id: 'UI-004', title: 'Library search: all fields, ranked, keyboard selection, overwrite protection', tags: ['ui', 'library', 'stage4'],
        steps: [{ run: async () => {
            const { assert, answerModal, sleep } = __t;
            openAddFindingModal();
            const search = document.getElementById('librarySearch');
            const type = (v) => { search.value = v; search.dispatchEvent(new Event('input', { bubbles: true })); };
            const titles = () => [...document.querySelectorAll('#libraryResults .library-item strong')].map(s => s.textContent);
            // a word that appears only in template text, not titles
            const bodyOnly = library.find(t => /kerberoast/i.test(t.description) && !/kerberoast/i.test(t.title));
            type('kerberoast');
            assert(titles().length >= 1, 'body-text search found nothing for "kerberoast"');
            if (bodyOnly) assert(titles().includes(bodyOnly.title), 'template mentioning kerberoast only in its text was not found');
            // multi-word: every word must match; title matches rank first
            type('sql injection');
            assert(titles()[0].toLowerCase().includes('sql injection'), `best match for "sql injection" was "${titles()[0]}"`);
            assert(document.querySelector('#libraryResults mark'), 'matches are not highlighted');
            assert(/\d+ templates?/.test(document.getElementById('libraryResultCount').textContent), 'result count missing');
            // category label ("Web Application" is the label for OWASP) is searchable
            type('web application xss');
            assert(titles().some(t => /cross-site scripting|xss/i.test(t)), 'category label + keyword search failed');
            // keyboard: ↓ ↓ Enter loads the second result
            type('injection');
            const second = titles()[1];
            search.focus();
            for (const k of ['ArrowDown', 'ArrowDown', 'Enter']) search.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
            await sleep(20);
            assert(document.getElementById('vTitle').value === second, `keyboard picked "${document.getElementById('vTitle').value}", expected "${second}"`);
            // loading another template over the untouched first one: no question
            type('csrf');
            document.querySelector('#libraryResults .library-item').click(); await sleep(20);
            assert(!__t.modalOpen(), 'asked for confirmation although the form only held a template');
            // after the user edits the form, loading a template asks first; Cancel keeps the edits
            document.getElementById('vDesc').value = 'My own notes';
            type('sql injection');
            document.querySelector('#libraryResults .library-item').click();
            const asked = await answerModal(false);
            assert(asked && asked.includes('Replace'), 'no confirmation before overwriting the user\'s edits');
            assert(document.getElementById('vDesc').value === 'My own notes', 'edits were overwritten after Cancel');
            // assets typed for this engagement survive loading a template
            document.getElementById('vAssets').value = 'host-a';
            document.querySelector('#libraryResults .library-item').click();
            await answerModal(true);
            assert(document.getElementById('vAssets').value === 'host-a', 'loading a template cleared the affected assets');
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

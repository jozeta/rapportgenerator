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
            const { assert, cardFields } = __t;
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
            const { assert, caretAtEnd, sleep, answerModal } = __t;
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
            const items = [...document.querySelectorAll('#findReplaceOverlay button, #findReplaceOverlay input')].filter(el => !el.disabled);
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

    {
        id: 'UI-008', title: 'Export file name includes client, assessment type and date', tags: ['ui', 'stage4'],
        steps: [{ run: async () => {
            const { assert, captureDownload } = __t;
            const today = new Date(); const pad = n => String(n).padStart(2, '0');
            const date = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            let { filename } = await captureDownload(() => exportReportJson());
            assert(filename === `web-application-pentest_${date}.json`, `without a client name: ${filename}`);
            const client = document.getElementById('input-client-name');
            client.value = 'Örebro Kommun / IT-avd. (Test)'; client.dispatchEvent(new Event('input', { bubbles: true }));
            ({ filename } = await captureDownload(() => exportReportJson()));
            assert(filename === `orebro-kommun-it-avd-test_web-application-pentest_${date}.json`, `with a client name: ${filename}`);
        } }],
    },

    ...[360, 390, 768].map(width => ({
        id: `UI-006-${width}`, title: `No horizontal scrolling at ${width}px; title wraps between words; controls on screen`, tags: ['ui', 'mobile', 'stage4'],
        viewport: { width, height: 800 },
        steps: [{ run: async () => {
            const { assert } = __t;
            document.getElementById('vTitle').value = 'A finding with a fairly long title to check wrapping';
            document.getElementById('vAssets').value = 'web01, 10.0.0.5'; await addFinding();
            findings[0].impact = 4; findings[0].exploit = 4; renderAll();
            const vw = document.documentElement.clientWidth;
            assert(document.documentElement.scrollWidth <= vw, `page scrolls sideways: ${document.documentElement.scrollWidth}px wide at ${vw}px`);
            // the report title must wrap only between words
            const h1 = document.querySelector('#printableReport h1');
            const range = document.createRange(); const text = h1.firstChild; let pos = 0;
            for (const word of h1.textContent.split(' ')) {
                range.setStart(text, pos); range.setEnd(text, pos + word.length); pos += word.length + 1;
                assert(range.getClientRects().length === 1, `title word "${word}" is split across lines`);
            }
            // every section's controls are inside the viewport
            const off = [...document.querySelectorAll('#reportBlocksContainer > .report-block .block-controls')].filter(c => { const r = c.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > vw); });
            assert(off.length === 0, `${off.length} section control rails are off-screen`);
            // with the sidebar open, still no sideways scrolling
            toggleSidebar();
            assert(document.documentElement.scrollWidth <= vw, 'opening the sidebar made the page scroll sideways');
        } }],
    })),

    {
        id: 'PERF-008-offline', title: 'Works with the CDN unreachable: styles and icons come from vendor/', tags: ['offline', 'stage4'],
        blockUrls: ['*cdn.jsdelivr.net*'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const probe = document.createElement('div'); probe.className = 'd-flex'; document.body.appendChild(probe);
            assert(getComputedStyle(probe).display === 'flex', 'Bootstrap CSS missing when the CDN is unreachable');
            probe.remove();
            await document.fonts.ready;
            assert([...document.fonts].some(f => /bootstrap-icons/i.test(f.family) && f.status === 'loaded'), 'icon font missing when the CDN is unreachable');
            const remote = performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith(location.origin));
            assert(remote.length === 0, 'loaded from another origin: ' + remote.join(', '));
            const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
            assert(links.length >= 2 && links.every(l => l.integrity.startsWith('sha384-')), 'stylesheets lack integrity hashes');
        } }],
    },
    {
        id: 'PERF-008-fallback', title: 'Without the vendor/ folder the CDN copy is used (needs internet)', tags: ['offline', 'network', 'stage4'],
        blockUrls: ['*/vendor/*'],
        steps: [{ run: async () => {
            const { assert, waitFor } = __t;
            await waitFor(() => { const p = document.createElement('div'); p.className = 'd-flex'; document.body.appendChild(p); const ok = getComputedStyle(p).display === 'flex'; p.remove(); return ok; }, 8000, 'Bootstrap CSS from the CDN fallback');
            assert([...document.querySelectorAll('link[rel="stylesheet"]')].every(l => l.href.startsWith('https://cdn.jsdelivr.net/')), 'stylesheets did not switch to the CDN');
        } }],
    },

    // ---------------------------------------------------------------- step 5: undo
    {
        id: 'UI-005-finding', title: 'Deleting a finding can be undone from the notice', tags: ['undo', 'stage5'],
        steps: [{ run: async () => {
            const { assert, answerModal, cards } = __t;
            for (const t of ['First', 'Second', 'Third']) { document.getElementById('vTitle').value = t; await addFinding(); }
            assert(document.getElementById('undoBtn').disabled, 'undo available before anything was done');
            cards()[1].querySelector('.control-danger').click();
            await answerModal(true);
            assert(findings.map(f => f.title).join() === 'First,Third', 'finding not deleted');
            const toast = document.getElementById('appToast');
            assert(toast.classList.contains('visible') && getComputedStyle(document.getElementById('appToastUndo')).display !== 'none', 'no notice with an Undo button');
            assert(!document.getElementById('undoBtn').disabled, 'sidebar undo button not enabled');
            document.getElementById('appToastUndo').click();
            assert(findings.map(f => f.title).join() === 'First,Second,Third', `undo gave ${findings.map(f => f.title).join()}`);
            assert(cards().length === 3, 'cards not re-rendered after undo');
            assert(document.getElementById('undoBtn').disabled, 'undo still available with nothing left to undo');
            assert(hasUnsavedChanges, 'undo did not mark the report as unsaved');
        } }],
    },
    {
        id: 'UI-005-keyboard', title: 'Ctrl/Cmd+Z undoes a section delete; inside text it stays the browser\'s text undo', tags: ['undo', 'stage5'],
        steps: [{ run: async () => {
            const { assert, answerModal } = __t;
            const ctrlZ = (target) => { const ev = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(ev); return ev; };
            const conclusionText = document.getElementById('section-conclusion').innerText;
            document.querySelector('#block-conclusion .control-danger').click();
            await answerModal(true);
            assert(!document.getElementById('block-conclusion'), 'section not deleted');
            // inside an editable field the app must not intercept Ctrl+Z
            const ev = ctrlZ(document.getElementById('section-exec'));
            assert(!ev.defaultPrevented && !document.getElementById('block-conclusion'), 'Ctrl+Z inside text was taken over by the app');
            ctrlZ(document.body);
            assert(document.getElementById('block-conclusion'), 'Ctrl+Z did not restore the section');
            assert(document.getElementById('section-conclusion').innerText === conclusionText, 'restored section text differs');
        } }],
    },
    {
        id: 'UI-005-replace', title: 'Find & Replace previews the count, highlights matches, and can be undone', tags: ['undo', 'find-replace', 'stage5'],
        steps: [{ run: async () => {
            const { assert } = __t;
            findings.push(__t.finding({ title: 'Alpha one', description: 'about alpha' })); renderAll();
            document.getElementById('section-conclusion').insertAdjacentText('beforeend', ' Alpha.');
            const execBefore = document.getElementById('section-conclusion').innerText;
            openFindReplace();
            const find = document.getElementById('frFindInput');
            assert(document.getElementById('frReplaceBtn').disabled, 'Replace enabled with an empty search');
            find.value = 'alpha'; find.dispatchEvent(new Event('input', { bubbles: true }));
            const preview = document.getElementById('frPreview').textContent;
            assert(preview === '3 matches: 2 in findings, 1 in sections', `preview: "${preview}"`);
            assert(document.getElementById('frReplaceBtn').textContent === 'Replace 3', 'button does not show the count');
            assert(findings[0].title === 'Alpha one', 'the preview changed the report');
            if (window.CSS && CSS.highlights) assert(CSS.highlights.get('find-match') && CSS.highlights.get('find-match').size === 3, 'matches not highlighted');
            find.value = 'zzz-nothing'; find.dispatchEvent(new Event('input', { bubbles: true }));
            assert(document.getElementById('frReplaceBtn').disabled && document.getElementById('frPreview').textContent === 'No matches.', 'no-match state wrong');
            find.value = 'alpha'; find.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('frReplaceInput').value = 'Beta';
            await runFindReplace();
            assert(findings[0].title === 'Beta one' && findings[0].description.includes('Beta'), 'replacement not applied');
            assert(!(window.CSS && CSS.highlights && CSS.highlights.has('find-match')), 'highlights left behind after closing');
            undoLastChange();
            assert(findings[0].title === 'Alpha one' && findings[0].description === 'about alpha', 'undo did not restore the findings');
            assert(document.getElementById('section-conclusion').innerText === execBefore, 'undo did not restore the section text');
        } }],
    },
    {
        id: 'UI-005-type-import', title: 'Assessment-type switch and import can be undone', tags: ['undo', 'stage5'],
        steps: [{ run: async () => {
            const { assert, answerModal, pickFile } = __t;
            const execBefore = document.getElementById('section-exec').innerText;
            const select = document.getElementById('input-assessment-type');
            const original = select.value;
            select.value = [...select.options].find(o => o.value !== original).value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await answerModal(true);
            assert(document.getElementById('section-exec').innerText !== execBefore, 'type switch changed nothing');
            undoLastChange();
            assert(document.getElementById('section-exec').innerText === execBefore, 'type switch: section text not restored');
            assert(select.value === original, `type switch: dropdown shows ${select.value}, expected ${original}`);
            // import over a report with a finding, then undo the import
            document.getElementById('vTitle').value = 'Mine'; await addFinding();
            const other = { ...buildReportPayload(), findings: [__t.finding({ title: 'Theirs' })], clientName: 'Other Client' };
            await pickFile('importReportFile', JSON.stringify(other));
            assert(findings[0].title === 'Theirs', 'import did not apply');
            undoLastChange();
            assert(findings.length === 1 && findings[0].title === 'Mine', 'import not undone');
            assert(document.getElementById('input-client-name').value !== 'Other Client', 'client name not restored');
        } }],
    },
    {
        id: 'UI-005-redact-limit', title: 'Redaction can be undone; history is capped at 20 steps', tags: ['undo', 'stage5'],
        steps: [{ run: async () => {
            const { assert, caretAtEnd } = __t;
            const s = document.getElementById('section-conclusion');
            await insertEvidenceImages([await __t.makeImageFile('screenshot', 300, 150)], caretAtEnd(s));
            const img = s.querySelector('figure img'); const srcBefore = img.src;
            img.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            await openRedactModal();
            redactState.boxes.push({ x: 0, y: 0, w: 100, h: 100 });
            applyRedaction();
            assert(s.querySelector('figure img').src !== srcBefore, 'redaction did not change the image');
            undoLastChange();
            assert(document.getElementById('section-conclusion').querySelector('figure img').src === srcBefore, 'redaction not undone');
            for (let i = 0; i < 25; i++) recordUndoPoint('step ' + i);
            assert(undoStack.length === 20, `history holds ${undoStack.length} steps`);
            assert(undoStack[0].label === 'step 5', 'oldest steps were not the ones dropped');
        } }],
    },

    // ---------------------------------------------------------------- step 6: ids, retest, sort
    {
        id: 'ARCH-003', title: 'Findings get stable unique ids that survive reorder, export/import and undo', tags: ['ids', 'stage6'],
        steps: [
            { run: async () => {
                const { assert, captureDownload } = __t;
                for (const t of ['A', 'B', 'C']) { document.getElementById('vTitle').value = t; await addFinding(); }
                const ids = findings.map(f => f.id);
                assert(ids.every(id => typeof id === 'string' && id.length >= 8) && new Set(ids).size === 3, 'ids missing or not unique: ' + ids);
                moveFindingDown(0);
                assert(findings.map(f => f.title).join('') === 'BAC' && findings[1].id === ids[0], 'id did not travel with its finding on reorder');
                assert(document.querySelector(`.vuln-card[data-finding-id="${ids[0]}"]`).dataset.index === '1', 'card not tagged with its id');
                const { text } = await captureDownload(() => exportReportJson());
                const payload = JSON.parse(text);
                assert(payload.schemaVersion === 3 && payload.findings.every(f => f.id), 'export lacks ids or v3');
                // legacy file without ids, plus a duplicated id
                const legacy = { ...payload, schemaVersion: 2, findings: [__t.finding({ title: 'No id' }), { ...__t.finding({ title: 'Dup 1' }), id: 'same' }, { ...__t.finding({ title: 'Dup 2' }), id: 'same' }] };
                return { exported: text, ids, legacy: JSON.stringify(legacy) };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile } = __t;
                await pickFile('importReportFile', ctx.exported);
                assert(findings.map(f => f.id).join() === [ctx.ids[1], ctx.ids[0], ctx.ids[2]].join(), 'ids changed on import');
                await pickFile('importReportFile', ctx.legacy);
                const ids = findings.map(f => f.id);
                assert(ids.every(Boolean) && new Set(ids).size === 3, 'legacy ids not backfilled / duplicates not re-issued: ' + ids);
                assert(findings[1].id === 'same', 'the first of two duplicate ids should be kept');
            } },
        ],
    },
    {
        id: 'FEAT-004', title: 'Retest: original results recorded, live summary table, new/removed findings, ends with its section', tags: ['retest', 'stage6'],
        steps: [
            { run: async () => {
                const { assert, answerModal, captureDownload, cards } = __t;
                // nothing to retest yet → explanation, no section
                const p0 = startRetest(); assert((await answerModal(true)) !== null, 'no explanation without findings'); await p0;
                assert(!document.getElementById('block-retest'), 'retest started without findings');
                const add = async (title, impact, exploit, status) => { document.getElementById('vTitle').value = title; await addFinding(); const f = findings[findings.length - 1]; Object.assign(f, { impact, exploit, status }); renderAll(); };
                await add('SQLi', 5, 4, 'Open'); await add('XSS', 3, 4, 'Open'); await add('Banner', 1, 2, 'Open');
                const p = startRetest(); await answerModal(true); await p;
                const block = document.getElementById('block-retest');
                assert(block && block.querySelector('h2').innerText.trim() === 'Retest Summary', 'Retest Summary section not added');
                assert(document.getElementById('retestStartBtn').innerText.includes('in progress'), 'sidebar does not show the retest in progress');
                const table = () => document.getElementById('retestSummaryTable');
                const rowFor = (title) => [...table().querySelectorAll('tbody tr')].find(tr => tr.children[1].innerText === title);
                const cell = (title, n) => rowFor(title).children[n].innerText.toLowerCase();   // badges are CSS-uppercased
                assert(cell('SQLi', 2).includes('critical') && cell('SQLi', 2).includes('open'), 'original result missing in table');
                assert(cards()[0].innerText.includes('Original result: Critical · Open'), 'card does not show the original result');
                // verify fixes: statuses and dates change, originals don't
                findings[0].status = 'Remediated'; findings[0].retestDate = '2026-11-20'; findings[0].impact = 1; findings[0].exploit = 1;
                findings[1].status = 'Partially Remediated';
                renderAll();
                assert(cell('SQLi', 2).includes('critical'), 'original severity changed when the finding was rescored');
                assert(cell('SQLi', 3).includes('remediated') && cell('SQLi', 4) === '2026-11-20', 'retest status/date not shown');
                const totals = table().querySelector('.retest-totals').innerText;
                assert(totals.includes('Of the 3 original findings') && totals.includes('1 remediated') && totals.includes('1 partially remediated') && totals.includes('1 still open'), `totals: ${totals}`);
                renderChecklist();
                assert(/Original findings without a retest date/.test(document.getElementById('checklistBody').innerText), 'checklist does not track missing retest dates');
                // a new finding and a removed one
                await add('New issue', 2, 2, 'Open');
                assert(cell('New issue', 2).includes('new in retest'), 'new finding not marked as new');
                const rp = removeFinding(2); await answerModal(true); await rp;
                const removed = [...table().querySelectorAll('tbody tr')].find(tr => tr.innerText.includes('Banner'));
                assert(removed && removed.innerText.toLowerCase().includes('removed from this report'), 'removed original finding not listed');
                const { text } = await captureDownload(() => exportReportJson());
                assert(JSON.parse(text).retest && Object.keys(JSON.parse(text).retest.baseline).length === 3, 'retest not exported');
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile, answerModal } = __t;
                await pickFile('importReportFile', ctx.exported);
                assert(document.getElementById('block-retest') && document.getElementById('retestSummaryTable').querySelectorAll('tbody tr').length === 4, 'retest not restored on import');
                // deleting the section ends the retest (asks first) — and can be undone
                document.querySelector('#block-retest .control-danger').click();
                const asked = await answerModal(true);
                assert(asked && asked.includes('End the retest'), 'deleting the section did not explain it ends the retest');
                assert(!document.getElementById('block-retest') && retestState === null, 'retest not ended');
                assert(!__t.cards()[0].innerText.includes('Original result'), 'cards still show original results');
                undoLastChange();
                assert(document.getElementById('block-retest') && retestState && __t.cards()[0].innerText.includes('Original result'), 'ending the retest was not undone');
            } },
        ],
    },
    {
        id: 'FEAT-008', title: 'Sort by severity orders one section Critical → Low, unscored then false positives last; undoable', tags: ['sort', 'stage6'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const mk = (title, impact, exploit, extra = {}) => __t.finding({ title, impact, exploit, ...extra });
            document.getElementById('newHeadline').value = 'Internal'; addNewDetailsSection();
            const second = document.querySelectorAll('.details-block')[1].id;
            findings = [
                mk('Low one', 1, 2), mk('FP crit', 5, 5, { status: 'False Positive' }), mk('Unscored', null, null),
                mk('High (cvss 7.5)', 3, 4, { cvssScore: '7.5' }), mk('Other section', 1, 1, { sectionId: second }),
                mk('Critical', 5, 4), mk('High (cvss 8.8)', 4, 3, { cvssScore: '8.8' }),
            ];
            renderAll();
            const btn = document.querySelector('#block-details [data-sort-section]');
            assert(btn, 'no sort button in a section with several findings');
            assert(!document.querySelector(`#${second} [data-sort-section]`), 'sort button shown in a section with one finding');
            btn.click();
            const order = findings.map(f => f.title).join(' | ');
            // the other section's finding keeps its slot (index 4); this section's findings are re-slotted around it
            assert(order === 'Critical | High (cvss 8.8) | High (cvss 7.5) | Low one | Other section | Unscored | FP crit', `order: ${order}`);
            assert(findings[4].title === 'Other section' && findings[4].sectionId === second, 'a finding from another section moved');
            undoLastChange();
            assert(findings.map(f => f.title)[0] === 'Low one', 'sorting not undone');
        } }],
    },

    // ---------------------------------------------------------------- report templates
    {
        id: 'TPL-001', title: 'Every report template builds its own sections, rating scale and labels', tags: ['templates'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const client = document.getElementById('input-client-name');
            client.value = 'Acme Corp'; client.dispatchEvent(new Event('input', { bubbles: true }));
            const keys = Object.keys(reportTemplates);
            assert(keys.length >= 11, `only ${keys.length} templates`);
            for (const want of ['code-review', 'general-security-review', 'vulnerability-assessment', 'phishing-social-engineering', 'configuration-review']) {
                assert(keys.includes(want), `template ${want} missing`);
            }
            const select = document.getElementById('input-assessment-type');
            assert(select.querySelectorAll('optgroup').length >= 2, 'templates are not grouped in the dropdown');
            const problems = [];
            for (const key of keys) {
                const tpl = reportTemplates[key];
                buildReportFromTemplate(key);
                const headings = [...document.querySelectorAll('#reportBlocksContainer > .report-block[data-template-section] h2')].map(h => h.innerText.trim());
                const expected = tpl.sections.map(s => s.title || (s.component === 'summary' ? 'Findings Summary' : 'Detailed Findings'));
                if (JSON.stringify(headings) !== JSON.stringify(expected)) problems.push(`${key}: headings ${headings.join(' > ')}`);
                if (document.querySelectorAll('#matrix td').length !== 25) problems.push(`${key}: no risk matrix`);
                if (!document.getElementById('block-details')) problems.push(`${key}: no findings section`);
                const model = scoringModels[tpl.scoring];
                if (!document.querySelector('.matrix-axis-x').innerText.startsWith(model.likelihoodLabel)) problems.push(`${key}: matrix axis not "${model.likelihoodLabel}"`);
                for (const s of tpl.sections.filter(s => s.key)) {
                    const el = document.getElementById('section-' + s.key);
                    if (!el || !el.innerText.trim()) problems.push(`${key}: section ${s.key} empty`);
                    if (s.scoringTable && !el.closest('.report-block').querySelector('table.table td[contenteditable]')) problems.push(`${key}: no scoring table`);
                }
                const text = document.getElementById('reportBlocksContainer').innerText;
                if (text.includes('">')) problems.push(`${key}: corrupted text`);
                if (/\[CLIENT NAME\]/.test(text)) problems.push(`${key}: client placeholder not converted to a token`);
                if (select.value !== key) problems.push(`${key}: dropdown not updated`);
            }
            assert(problems.length === 0, problems.slice(0, 6).join(' | '));
        } }],
    },
    {
        id: 'TPL-002', title: 'Switching template keeps findings, added sections and a retest; asks first; can be undone', tags: ['templates', 'undo'],
        steps: [
            { run: async () => {
                const { assert, sleep, modalOpen } = __t;
                // an untouched report switches without asking
                const select = document.getElementById('input-assessment-type');
                select.value = 'configuration-review'; select.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(300);
                assert(!modalOpen(), 'asked before switching an untouched report');
                assert(document.getElementById('section-compliance'), 'untouched report did not switch');
            } },
            { run: async () => {
                const { assert, answerModal, cards } = __t;
                for (const t of ['First', 'Second']) { document.getElementById('vTitle').value = t; await addFinding(); }
                const ids = findings.map(f => f.id);
                document.getElementById('newHeadline').value = 'Appendix A'; addNewSection();
                document.getElementById('newHeadline').value = 'Internal'; addNewDetailsSection();
                const internal = document.querySelectorAll('.details-block')[1];
                findings[1].sectionId = internal.id; renderAll();
                const p = startRetest(); await answerModal(true); await p;
                const select = document.getElementById('input-assessment-type');
                select.value = 'code-review'; select.dispatchEvent(new Event('change', { bubbles: true }));
                const asked = await answerModal(true);
                assert(asked && asked.includes('Code Review'), 'did not ask before replacing an edited report');
                const headings = [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText.trim());
                const count = (h) => headings.filter(x => x === h).length;
                assert(count('Scope: Repositories and Revision') === 1 && count('Engagement and Scope') === 0, 'sections not replaced: ' + headings.join(' > '));
                assert(count('Executive Summary') === 1 && count('Conclusion') === 1, 'template sections duplicated');
                assert(count('Appendix A') === 1, 'user-added section lost');
                assert(count('Internal') === 1 && findings[1].sectionId === internal.id && internal.querySelector('.vuln-card'), 'extra findings section or its finding lost');
                assert(JSON.stringify(findings.map(f => f.id)) === JSON.stringify(ids), 'findings changed');
                const order = [...document.querySelectorAll('#reportBlocksContainer > .report-block')].map(b => b.id);
                assert(order.indexOf('block-retest') === order.indexOf('block-summary') + 1, 'retest section not kept after the Findings Summary');
                assert(order.indexOf(internal.id) === order.indexOf('block-details') + 1, 'extra findings section not kept after the findings');
                assert(cards()[0].innerText.includes('Affected Files / Components'), 'template asset label not used');
                assert(document.querySelector('.matrix-axis-x').innerText.startsWith('Likelihood'), 'rating scale not switched');
                undoLastChange();
                const back = [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText.trim());
                assert(back.includes('Engagement and Scope') && !back.includes('Scope: Repositories and Revision'), 'switch not undone');
                assert(select.value === 'web-application-pentest' && cards()[0].innerText.includes('Affected Assets'), 'template not restored by undo');
            } },
        ],
    },
    {
        id: 'TPL-003', title: 'A report saved before templates had structure switches without duplicating sections', tags: ['templates', 'import'],
        steps: [{ run: async () => {
            const { assert, pickFile, answerModal } = __t;
            document.getElementById('vTitle').value = 'Old finding'; await addFinding();
            const payload = buildReportPayload();
            const tpl = document.createElement('template'); tpl.innerHTML = payload.blocksHtml;
            tpl.content.querySelectorAll('[data-template-section]').forEach(el => el.removeAttribute('data-template-section'));
            tpl.content.querySelectorAll('[id^="block-sec-"]').forEach(el => el.removeAttribute('id')); // as the old version saved them
            await pickFile('importReportFile', JSON.stringify({ ...payload, schemaVersion: 2, blocksHtml: tpl.innerHTML }));
            const select = document.getElementById('input-assessment-type');
            select.value = 'general-security-review'; select.dispatchEvent(new Event('change', { bubbles: true }));
            await answerModal(true);
            const headings = [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText.trim());
            for (const h of ['Executive Summary', 'Confidentiality Notice', 'Disclaimer', 'Conclusion']) {
                assert(headings.filter(x => x === h).length === 1, `"${h}" appears ${headings.filter(x => x === h).length} times: ${headings.join(' > ')}`);
            }
            assert(!headings.includes('Methodology') && headings.includes('Control Area Overview'), 'old sections not replaced');
            assert(findings[0].title === 'Old finding' && __t.cards().length === 1, 'finding lost');
        } }],
    },
    {
        id: 'TPL-004', title: 'Old-format report-defaults.json files still load in the classic layout', tags: ['templates'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const legacy = normaliseReportDefaults({ defaultTemplate: 'mine', templates: { mine: { label: 'Firm pentest', sections: { 'section-exec': 'Our exec text', 'section-method': 'Our method', 'section-matrix-legend': 'Our legend' } } } });
            reportTemplates.mine = legacy.mine;
            assert(buildReportFromTemplate('mine'), 'old-format template did not build');
            const headings = [...document.querySelectorAll('#reportBlocksContainer > .report-block[data-template-section] h2')].map(h => h.innerText.trim());
            assert(headings.join(' > ') === 'Executive Summary > Confidentiality Notice > Disclaimer > Purpose > Summary > Engagement and Scope > Methodology > Findings Summary > Detailed Findings > Conclusion', 'layout: ' + headings.join(' > '));
            assert(document.getElementById('section-exec').innerText === 'Our exec text', 'text not used');
            assert(document.getElementById('section-matrix-legend').innerText === 'Our legend', 'legend not used');
            assert(document.getElementById('section-method').closest('.report-block').querySelectorAll('tbody tr').length === 5, 'built-in rating table missing');
        } }],
    },
    {
        id: 'TPL-005', title: 'A non-pentest report round-trips through export/import with its template', tags: ['templates', 'persistence'],
        steps: [
            { run: async () => {
                buildReportFromTemplate('phishing-social-engineering');
                document.getElementById('section-results').insertAdjacentText('beforeend', ' MARKER-42');
                document.getElementById('vTitle').value = 'No report button'; await addFinding();
                const { text } = await __t.captureDownload(() => exportReportJson());
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile, cards } = __t;
                await pickFile('importReportFile', ctx.exported);
                assert(document.getElementById('input-assessment-type').value === 'phishing-social-engineering', 'template not restored');
                assert(document.getElementById('section-results').innerText.includes('MARKER-42'), 'section text lost');
                assert(document.getElementById('section-results').querySelector('table'), 'results table lost');
                assert(cards()[0].innerText.includes('Affected Groups / Systems'), 'template asset label not restored');
            } },
        ],
    },

    // ---------------------------------------------------------------- interface language (Swedish)
    {
        id: 'I18N-001', title: 'Swedish interface: every interface text is translated, the report text is not', tags: ['i18n'],
        steps: [
            // The report stays English here (a new report otherwise starts in the interface language),
            // so this checks that the interface language alone never changes report text.
            { run: async () => { localStorage.setItem('rapportgen:uiLanguage', 'sv'); localStorage.setItem('rapportgen:reportLanguage', 'en'); } },
            { run: async () => {
                const { assert, answerModal, sleep } = __t;
                assert(document.documentElement.lang === 'sv', 'html lang is ' + document.documentElement.lang);
                assert(document.getElementById('uiLanguageSelect').value === 'sv', 'language select does not show Svenska');
                assert(document.querySelector('.sidebar h4').innerText.includes('Rapportverktyg'), 'sidebar title not translated');
                const execBefore = document.getElementById('section-exec').innerHTML;

                // Bring up as much of the interface as possible: findings with planners, assets, page
                // breaks, extra sections, a retest, dialogs, the library, Find & Replace, redaction.
                openAddFindingModal();
                document.getElementById('librarySearch').value = 'sql'; filterLibrary();
                loadTemplate(0); document.getElementById('vAssets').value = 'web01, web02'; await addFinding();
                loadTemplate(5); await addFinding();
                document.getElementById('vTitle').value = 'Manual'; await addFinding();
                toggleAllActionPlanners();
                toggleFindingPageBreak(1);
                renderWithAssetEntry(findings[2]);
                document.getElementById('newHeadline').value = 'Bilaga'; addNewSection();
                document.getElementById('newHeadline').value = 'Interna fynd'; addNewDetailsSection();
                insertPageBreakAfter(document.querySelector('#block-scope .block-controls button'));
                const retest = startRetest(); await answerModal(true); await retest;
                updateFindingStatus(0, 'Remediated');
                openFindReplace(); document.getElementById('frFindInput').value = 'the'; updateFindReplacePreview();
                markUnsaved();
                await sleep(100);

                // Every text and attribute the interface shows must be Swedish (or the same in both languages).
                const same = v => Object.hasOwn(UI_SV, v) && UI_SV[v] === v;
                const ok = v => { const n = v.replace(/\s+/g, ' ').trim(); return !/[A-Za-z]/.test(n) || isSwedishText(n) || same(n); };
                const untranslated = new Set();
                document.querySelectorAll(I18N_ATTRIBUTES.map(a => `[${a}]`).join(',')).forEach(el => {
                    if (i18nExcluded(el)) return;
                    for (const a of I18N_ATTRIBUTES) { const v = el.getAttribute(a); if (v && !ok(v)) untranslated.add(`${a}="${v.slice(0, 90)}"`); }
                });
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    if (node.parentElement && textInUiScope(node.parentElement) && !ok(node.nodeValue)) untranslated.add(`text "${node.nodeValue.trim().slice(0, 90)}" in ${node.parentElement.id || node.parentElement.className || node.parentElement.tagName}`);
                }
                assert(untranslated.size === 0, `${untranslated.size} interface texts without Swedish: ` + [...untranslated].join(' | '));
                assert(i18nMisses.size === 0, 'missing translations: ' + [...i18nMisses].join(' | '));

                // Spot checks, and the report itself is untouched.
                assert(document.getElementById('checklistTotalBadge').innerText.endsWith('problem'), 'checklist badge: ' + document.getElementById('checklistTotalBadge').innerText);
                assert(document.getElementById('retestStartBtn').innerText.includes('Omtest pågår'), 'retest button not translated');
                assert(document.querySelector('#block-exec-summary h2').innerText === 'Executive Summary', 'a report heading was translated');
                assert(document.getElementById('section-exec').innerHTML === execBefore, 'report text changed');
                assert(document.querySelector('.vuln-card .crit-badge').innerText.length > 0, 'severity badge missing');
                assert(document.querySelector('#block-metadata .no-print span').textContent === 'Uppdragsuppgifter', 'metadata control label not translated');
            } },
        ],
    },
    {
        id: 'I18N-002', title: 'Translation table: every interface message has Swedish, with the same placeholders', tags: ['i18n'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const src = [...document.scripts].map(s => s.textContent).join('\n');
            const unquote = (q, body) => body.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));
            const STR = String.raw`(['"])((?:\\.|(?!\1).)*)\1`;
            const used = new Set();
            for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*` + STR, 'g'))) used.add(unquote(m[1], m[2]));
            for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*` + STR + String.raw`\s*,\s*(['"])((?:\\.|(?!\3).)*)\3`, 'g'))) { used.add(unquote(m[1], m[2])); used.add(unquote(m[3], m[4])); }
            for (const m of src.matchAll(new RegExp(String.raw`\bt\([^()'"]*\?\s*` + STR + String.raw`\s*:\s*(['"])((?:\\.|(?!\3).)*)\3\s*\)`, 'g'))) { used.add(unquote(m[1], m[2])); used.add(unquote(m[3], m[4])); }
            assert(used.size > 120, `only found ${used.size} t() texts; did the pattern break?`);
            const missing = [...used].filter(k => !Object.hasOwn(UI_SV, k));
            assert(missing.length === 0, `${missing.length} texts have no Swedish translation:\n  ` + missing.join('\n  '));

            const placeholders = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
            const mismatched = Object.entries(UI_SV).filter(([en, sv]) => placeholders(en) !== placeholders(sv) || !sv.trim());
            assert(mismatched.length === 0, 'placeholders differ or translation empty: ' + mismatched.map(([en]) => en).join(' | '));
            assert(UI_EN_BY_SV.size === Object.keys(UI_SV).length, 'two English texts share one Swedish translation (switching back to English would be ambiguous)');

            // The report templates' names and groups are interface text too.
            const missingTemplates = [...Object.values(reportTemplates).map(x => x.label), ...Object.values(templateGroups)].filter(k => !Object.hasOwn(UI_SV, k));
            assert(missingTemplates.length === 0, 'template names without Swedish: ' + missingTemplates.join(', '));
        } }],
    },
    {
        id: 'I18N-003', title: 'Interface language follows the browser, switches live and back, and is remembered', tags: ['i18n'],
        steps: [
            { run: async () => {
                const { assert } = __t;
                assert(detectUiLanguage(['sv-SE', 'en']) === 'sv' && detectUiLanguage(['sv-FI']) === 'sv', 'Swedish browser not detected');
                assert(detectUiLanguage(['de-DE', 'sv']) === 'sv', 'first supported language should win');
                assert(detectUiLanguage(['en-GB', 'sv']) === 'en' && detectUiLanguage(['fr']) === 'en' && detectUiLanguage([]) === 'en', 'English fallback');
                assert(uiLanguage === detectUiLanguage(navigator.languages), 'default does not follow the browser');

                const snap = () => ({
                    title: document.querySelector('.sidebar h4').innerText,
                    tooltip: document.querySelector('#block-scope .block-controls button').getAttribute('data-tooltip'),
                    aria: document.querySelector('#block-scope .block-controls button').getAttribute('aria-label'),
                    status: document.getElementById('saveStatus').innerText,
                    templates: document.getElementById('input-assessment-type').options[0].text,
                    exec: document.getElementById('section-exec').innerHTML,
                });
                setUiLanguage('en');
                const en = snap();
                setUiLanguage('sv');
                const sv = snap();
                for (const k of ['title', 'tooltip', 'aria', 'status', 'templates']) assert(sv[k] !== en[k], `${k} not translated: ${sv[k]}`);
                assert(sv.tooltip === 'Flytta avsnittet uppåt', 'tooltip: ' + sv.tooltip);
                assert(sv.exec === en.exec, 'switching the interface changed the report text');
                assert(document.documentElement.lang === 'sv', 'html lang not updated');
                setUiLanguage('en');
                const back = snap();
                for (const k of Object.keys(en)) assert(back[k] === en[k], `${k} not restored: "${back[k]}" vs "${en[k]}"`);
                setUiLanguage('sv');
            } },
            { run: async () => {
                const { assert, captureDownload } = __t;
                assert(uiLanguage === 'sv' && document.getElementById('uiLanguageSelect').value === 'sv', 'Swedish not remembered after reload');
                const { text } = await captureDownload(() => exportReportJson());
                setUiLanguage('auto');
                assert(localStorage.getItem('rapportgen:uiLanguage') === null, 'auto should clear the stored choice');
                assert(uiLanguage === detectUiLanguage(navigator.languages), 'auto does not follow the browser');
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                // A report saved with a Swedish interface keeps its section controls in the saved HTML;
                // opened with an English interface they must read English again.
                const { assert, pickFile } = __t;
                setUiLanguage('en');
                assert(ctx.exported.includes('Flytta avsnittet uppåt'), 'test setup: export did not contain Swedish controls');
                await pickFile('importReportFile', ctx.exported);
                const tips = [...document.querySelectorAll('#reportBlocksContainer .block-controls button')].map(b => b.getAttribute('data-tooltip'));
                assert(tips.length > 5 && tips.every(tip => !/[åäö]/i.test(tip)), 'Swedish tooltips left after import: ' + tips.filter(x => /[åäö]/i.test(x)).join(', '));
            } },
        ],
    },
    {
        id: 'UI-010', title: 'Print Watermark tooltip is complete (quotes no longer cut it off)', tags: ['i18n', 'ui'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const tip = [...document.querySelectorAll('.sidebar .info-tip')].find(el => (el.getAttribute('data-tooltip') || '').startsWith('Prints a large'));
            assert(tip, 'watermark tooltip not found');
            assert(tip.getAttribute('data-tooltip').includes('"More settings"'), 'tooltip cut off: ' + tip.getAttribute('data-tooltip'));
            setUiLanguage('sv');
            assert(tip.getAttribute('data-tooltip').includes('Fler inställningar'), 'Swedish tooltip: ' + tip.getAttribute('data-tooltip'));
            setUiLanguage('en');
        } }],
    },

    // ---------------------------------------------------------------- report language (Swedish reports)
    {
        id: 'RPT-001', title: 'Every template text has a Swedish translation with the same markup, tokens and placeholders', tags: ['report-language'],
        steps: [{ run: async () => {
            const { assert } = __t;
            const sv = templateTranslations.sv || {};
            const texts = new Set();
            const add = v => { if (typeof v === 'string' && v.trim()) texts.add(v); };
            for (const tpl of Object.values(reportTemplates)) {
                add(tpl.labels.assets); add(tpl.legend);
                tpl.sections.forEach(s => { add(s.title); add(s.html); add(s.info); });
            }
            for (const m of Object.values(scoringModels)) {
                if (m === scoringModels.builtin) continue;      // read from the built-in English skeleton
                add(m.impactLabel); add(m.likelihoodLabel); m.tableHeaders.forEach(add); m.rows.flat().forEach(add); add(m.legend);
            }
            const missing = [...texts].filter(x => !Object.hasOwn(sv, x));
            assert(missing.length === 0, `${missing.length} template texts lack Swedish: ` + missing.map(x => x.slice(0, 60)).join(' | '));
            const tags = s => (s.match(/<\/?[a-z0-9]+/gi) || []).join(',');
            const tokens = s => (s.match(/\[(?:CLIENT NAME|COMPANY NAME|CONTACT NAME|CONTACT EMAIL)\]/g) || []).sort().join(',');
            const problems = [];
            for (const en of texts) {
                const s = sv[en];
                if (tags(en) !== tags(s)) problems.push('markup: ' + en.slice(0, 50));
                if (tokens(en) !== tokens(s)) problems.push('tokens: ' + en.slice(0, 50));
                if ((en.match(/\[insert/gi) || []).length !== (s.match(/\[infoga/gi) || []).length || /\[insert/i.test(s)) problems.push('placeholders: ' + en.slice(0, 50));
            }
            assert(problems.length === 0, problems.join(' | '));
            // The app's own report labels: same {placeholders}, and unambiguous both ways.
            const ph = s => (s.match(/\{\w+\}/g) || []).sort().join(',');
            assert(Object.entries(REPORT_SV).every(([en, s]) => ph(en) === ph(s) && s.trim()), 'REPORT_SV placeholders differ');
            assert(REPORT_EN_BY_SV.size === Object.keys(REPORT_SV).length - 1, 'REPORT_SV: only "Not Set"/"Not set" may share a translation');
        } }],
    },
    {
        id: 'RPT-002', title: 'A report switched to Swedish prints only Swedish labels; findings and own sections kept; undo; export/import', tags: ['report-language'],
        steps: [
            { run: async () => { localStorage.setItem('rapportgen:uiLanguage', 'en'); localStorage.setItem('rapportgen:reportLanguage', 'en'); } },
            { run: async () => {
                const { assert, answerModal, cards, sleep, captureDownload } = __t;
                assert(reportLanguage === 'en' && document.getElementById('reportLanguageSelect').value === 'en', 'should start English');
                loadTemplate(0); document.getElementById('vAssets').value = 'web01'; await addFinding();
                loadTemplate(3); await addFinding();
                document.getElementById('vTitle').value = 'Unscored'; await addFinding();
                updateFindingScore(0, 'impact', 5); updateFindingScore(0, 'exploit', 5);
                updateFindingScore(1, 'impact', 2); updateFindingScore(1, 'exploit', 2);
                updateFindingStatus(0, 'Open'); updateFindingStatus(1, 'Remediated');
                findings[0].cvssVector = 'CVSS:3.1/AV:N'; findings[0].cvssScore = '9.8'; findings[0].retestDate = '2026-11-08';
                toggleAllActionPlanners();
                document.getElementById('toggleTOC').click();
                document.getElementById('newHeadline').value = 'Appendix X'; addNewSection();
                const retest = startRetest(); await answerModal(true); await retest;
                updateFindingStatus(0, 'Remediated');
                const ids = findings.map(f => f.id);

                const select = document.getElementById('reportLanguageSelect');
                select.value = 'sv';
                const switching = onReportLanguageChange(select);
                const question = await answerModal(true); await switching; await sleep(50);
                assert(question && question.includes('Swedish'), 'should ask first (interface is English): ' + question);
                assert(reportLanguage === 'sv' && document.getElementById('printableReport').getAttribute('lang') === 'sv', 'report language not applied');
                assert(document.querySelector('.sidebar h4').innerText.includes('Reporting Tools'), 'interface changed language too');
                assert(findings.map(f => f.id).join() === ids.join(), 'findings changed');
                assert([...document.querySelectorAll('#reportBlocksContainer h2')].some(h => h.innerText === 'Appendix X'), 'own section lost');
                const h2s = [...document.querySelectorAll('#reportBlocksContainer h2')].map(h => h.innerText);
                for (const h of ['Sammanfattning för ledningen', 'Sammanfattning av fynd', 'Detaljerade fynd', 'Slutsats', 'Innehåll', 'Sammanfattning av omtest']) assert(h2s.includes(h), `missing heading ${h}: ${h2s.join(', ')}`);
                assert(document.querySelector('header h1').innerText === 'RAPPORT FRÅN SÄKERHETSGRANSKNING', 'report title not translated');
                assert(cards()[0].querySelector('.crit-badge').textContent === 'Kritisk', 'severity badge');
                assert(cards()[1].querySelector('.status-badge').textContent === 'Åtgärdad', 'status badge');
                assert(cards()[2].querySelector('.crit-badge').textContent === 'Ej bedömd', 'unscored badge');
                assert(document.querySelector('.matrix-axis-y').innerText.startsWith('Konsekvens'), 'matrix axis');
                assert(document.getElementById('section-exec').innerText.includes('genomförde') || /[åäö]/.test(document.getElementById('section-exec').innerText), 'executive summary text not Swedish');

                // Figure captions are numbered "Figur n:" in a Swedish report.
                const exec = document.getElementById('section-exec');
                exec.insertAdjacentHTML('beforeend', evidenceFigureHtml('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
                const cap = exec.querySelector('figcaption');
                assert(getComputedStyle(cap, '::before').content.includes('Figur '), 'caption prefix: ' + getComputedStyle(cap, '::before').content);
                assert(cap.innerText === '[infoga bildtext]', 'caption placeholder: ' + cap.innerText);
                assert(document.getElementById('checklistBody').innerText.includes('Leftover boilerplate'), 'Swedish [infoga …] placeholders not flagged by the checklist');

                // Nothing the app prints (outside text the author writes) is left in English.
                const svText = new Set([...Object.values(REPORT_SV), ...Object.values(templateTranslations.sv)]);
                const patterns = Object.values(REPORT_SV).filter(v => /\{\w+\}/.test(v)).map(v => new RegExp('^' + v.split(/\{\w+\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'));
                const isSv = v => { const n = v.replace(/\s+/g, ' ').trim().replace(/ \(1-5\) →$/, '').replace(/:$/, ''); return !/[A-Za-z]/.test(n) || svText.has(n) || svText.has(n + ':') || patterns.some(re => re.test(n)); };
                const english = [];
                const walker = document.createTreeWalker(document.getElementById('printableReport'), NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    const el = node.parentElement;
                    if (!el || el.closest('.no-print, .page-break-block, [contenteditable="true"], [data-i18n-skip], [translate="no"], .retest-totals, script, style')) continue;
                    if (getComputedStyle(el).display === 'none' && !el.closest('.print-score-text')) continue;
                    for (const part of node.nodeValue.split(' · ')) if (!isSv(part)) english.push(`"${part.trim()}" in ${el.className || el.tagName}`);
                }
                assert(english.length === 0, 'English left in a Swedish report: ' + english.join(' | '));
                assert(/^Av de 3 ursprungliga fynden: .+\.$/.test(document.querySelector('.retest-totals').innerText), 'retest totals: ' + document.querySelector('.retest-totals').innerText);

                // Undo goes back to the English report.
                undoLastChange();
                assert(reportLanguage === 'en' && document.getElementById('reportLanguageSelect').value === 'en', 'undo did not restore the language');
                assert(document.querySelector('#block-exec-summary h2').innerText === 'Executive Summary', 'undo did not restore English headings');
                assert(cards()[0].querySelector('.crit-badge').textContent === 'Critical', 'undo: badge');
                assert(document.querySelector('#tocBlock h2').innerText === 'Table of Contents', 'undo: TOC title');

                select.value = 'sv';
                const again = onReportLanguageChange(select); await answerModal(true); await again;
                const { text } = await captureDownload(() => exportReportJson());
                assert(JSON.parse(text).reportLanguage === 'sv', 'reportLanguage not exported');
                return { exported: text };
            } },
            { fresh: true, run: async (ctx) => {
                const { assert, pickFile, cards } = __t;
                localStorage.setItem('rapportgen:uiLanguage', 'en');
                setReportLanguageSilently('en');
                await pickFile('importReportFile', ctx.exported);
                assert(reportLanguage === 'sv' && document.getElementById('reportLanguageSelect').value === 'sv', 'import did not restore Swedish');
                assert(document.querySelector('#block-exec-summary h2').innerText === 'Sammanfattning för ledningen', 'headings after import');
                assert(cards()[0].querySelector('.crit-badge').textContent === 'Kritisk', 'badge after import');
                assert(document.querySelector('#metaFieldsRow label').textContent === 'Kontaktperson', 'metadata label after import');
            } },
        ],
    },
    {
        id: 'RPT-003', title: 'Every template builds in Swedish: headings, rating scale, legend and labels', tags: ['report-language', 'templates'],
        steps: [{ run: async () => {
            const { assert } = __t;
            setReportLanguageSilently('sv');
            const sv = templateTranslations.sv;
            for (const [key, tpl] of Object.entries(reportTemplates)) {
                buildReportFromTemplate(key);
                const headings = [...document.querySelectorAll('#reportBlocksContainer [data-template-section] h2')].map(h => h.innerText);
                const expected = tpl.sections.map(s => s.title ? sv[s.title] : (s.component === 'summary' ? 'Sammanfattning av fynd' : 'Detaljerade fynd'));
                assert(headings.join('|') === expected.join('|'), `${key}: ${headings.join(', ')}`);
                const model = scoringModels[tpl.scoring];
                assert(document.querySelector('.matrix-axis-x').innerText.startsWith(sv[model.likelihoodLabel]), `${key}: axis ${document.querySelector('.matrix-axis-x').innerText}`);
                const th = [...document.querySelectorAll('#reportBlocksContainer .table-responsive thead th')].map(x => x.innerText.toLowerCase());
                if (tpl.sections.some(s => s.scoringTable)) assert(th.includes(sv[model.tableHeaders[0]].toLowerCase()), `${key}: scoring table headers ${th}`);
                assert(!/\[insert/i.test(document.getElementById('reportBlocksContainer').innerText), `${key}: English [insert …] placeholder left`);
                document.getElementById('vTitle').value = 'x'; await addFinding();
                assert(__t.cards()[0].innerText.includes(sv[tpl.labels.assets]) || !findings[0].assets.length, `${key}: asset label`);
                findings.length = 0; renderAll();
            }
        } }],
    },
    {
        id: 'RPT-004', title: 'A new report starts in the last report language, else the interface language; old files open as English', tags: ['report-language'],
        steps: [
            { run: async () => { localStorage.setItem('rapportgen:uiLanguage', 'sv'); } },
            { run: async () => {
                const { assert } = __t;
                assert(reportLanguage === 'sv', 'with no earlier report, a Swedish interface should start a Swedish report');
                assert(document.querySelector('#block-exec-summary h2').innerText === 'Sammanfattning för ledningen', 'startup report not built in Swedish');
                setReportLanguage('en');   // remembered for the next new report
            } },
            { run: async () => {
                const { assert, pickFile } = __t;
                assert(reportLanguage === 'en', 'the last report language should win over the interface language');
                setReportLanguage('sv');
                const old = JSON.parse(JSON.stringify(buildReportPayload()));
                delete old.reportLanguage;
                await pickFile('importReportFile', JSON.stringify(old));
                assert(reportLanguage === 'en', 'a file without reportLanguage should open as English');
                const bad = { ...buildReportPayload(), reportLanguage: 'xx' };
                const alertText = await pickFile('importReportFile', JSON.stringify(bad));
                assert(alertText && alertText.includes('språk'), 'unsupported language not rejected: ' + alertText);
            } },
        ],
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
                blocksHtml: base.blocksHtml.replace('id="section-exec">', `id="section-exec">${img}<a id="jslink" href="javascript:${js}">x</a><iframe srcdoc="<script>parent.${js}<\/script>"></iframe>`), // eslint-disable-line no-useless-escape -- keeps the string safe inside an HTML <script>
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
    {
        // SEC-DOM-2: finding cards are rebuilt with innerHTML on every renderAll(). Text committed from
        // an editable field (typed, pasted or dropped HTML, saved via this.innerHTML) never went
        // through the import sanitizer, so the renderer must not trust `findings` to be clean.
        id: 'SEC-DOM-2-render', title: 'Finding text is sanitized each time it is rendered, not only on import', tags: ['security'],
        steps: [{ run: async () => {
            const { assert, sleep } = __t;
            const js = 'window.__pwned=(window.__pwned||0)+1';
            findings.push(__t.finding({ description: 'x', remediation: 'y' }));
            renderAll();
            // What the cards' onblur / debounced commit hand over: the field's innerHTML.
            updateFindingData(0, 'description', `ok <img src=x onerror="${js}"> <a href="javascript:${js}">l</a>`);
            updateFindingData(0, 'remediation', `<svg><animate onbegin="${js}" attributeName="x" dur="1s"></animate></svg><details open ontoggle="${js}">d</details>`);
            window.__pwned = 0;
            renderAll();
            await sleep(600);
            assert(!window.__pwned, `script executed ${window.__pwned} time(s) when finding text was re-rendered`);
            const [, desc, rem] = __t.cardFields(0);
            for (const el of [desc, rem]) {
                assert(![...el.querySelectorAll('*')].some(n => [...n.attributes].some(a => /^on/i.test(a.name))), 'event handler rendered: ' + el.innerHTML);
                assert(!el.querySelector('a[href^="javascript:"], svg'), 'unsafe markup rendered: ' + el.innerHTML);
            }
            assert(desc.innerText.includes('ok'), 'harmless text was lost: ' + desc.innerHTML);
        } }],
    },
    {
        // Rollback of a failed import re-applies a snapshot of the live report: it goes through the
        // same sanitizer as import, autosave restore and undo. (Execution isn't counted here: taking
        // the snapshot clones the live DOM, which re-fires a handler that is already on the page.)
        id: 'SEC-DOM-2-rollback', title: 'A failed import rolls back through the sanitizer', tags: ['security'],
        steps: [{ run: async () => {
            const { assert } = __t;
            findings.push(__t.finding({ description: 'x' }));
            renderAll();
            // A section whose live DOM holds markup the import policy wouldn't keep.
            document.getElementById('section-exec').insertAdjacentHTML('beforeend', '<img src=x onerror="void 0"><b onclick="void 0">kept</b>');
            const good = buildReportPayload();
            const realRender = window.renderLogo;
            let calls = 0;
            // Make the first apply fail halfway (after the report container was replaced).
            window.renderLogo = () => { if (++calls === 1) throw new Error('boom'); return realRender(); };
            let threw = false;
            try { applyReportPayload({ ...good, findings: [] }); } catch { threw = true; }
            window.renderLogo = realRender;
            assert(threw, 'the forced failure did not happen');
            const exec = document.getElementById('section-exec');
            assert(findings.length === 1 && exec && exec.innerText.includes('kept'), 'rollback did not restore the report');
            assert(!document.querySelector('#reportBlocksContainer [onerror], #section-exec [onclick]'), 'rollback put back unsanitized markup: ' + exec.innerHTML);
        } }],
    },
    {
        // TEST-003 corpus against the sanitizer itself, in both policies: classic XSS and mXSS
        // (namespace confusion, noscript/raw-text re-parsing). The output is put into the live page.
        id: 'SEC-DOM-2-corpus', title: 'sanitizeHtml neutralises an XSS/mXSS corpus in both policies, and is stable', tags: ['security'],
        steps: [{ run: async () => {
            const { assert, sleep } = __t;
            const js = 'window.__pwned=(window.__pwned||0)+1';
            const corpus = [
                `<img src=x onerror="${js}">`, `<IMG SRC=x ONERROR="${js}">`, `<image src=x onerror="${js}">`,
                `<svg onload="${js}"></svg>`, `<svg><script>${js}</script></svg>`, `<svg><foreignObject><img src=x onerror="${js}"></foreignObject></svg>`,
                `<math><mtext><table><mglyph><style><img src=x onerror="${js}"></style></mglyph></table></mtext></math>`,
                `<math><annotation-xml encoding="text/html"><img src=x onerror="${js}"></annotation-xml></math>`,
                `<noscript><p title="</noscript><img src=x onerror=&quot;${js}&quot;>"></p></noscript>`,
                `<xmp><img src=x onerror="${js}"></xmp>`, `<plaintext><img src=x onerror="${js}">`,
                `<noembed><img title="</noembed><img src=x onerror=&quot;${js}&quot;>"></noembed>`,
                `<template><img src=x onerror="${js}"></template>`, `<select><style></style><img src=x onerror="${js}"></select>`,
                `<form><math><mtext></form><form><mglyph><style></math><img src=x onerror="${js}">`,
                `<table><td><style><img src=x onerror="${js}"></style></td></table>`,
                `<iframe srcdoc="<script>parent.${js}<\/script>"></iframe>`, // eslint-disable-line no-useless-escape -- keeps the string safe inside an HTML <script>
                `<object data="data:text/html,<script>parent.${js}<\/script>"></object>`, // eslint-disable-line no-useless-escape -- as above
                `<embed src="data:text/html,x">`, `<base href="https://evil.example/">`, `<meta http-equiv="refresh" content="0;url=javascript:${js}">`,
                `<a href="javascript:${js}">a</a>`, `<a href=" javascript:${js}">a</a>`, `<a href="jav&#x09;ascript:${js}">a</a>`,
                `<a href="data:text/html,x">a</a>`, `<img src="data:text/html,x">`, `<details open ontoggle="${js}">d</details>`,
                `<input autofocus onfocus="${js}">`, `<button formaction="javascript:${js}">b</button>`, `<div style="background:url(javascript:${js})">s</div>`,
                `<style>@import 'x';</style>`, `<div onclick="moveSectionUp(this);${js}">c</div>`, `<span class="token-client" onmouseover="${js}"><b>t</b></span>`,
                `<!--<img src=x onerror="${js}">-->`, `<a id="x"><img name="getElementById"></a>`,
            ];
            const unsafe = el => [...el.querySelectorAll('*')].find(n =>
                /^(script|style|iframe|object|embed|base|meta|template|noscript|svg|math|form|textarea|xmp|plaintext|noembed)$/i.test(n.localName)
                || n.namespaceURI !== 'http://www.w3.org/1999/xhtml'
                || [...n.attributes].some(a => (/^on/i.test(a.name) && !/^(moveSectionUp|moveSectionDown|insertPageBreakAfter|removeSection)\(this\)$/.test(a.value))
                    || (/^(href|src|action|formaction|data)$/i.test(a.name) && !/^(https?:|mailto:|#|data:image\/)/i.test(a.value.trim()))));
            window.__pwned = 0;
            const failures = [];
            const live = document.createElement('div');
            document.body.appendChild(live);
            for (const structure of [false, true]) {
                for (const p of corpus) {
                    const once = sanitizeHtml(p, { structure });
                    const twice = sanitizeHtml(once, { structure });
                    if (once !== twice) failures.push(`${structure ? 'structure' : 'rich'}: not stable: ${p} → ${once} → ${twice}`);
                    live.innerHTML = once;
                    const bad = unsafe(live);
                    if (bad) failures.push(`${structure ? 'structure' : 'rich'}: ${p} → ${bad.outerHTML}`);
                }
            }
            await sleep(600);
            live.remove();
            assert(!window.__pwned, `script executed ${window.__pwned} time(s) from sanitized output`);
            assert(failures.length === 0, failures.join('\n'));
        } }],
    },
];

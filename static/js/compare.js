// «Lagrede skoler» (Figma 5 · PROTOTYPE, R6): share the list and compare the schools in a table, row by row, with
// every cell saying its status in words. The schools come from a shared link (?s=key&s=key – the schools' public keys,
// never anything about the visitor) or else from the saved schools in this browser. The priorities come from the
// link (?prio=) or else from this tab. The notes the family writes go with the link (?n=, in the order of ?s=) so the one who gets it sees them.
(function () {
    const el = id => document.getElementById(id);
    const MAX = 4;
    const NOTES_KEY = 'skolekartet.notater';
    const KRETS_LOOKUP = 'https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/';

    const query = new URLSearchParams(location.search);
    const fromLink = query.getAll('s');
    const linkNotes = query.getAll('n');   // the sender's notes, in the order of the schools
    const keys = (fromLink.length ? fromLink : [...savedSchools()]).slice(0, MAX);
    const prioIds = query.has('prio')
        ? query.get('prio').split(',').filter(id => PRIORITIES.some(p => p.id === id))
        : rememberedPriorities();
    const selected = PRIORITIES.filter(p => prioIds.includes(p.id));
    // What the table always shows when it has the numbers, also without a priority
    const extras = PRIORITIES.filter(p => ['mobbing', 'resultater'].includes(p.id) && !prioIds.includes(p.id));

    const ICON = {
        share: '<path d="M8.5 11l7-4M8.5 13l7 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="6" cy="12" r="2.4" stroke="currentColor" stroke-width="1.6"/><circle cx="17.5" cy="6" r="2.4" stroke="currentColor" stroke-width="1.6"/><circle cx="17.5" cy="18" r="2.4" stroke="currentColor" stroke-width="1.6"/>',
        print: '<path d="M8 8V4.5h8V8M8 16H5.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 13h8v6.5H8V13Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
        copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 8.5V5.6a1.1 1.1 0 0 0-1.1-1.1H5.6a1.1 1.1 0 0 0-1.1 1.1v8.8a1.1 1.1 0 0 0 1.1 1.1h2.9" stroke="currentColor" stroke-width="1.6"/>',
        sms: '<path d="M5 5.5h14a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.5 10h7M8.5 13h4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
        mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.6" stroke="currentColor" stroke-width="1.6"/><path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
        close: '<path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
        warn: FLOW_ICON.warn, info: FLOW_ICON.info
    };
    const svg = name => ICON[name].startsWith('<svg') ? ICON[name] : `<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">${ICON[name]}</svg>`;

    // ── notes: only in this browser ──
    function readNotes() {
        try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch (error) { return {}; }
    }
    function writeNote(key, text) {
        try {
            const notes = readNotes();
            if (text.trim()) notes[key] = text; else delete notes[key];
            localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
        } catch (error) {
            // Storage blocked: the note then lasts until the page is closed
        }
    }

    // The notes as they are now (what is typed in the boxes); they go in the link next to the schools and priorities
    const notesNow = {};
    function shareUrl(list) {
        const params = new URLSearchParams();
        list.forEach(item => params.append('s', item.key));
        if (prioIds.length) params.set('prio', prioIds.join(','));
        if (list.some(item => (notesNow[item.key] || '').trim())) list.forEach(item => params.append('n', (notesNow[item.key] || '').trim()));
        if (I18N.translated) params.set('lang', I18N.lang);
        return new URL(`sammenlign?${params}`, location.href).href;
    }

    // One sentence per school, only from what the numbers say
    function reason(item, all) {
        const parts = [];
        const known = item.perPriority.filter(r => r.known);
        const met = known.filter(r => r.met);
        if (selected.length) {
            if (met.length) parts.push(t('Passer: {list}.', { list: met.map(r => t(r.pr.chip).toLowerCase()).join(', ') }));
            else if (!known.length) parts.push(t('Vi mangler opplysninger om det dere har valgt.'));
        }
        const withDistance = all.filter(i => i.meters !== null);
        if (withDistance.length > 1 && item.meters !== null) {
            const sorted = [...withDistance].sort((a, b) => a.meters - b.meters);
            if (sorted[0] === item) parts.push(t('Nærmest.'));
            else if (sorted[sorted.length - 1] === item) parts.push(t('Lengst skolevei.'));
        }
        if (item.perPriority.some(r => r.warn)) parts.push(t('Noe er verdt å sjekke – spør skolen.'));
        return parts.length ? parts.join(' ') : t('Du har lagret den.');
    }

    function render(schools, krets) {
        const fromShare = fromLink.length > 0;
        el('savedTitle').textContent = t('Lagrede skoler ({count})', { count: schools.length });
        el('compareBack').lastElementChild.textContent = t('Tilbake til skolene');
        if (schools.length < 2) {
            el('compare').innerHTML = `<div class="saved-note saved-note--info">${svg('info')}<div><strong>${t('Lagre minst to skoler i lista, så kan du sammenligne dem her.')}</strong>
                <p><a class="ds-link" href="${I18N.href('./')}">${t('Finn skoler')}</a></p></div></div>`;
            return;
        }
        const address = rememberedAddress();
        const items = schools.map(school => {
            const n = levelNumbers([school]);
            const eval1 = pr => evaluatePriorities([pr], school, n);
            const perPriority = selected.map(pr => {
                const r = eval1(pr);
                return { pr, facts: r.facts, known: r.known > 0, met: r.met > 0, warn: r.warnings > 0 };
            });
            const meters = address ? Math.round(airDistanceKm(address.lat, address.lng, school.lat, school.lng) * 1000) : null;
            return { school, key: schoolKey(school), n, perPriority, krets: kretsStatus(krets, school), extraRows: extras.map(pr => ({ pr, facts: eval1(pr).facts })), meters };
        });
        const cols = items.length;
        const unconfirmed = items.filter(item => item.krets !== true).length;
        const note = readNotes();
        items.forEach((item, i) => { notesNow[item.key] = fromShare && linkNotes[i] !== undefined ? linkNotes[i] : (note[item.key] || ''); });

        const row = (head, cells, extra = '') => `<tr${extra}><th scope="row">${head}</th>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
        // In the table the cell has no room for «– spør skolen»: «Ukjent:» already says it
        const ask = ` – ${t('spør skolen')}`;
        const facts = r => r.facts.map(f => priorityFactHtml({ ...f, text: f.text.endsWith(ask) ? f.text.slice(0, -ask.length) : f.text })).join('');
        const rows = [];
        rows.push(`<tr class="cmp-head"><td></td>${items.map(item => {
            const s = item.school;
            const meta = [t(SCHOOL_TYPE_LABEL[s.schoolType] || s.schoolType), item.meters !== null ? formatDistance(item.meters) : null].filter(Boolean).join(' · ');
            return `<th scope="col"><a class="cmp-name" href="${schoolUrl(s)}">${escapeHtml(s.name)}</a>
                <span class="cmp-meta">${meta}</span>
                ${fromShare ? '' : `<button type="button" class="cmp-remove" data-remove="${escapeHtml(item.key)}" aria-label="${escapeHtml(t('Fjern {school}', { school: s.name }))}">${svg('close')}<span>${t('Fjern')}</span></button>`}</th>`;
        }).join('')}</tr>`);
        if (selected.length) {
            rows.push(row(t('Derfor er den på listen'), items.map(item => escapeHtml(reason(item, items)))));
            rows.push(row(t('Passer prioriteringer'), items.map(item => {
                const known = item.perPriority.filter(r => r.known);
                const unknown = selected.length - known.length;
                const main = known.length ? t('{met} av {total}', { met: known.filter(r => r.met).length, total: known.length }) : t('Ukjent');
                return main + (unknown && known.length ? `<span class="cmp-small">${t('{unknown} av {total} prioriteringer er ukjente', { unknown, total: selected.length })}</span>` : '');
            })));
            selected.forEach((pr, i) => rows.push(row(t(pr.chip), items.map(item => facts(item.perPriority[i])))));
        }
        // Skolekrets from the open data of the kommuner that publish it (the same as on the map)
        rows.push(row(t('Skolekrets for adressen'), items.map(item => {
            if (item.krets === true) return `<span class="fact fact--ok">${FLOW_ICON.check}<span><strong>${t('Bekreftet')}:</strong> ${t('Skolekrets for adressen')}</span></span>`;
            if (item.krets === false) {
                const own = krets.hits.filter(k => k.level === item.school.schoolType).map(k => escapeHtml(k.school)).join(', ');
                return `<span class="fact fact--warn">${FLOW_ICON.warn}<span><strong>${t('Verdt å sjekke')}:</strong> ${t('Adressen hører til {school}', { school: own })}</span></span>`;
            }
            return `<span class="fact fact--unknown">${FLOW_ICON.question}<span><strong>${t('Ukjent')}:</strong> ${t('spør kommunen')}</span></span>`;
        })));
        extras.forEach((pr, i) => rows.push(row(t(pr.chip), items.map(item => facts(item.extraRows[i])))));
        if (address) rows.push(row(t('Skolevei'), items.map(item => `${t('Ca. {distance} (luftlinje)', { distance: formatDistance(item.meters) })}<br><span class="cmp-small">${t('Trapper og stigning vet vi ikke.')}</span>`)));
        rows.push(`<tr class="cmp-notes"><th scope="row">${t('Deres notater')}<span class="cmp-small">${t('Følger med når dere deler')}</span><span class="cmp-small">${t('Ikke skriv personopplysninger i notatene.')}</span></th>${items.map(item => `<td><label class="visually-hidden" for="note-${escapeHtml(item.key)}">${escapeHtml(t('Notat om {school}', { school: item.school.name }))}</label>
            <textarea class="cmp-note" id="note-${escapeHtml(item.key)}" data-note="${escapeHtml(item.key)}" rows="3">${escapeHtml(notesNow[item.key])}</textarea></td>`).join('')}</tr>`);

        el('compare').innerHTML = `
            <div class="saved-actions">
                <button type="button" class="hero-button hero-button--primary" id="shareToggle" aria-expanded="false" aria-controls="sharePanel">${svg('share')}<span>${t('Del listen')}</span></button>
                <button type="button" class="hero-button hero-button--secondary" id="comparePrint">${svg('print')}<span>${t('Skriv ut eller lagre som PDF')}</span></button>
            </div>
            <section class="share-panel" id="sharePanel" aria-labelledby="shareTitle" hidden>
                <h2 class="share-panel__title" id="shareTitle">${t('Del listen')}</h2>
                <div class="share-panel__row">
                    <label class="visually-hidden" for="shareLink">${t('Lenke til listen')}</label>
                    <input class="share-panel__link" id="shareLink" type="text" readonly value="${escapeHtml(shareUrl(items))}" />
                    <button type="button" class="hero-button hero-button--primary" id="copyLink">${svg('copy')}<span>${t('Kopier lenke')}</span></button>
                    <a class="hero-button hero-button--secondary" id="smsLink" href="#">${svg('sms')}<span>${t('Send på SMS')}</span></a>
                    <a class="hero-button hero-button--secondary" id="mailLink" href="#">${svg('mail')}<span>${t('Send på e-post')}</span></a>
                </div>
                <p class="share-panel__note">${t('Mottakeren ser den samme sammenligningen – med prioriteringene og notatene deres – på sin egen telefon eller PC, også med skjermleser og stor tekst.')}</p>
            </section>
            ${unconfirmed ? `<div class="saved-note saved-note--warn" role="note">${svg('warn')}<div>
                <strong>${t('Skolekretsen er ikke bekreftet for {count} av skolene', { count: unconfirmed })}</strong>
                <p>${t('Sjekk hos kommunen før dere bestemmer dere – særlig før dere kjøper eller leier bolig.')}</p>
                <p><a class="ds-link" href="${KRETS_LOOKUP}" target="_blank" rel="noopener">${t('Slå opp skolekrets hos Oslo kommune')} ↗</a></p></div></div>`
                : `<div class="saved-note saved-note--ok" role="note">${svg('info')}<div>
                <strong>${t('Skolekretsen er bekreftet for alle skolene')}</strong>
                <p>${t('Dette er en pilot på åpne data og kan avvike fra kommunens gjeldende grenser.')} ${t('Kilde:')} ${escapeHtml(krets.info.source)}</p></div></div>`}
            <h2 class="saved-page__h2">${t('Sammenligning')}</h2>
            <p class="saved-page__sub">${t('Tabellen leses rad for rad. Hver celle har status i ord, ikke bare farge.')}</p>
            <div class="cmp-wrap" tabindex="0" role="region" aria-label="${t('Sammenligning')}">
                <table class="cmp cmp--${cols}"><caption class="visually-hidden">${t('Sammenligning')}</caption><colgroup><col class="cmp__label">${items.map(() => '<col>').join('')}</colgroup><tbody>${rows.join('')}</tbody></table>
            </div>
            <div class="saved-note saved-note--info" role="note">${svg('info')}<div>
                <strong>${t('Neste steg')}</strong>
                <p>${t('Ring skolene med spørsmålene fra skolesidene. Kopier alle spørsmålene for de {count} skolene i én liste.', { count: items.length })}</p>
                <p class="saved-note__links"><button type="button" class="link-button" id="copyAll">${t('Kopier alle spørsmål')}</button>
                    <a class="ds-link" href="${I18N.href('barn-med-sarskilte-behov')}">${t('Barn med særskilte behov – slik søker du skoleplass')}</a></p></div></div>
            <p class="saved-page__source">${t('Små skoler kan svinge mye fra år til år. Forskjeller på 1–2 poeng er ofte tilfeldige.')}</p>`;

        const link = shareUrl(items);
        const subject = t('Skolene jeg har lagret på Skolekartet');
        el('smsLink').href = `sms:?&body=${encodeURIComponent(`${subject}: ${link}`)}`;
        el('mailLink').href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(link)}`;
        const toggleShare = () => {
            const open = el('sharePanel').hidden;
            el('sharePanel').hidden = !open;
            el('shareToggle').setAttribute('aria-expanded', String(open));
            if (open) el('shareLink').focus();
        };
        el('shareToggle').addEventListener('click', toggleShare);
        if (location.hash === '#del') toggleShare();
        el('shareLink').addEventListener('focus', () => el('shareLink').select());
        el('copyLink').addEventListener('click', async () => {
            UI.copyText(shareUrl(items), 'link');
        });
        el('comparePrint').addEventListener('click', () => window.print());
        el('copyAll').addEventListener('click', async () => {
            const text = items.map(item => `${item.school.name}\n${schoolQuestions(item.school, mobbingWord(item.n.mob, item.n.national)).map((q, i) => `${i + 1}. ${q}`).join('\n')}`).join('\n\n');
            UI.copyText(text, 'questions', items.reduce((sum, item) => sum + schoolQuestions(item.school, null).length, 0));
        });
        el('compare').querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
            toggleSaved(button.dataset.remove, false);
            location.reload();
        }));
        // The link follows the notes as they are typed
        const refreshLink = () => {
            const url = shareUrl(items);
            el('shareLink').value = url;
            el('smsLink').href = `sms:?&body=${encodeURIComponent(`${subject}: ${url}`)}`;
            el('mailLink').href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(url)}`;
        };
        el('compare').querySelectorAll('[data-note]').forEach(box => box.addEventListener('input', () => {
            notesNow[box.dataset.note] = box.value;
            if (!fromShare) writeNote(box.dataset.note, box.value);
            refreshLink();
        }));
    }

    fetch(I18N.url('static/js/school-data.json'), { cache: 'no-cache' })
        .then(response => response.json())
        .then(async data => {
            const byKey = new Map(data.schools.map(s => [schoolKey(s), s]));
            const address = rememberedAddress();
            const krets = address && !address.postnummer ? await lookupKrets(address) : null;
            render(keys.map(k => byKey.get(k)).filter(Boolean), krets);
        })
        .catch(() => { el('compare').innerHTML = `<p class="ds-paragraph">${t('Kunne ikke laste skolene')}</p>`; });
})();

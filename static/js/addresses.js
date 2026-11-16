// «Sammenlign adresser» (Figma 5 · PROTOTYPE, C2 and the dialog I21): up to three addresses side by side, judged by the
// same priorities as the list. The addresses stay in this tab (sessionStorage) and are never put in a link.
// Only what the open data says is shown; the skolekrets is not known and is said so.
(function () {
    const el = id => document.getElementById(id);
    const MAX = 3;
    const KEY = 'skolekartet-adresser';
    const KRETS_LOOKUP = 'https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/';

    function load() {
        try {
            const list = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (Array.isArray(list)) return list.filter(a => a && typeof a.lat === 'number' && typeof a.lng === 'number').slice(0, MAX);
        } catch (error) { /* no storage: the list lasts as long as this page */ }
        const first = rememberedAddress();
        return first && !first.postnummer ? [first] : [];
    }
    function save() {
        try { sessionStorage.setItem(KEY, JSON.stringify(addresses)); } catch (error) { /* see above */ }
    }
    let addresses = load();
    const query = new URLSearchParams(location.search);
    const prioIds = query.has('prio') ? query.get('prio').split(',').filter(id => PRIORITIES.some(p => p.id === id)) : rememberedPriorities();
    const selected = PRIORITIES.filter(p => prioIds.includes(p.id));
    let pool = [];

    // The schools around an address: public, within 3 km (wider where there are fewer than three)
    function around(address) {
        const withDistance = pool.map(s => ({ s, m: Math.round(airDistanceKm(address.lat, address.lng, s.lat, s.lng) * 1000) }));
        for (const km of [3, 10, 25]) {
            const list = withDistance.filter(x => x.m <= km * 1000);
            if (list.length >= 3 || km === 25) return list;
        }
    }

    function analyse(address) {
        const list = around(address).map(({ s, m }) => {
            const n = levelNumbers([s]);
            const ev = evaluatePriorities(selected, s, n);
            return { s, m, n, met: ev.met, known: ev.known };
        });
        const nearest = [...list].sort((a, b) => a.m - b.m)[0];
        const best = [...list].sort((a, b) => (selected.length ? b.met - a.met : 0) || a.m - b.m)[0];
        const all = selected.length ? list.filter(x => x.known > 0 && x.met === x.known) : [];
        return { best, nearest, all };
    }

    const row = (head, cells, extra = '') => `<tr><th scope="row">${head}</th>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    const dash = `<span aria-label="${escapeHtml(t('Ukjent'))}">–</span>`;

    async function render() {
        const root = el('addressCompare');
        const info = addresses.map(analyse);
        // The krets for each address from the open data of the kommuner that publish it (the map shows the same)
        const krets = await Promise.all(addresses.map(a => lookupKrets(a)));
        const cols = addresses.length + (addresses.length < MAX ? 1 : 0);
        const addCell = addresses.length < MAX ? `<button type="button" class="link-button" id="addAddress">+ ${t('Legg til adresse')}</button>` : '';
        const head = `<tr class="cmp-head"><td></td>${addresses.map((a, i) => `<th scope="col"><span class="cmp-name cmp-name--plain">${escapeHtml(a.label.split(',')[0])}</span>
                <span class="cmp-meta">${escapeHtml(a.kommune || '')}</span>
                <button type="button" class="cmp-remove" data-remove="${i}">${'<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'}<span>${t('Fjern')}</span></button></th>`).join('')}
            ${addCell ? `<th scope="col">${addCell}</th>` : ''}</tr>`;
        const pad = n => addresses.length < MAX ? `<td>${dash}</td>`.repeat(1) : '';
        const rows = [];
        const withAdd = cells => cells.map(c => `<td>${c}</td>`).join('') + pad();
        const tr = (head2, cells) => `<tr><th scope="row">${head2}</th>${withAdd(cells)}</tr>`;
        if (info.length) {
            rows.push(tr(t('Skole som passer best'), info.map(x => x.best ? `${escapeHtml(x.best.s.name)}<span class="cmp-small">${selected.length ? `${t('Passer {met} av {total}', { met: x.best.met, total: x.best.known || selected.length })} · ` : ''}${formatDistance(x.best.m)}</span>` : dash)));
            if (selected.length) rows.push(tr(`${t('Skoler som passer alle valg')}<span class="cmp-small">${t('Bare det vi har tall for')}</span>`, info.map(x => x.all.length ? (x.all.length === 1 ? t('1 skole') : t('{count} skoler', { count: x.all.length })) : dash)));
            rows.push(tr(t('Skolekrets'), info.map((x, i) => {
                const hits = krets[i] ? krets[i].hits : [];
                return hits.length
                    ? hits.map(k => `<span class="fact fact--ok">${FLOW_ICON.check}<span><strong>${t('Bekreftet')}:</strong> ${escapeHtml(k.school)}<span class="cmp-small">${t(k.level === 'barneskole' ? 'Barneskole' : 'Ungdomsskole')}</span></span></span>`).join('')
                    : `<span class="fact fact--unknown">${FLOW_ICON.question}<span><strong>${t('Ukjent')}:</strong> ${t('spør kommunen')}</span></span>`;
            })));
            rows.push(tr(t('Trivsel ved nærmeste skole'), info.map(x => {
                const triv = x.nearest && x.nearest.n.triv;
                if (triv === null || triv === undefined) return dash;
                const word = trivselWord(triv, x.nearest.n.trivNational);
                return `${formatDecimal(triv)} ${t('av 5')}${word ? ` – ${t(word[0]).toLowerCase()}` : ''}`;
            })));
            rows.push(tr(t('Skolevei'), info.map(x => x.nearest ? `${t('Ca. {distance} (luftlinje)', { distance: formatDistance(x.nearest.m) })}<span class="cmp-small">${escapeHtml(x.nearest.s.name)} · ${t('Trapper og stigning vet vi ikke.')}</span>` : dash)));
        }
        root.innerHTML = `
            <p class="saved-page__sub address-prio">${selected.length ? `<strong>${t('Prioritert:')}</strong> ${selected.map(p => t(p.chip)).join(' · ')}` : t('Ingen prioriteringer valgt – vi sammenligner det vi har tall for.')}</p>
            ${addresses.length
                ? `<div class="cmp-wrap" tabindex="0" role="region" aria-label="${t('Sammenlign adresser')}"><table class="cmp cmp--${cols}"><caption class="visually-hidden">${t('Sammenlign adresser')}</caption>
                    <colgroup><col class="cmp__label">${'<col>'.repeat(cols)}</colgroup><tbody>${head}${rows.join('')}</tbody></table></div>`
                : `<div class="saved-note saved-note--info">${FLOW_ICON.info}<div><strong>${t('Legg til minst to adresser for å sammenligne.')}</strong>
                    <p><button type="button" class="link-button" id="addAddress">+ ${t('Legg til adresse')}</button></p></div></div>`}
            ${krets.some(k => k) ? `<p class="saved-page__source">${t('Dette er en pilot på åpne data og kan avvike fra kommunens gjeldende grenser.')} ${t('Kilde:')} ${escapeHtml([...new Set(krets.filter(Boolean).map(k => k.info.source))].join('; '))}</p>` : ''}
            <div class="saved-note saved-note--warn" role="note">${FLOW_ICON.warn}<div>
                <strong>${t('Før dere kjøper bolig')}</strong>
                <p>${t('Skolekretsen avgjøres av kommunen. Slå den opp for hver adresse før dere byr.')}</p>
                <p><a class="ds-link" href="${KRETS_LOOKUP}" target="_blank" rel="noopener">${t('Slå opp skolekrets hos Oslo kommune')} ↗</a></p></div></div>`;
        const add = el('addAddress');
        if (add) add.addEventListener('click', openDialog);
        root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
            addresses.splice(Number(b.dataset.remove), 1);
            save();
            render();
        }));
    }

    // I21 «Legg til en adresse»
    function openDialog() {
        let chosen = null;
        let timer = null;
        const api = UI.dialog({
            title: t('Legg til en adresse'),
            closeButton: true,
            body: `<p>${t('Sammenlign skolene for opptil tre boliger.')}</p>
                <label class="visually-hidden" for="addrInput">${t('Adresse')}</label>
                <input class="share-panel__link addr-input" id="addrInput" type="search" autocomplete="off" />
                <ul class="addr-list" id="addrList" role="listbox"></ul>
                <p class="addr-error" id="addrError" role="alert" hidden>${t('Velg en adresse fra listen')}</p>`,
            actions: [{ label: t('Legg til adressen'), keepOpen: true, onClick: () => {
                if (!chosen) { el('addrError').hidden = false; return; }
                if (!addresses.some(a => a.label === chosen.label)) addresses.push({ label: chosen.label, lat: chosen.lat, lng: chosen.lng, kommune: chosen.kommune });
                save();
                api.close();
                render();
            } }]
        });
        const input = el('addrInput');
        input.focus();
        input.addEventListener('input', () => {
            chosen = null;
            el('addrError').hidden = true;
            clearTimeout(timer);
            const text = input.value.trim();
            if (text.length < 3) { el('addrList').innerHTML = ''; return; }
            timer = setTimeout(async () => {
                try {
                    const places = (await searchPlaces(text, { limit: 5 })).filter(p => !p.postnummer);
                    el('addrList').innerHTML = places.map((p, i) => `<li role="option" tabindex="0" data-i="${i}">${escapeHtml(p.label)}</li>`).join('');
                    el('addrList').querySelectorAll('li').forEach(li => {
                        const pick = () => {
                            chosen = places[Number(li.dataset.i)];
                            input.value = chosen.label;
                            el('addrList').innerHTML = '';
                        };
                        li.addEventListener('click', pick);
                        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
                    });
                } catch (error) {
                    el('addrList').innerHTML = `<li class="addr-list__none">${t('Kunne ikke søke nå – prøv igjen om litt.')}</li>`;
                }
            }, 250);
        });
    }

    fetch(I18N.url('static/js/school-data.json'), { cache: 'no-cache' })
        .then(r => r.json())
        .then(data => {
            pool = data.schools.filter(s => s.eierform !== 'privat' && s.lat && s.lng && ['barneskole', 'ungdomsskole'].includes(s.schoolType));
            render();
            if (location.hash === '#ny' && addresses.length < MAX) openDialog();
        })
        .catch(() => { el('addressCompare').innerHTML = `<p class="ds-paragraph">${t('Kunne ikke laste skolene')}</p>`; });
})();

// Finder: filters, address search and the school list next to the map.
// main.js creates the markers and calls Finder.init(map, markerCluster, entries).

const Finder = (() => {
    const PAGE_SIZE = 4;
    // The krets block names the level with its years (Figma 10.1)
    const LEVEL_LABEL = { barneskole: 'Barneskole (1.–7. trinn)', ungdomsskole: 'Ungdomsskole (8.–10. trinn)' };
    // Below this zoom (all of Norway or a large part of it) and without a search, the list is not shown
    const START_ZOOM = 9;
    const ALL_TYPES = ['barneskole', 'ungdomsskole'];
    const ALL_OWNERS = ['offentlig', 'privat'];
    const ALL_SCORES = ['very-low', 'low', 'high', 'very-high', 'none'];
    // Trivsel bands (scores have one decimal): under 3,8 · 3,8–3,9 · 4,0–4,1 · 4,2–4,3 · 4,4 and over
    const ALL_TRIVSEL = ['u38', '38', '40', '42', '44', 'none'];
    // Mobbing bands, share of pupils bullied: under 5 % · 5–9,9 % · 10–14,9 % · 15 % and over
    const ALL_MOBBING = ['u5', '5', '10', '15', 'none'];
    // Lærertetthet bands, pupils per teacher (GSI): under 14 · 14–15,9 · 16–17,9 · 18 and over
    const ALL_LAERER = ['u14', '14', '16', '18', 'none'];
    // Share of pupils with forsterket opplæring i norsk (GSI): under 5 % · 5–9,9 % · 10–19,9 % · 20 % and over
    const ALL_NORSK = ['u5', '5', '10', '20', 'none'];
    const PROFILE_LABEL = {
        montessori: 'Montessori',
        steiner: 'Steiner',
        kristen: 'Kristen',
        internasjonal: 'Internasjonal',
        toppidrett: 'Toppidrett',
        realfag: 'Realfag',
        annen: 'Andre privatskoler'
    };

    // "LocationPinFill" from Aksel icons by Nav (MIT licence)
    const PIN_ICON = "<svg viewBox=\"0 0 24 24\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M12.7572 21.2567C12.8684 21.1193 13.0282 20.9217 13.223 20.6811C13.6126 20.2 14.1419 19.5472 14.7008 18.8601C15.8231 17.4805 17.0518 15.9788 17.5174 15.4403C20.2796 12.2453 20.5383 7.57786 17.4804 4.51992C14.4538 1.49336 9.54679 1.49336 6.52022 4.51992C3.46229 7.57786 3.72097 12.2453 6.4832 15.4403C6.94883 15.9788 8.17749 17.4805 9.29978 18.8601C9.85869 19.5472 10.388 20.2 10.7776 20.6811C10.9724 20.9217 11.1323 21.1193 11.2434 21.2567L11.4162 21.4704L11.4168 21.4712C11.5592 21.6475 11.7737 21.75 12.0003 21.75C12.2269 21.75 12.4414 21.6475 12.5838 21.4712L12.7572 21.2567ZM12 6.25C9.92893 6.25 8.25 7.92893 8.25 10C8.25 12.0711 9.92893 13.75 12 13.75C14.0711 13.75 15.75 12.0711 15.75 10C15.75 7.92893 14.0711 6.25 12 6.25Z\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"currentColor\"/></svg>";

    // The filter groups are chosen in: an empty group lets all schools through, a group with values only
    // those. "Trinn" (types) is chosen with the chips under the search and is never empty.
    const state = {
        types: new Set(ALL_TYPES),
        owners: new Set(),
        scores: new Set(),
        kommune: '',
        profile: '',
        trivsels: new Set(),
        mobbings: new Set(),
        laerere: new Set(),
        norsk: new Set(),
        sort: 'distance',
        anlegg: new Set(), // «Anlegg ved skolen»: football, hall, pool (OpenStreetMap, anlegg-index.json)
        walk: 0,       // «Gangtid til skolen (anslag ut fra luftlinje)»: at most this many minutes from the address (0 = all)
        view: 'kart', // Kart (the list next to the map, the default) or Liste (the list with the side column)
        address: null, // { lat, lng, label, kommune }
        krets: null,   // pilot: { info, hits } when the address is in a kommune with open skolekrets data
        school: null,  // key of the school whose popup is open
        savedOnly: false,   // the list shows the saved schools ("Lagre til senere") instead of the map view
        step: 'start',      // start (A1, the address) → prio (A4, what matters) → results (A6)
        priorities: new Set(), // the ids in PRIORITIES; only in this browser and in links the family shares itself
        shown: PAGE_SIZE
    };

    let map, cluster, entries = [], filtered = [];
    let addressMarker = null;
    let keepList = false;   // true after a school was picked from the list, until the user moves the map
    let announceList = true;   // say the list's count once after the next render (see renderList)
    let listBounds = null;  // the map area the list was last built from
    let searchItems = [];   // what the search list shows: schools, kommuner, a postnummer and addresses
    let addressAbort = null;
    let addressTimer = null;
    let kretsLayer = null;
    let postalLayer = null; // the outline of a searched postnummer
    let facilities = {};    // orgnr -> [football 0/1, hall 0/1, metres to a pool], from static/js/anlegg-index.json
    let kretsEntries = new Set(); // the schools shown in "Skolekrets for adressen", left out of the list below it


    const el = id => document.getElementById(id);
    const numberFormat = new Intl.NumberFormat(I18N.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const countFormat = new Intl.NumberFormat(I18N.locale);


    const RADIUS_STEPS = [3, 10, 25, 60];   // km around the address: 3, and wider where there are fewer than five schools
    let radiusKm = RADIUS_STEPS[0];
    let fitCache = new Map();

    const selectedPriorities = () => PRIORITIES.filter(p => state.priorities.has(p.id));

    // How a school meets what the family chose (the rules are in priorities.js); cached per school
    function evaluate(entry) {
        if (fitCache.has(entry.key)) return fitCache.get(entry.key);
        const shown = levelsShown(entry);
        const result = evaluatePriorities(selectedPriorities(), entry.school, levelNumbers(shown.length ? shown : [entry.school]));
        fitCache.set(entry.key, result);
        return result;
    }

    // One page, three states: the browser's back button walks through them
    function showStep(step) {
        state.step = step;
        el('main').dataset.mode = step;
        updateMobileBar();
        el('startPage').hidden = step !== 'start';
        el('startNeeds').hidden = step !== 'start';
        el('prioPage').hidden = step !== 'prio';
        el('resultsBand').hidden = step !== 'results';
        document.querySelector('section.results').hidden = step !== 'results';
        if (step === 'prio') renderPrioPage();
        if (step === 'results') { renderBand(); map.invalidateSize(); if (postalLayer) map.fitBounds(postalLayer.getBounds(), { maxZoom: 15, padding: [16, 16] }); }
    }

    function setStep(step, { push = true, focus = true } = {}) {
        const from = state.step;
        showStep(step);
        if (push && from !== step) history.pushState({ ...(history.state || {}), step }, '', location.href);
        if (step === 'results') { state.shown = PAGE_SIZE; refreshList(); }
        window.scrollTo(0, 0);
        if (focus) {
            const target = { start: el('searchHint'), prio: el('prioTitle'), results: el('bandTitle') }[step];
            if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
        }
    }

    // The schools around the address and how far out we had to look
    function nearbyFor(address, pool) {
        const ref = L.latLng(address.lat, address.lng);
        let list = [];
        for (const km of RADIUS_STEPS) {
            list = pool.filter(e => ref.distanceTo([e.school.lat, e.school.lng]) <= km * 1000);
            if (list.length >= 5 || km === RADIUS_STEPS[RADIUS_STEPS.length - 1]) return { km, list };
        }
    }

    // ── A1: the start ──
    function showStartError(html) {
        const box = el('startError');
        box.innerHTML = html || '';
        box.hidden = !html;
    }

    // I19
    function helpPositionDialog() {
        UI.dialog({
            title: t('Slik tillater du posisjon'),
            closeButton: true,
            body: `<h3 class="ui-dialog__sub">${t('På PC (Chrome, Edge)')}</h3>
                <ul><li>${t('Klikk på hengelåsen til venstre for nettadressen')}</li><li>${t('Velg «Posisjon» → «Tillat»')}</li><li>${t('Last inn siden på nytt')}</li></ul>
                <h3 class="ui-dialog__sub">${t('På iPhone (Safari)')}</h3>
                <ul><li>${t('Innstillinger → Personvern → Stedstjenester → Safari → «Når appen er i bruk»')}</li></ul>`,
            actions: [
                { label: t('Prøv igjen'), onClick: () => locate() },
                { label: t('Skriv adressen i stedet'), variant: 'secondary', onClick: () => setTimeout(() => el('addressSearch').focus(), 0) }
            ]
        });
    }

    // A3: the position could not be used
    function positionError() {
        if (state.step !== 'start') setStep('start', { push: false, focus: false });
        showStartError(`<strong>${t('Vi fikk ikke bruke posisjonen din')}</strong>
            <p>${t('Nettleseren har blokkert posisjon. Skriv adressen i stedet, eller tillat posisjon i innstillingene og prøv igjen. Vi lagrer aldri posisjonen din.')}</p>
            <p class="start-error__links"><button type="button" class="link-button" data-act="help">${t('Slik tillater du posisjon')}</button>
            <button type="button" class="link-button" data-act="retry">${t('Prøv igjen')}</button></p>`);
    }

    // «Neste»: on to step 2, or G1 when nothing was found or nothing chosen from the list
    async function nextFromStart() {
        showStartError('');
        if (state.address) { setStep('prio'); return; }
        const query = el('addressSearch').value.trim();
        if (!query) {
            showStartError(`<strong>${t('Skriv en adresse først')}</strong><p>${t('Skriv adresse, kommune eller navnet på en skole.')}</p>`);
            el('addressSearch').focus();
            return;
        }
        let places = [];
        try { places = (await searchPlaces(query)).filter(p => !p.postnummer).slice(0, 2); } catch (_) { /* offline: the message below */ }
        const options = places.map((p, i) => `<button type="button" class="link-button" data-pick="${i}">${escapeHtml(p.label)}</button>`);
        // The address is there but not chosen from the list, or there is no such address (with the nearest names as «Mente du»)
        const typed = places.some(p => p.label.toLowerCase().startsWith(query.toLowerCase()));
        showStartError(`<strong>${typed ? t('Velg en adresse fra listen') : t('Vi fant ingen adresse som heter «{query}»', { query: escapeHtml(query) })}</strong>
            <p>${typed ? t('Skriv adressen og velg den fra forslagene.') : t('Sjekk stavemåten, eller prøv uten husnummer.')}</p>
            ${places.length ? `<p class="start-error__links"><span>${t('Mente du:')}</span> ${options.join(` <span>${t('eller')}</span> `)}</p>` : ''}`);
        el('startError').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
            selectAddress(places[Number(b.dataset.pick)]);
            showStartError('');
            setStep('prio');
        }));
    }

    function bindStart() {
        el('nextStep').addEventListener('click', nextFromStart);
        el('addressSearch').addEventListener('keydown', event => {
            if (event.key === 'Enter' && state.address && !document.querySelector('#addressResults [aria-selected="true"]')) { event.preventDefault(); nextFromStart(); }
        });
        el('showAllList').addEventListener('click', () => {
            showStartError('');
            clearAddress();
            state.kommune = '';
            map.setView([59.91, 10.75], 11, { animate: false });
            setStep('results');
        });
        el('startError').addEventListener('click', event => {
            const act = event.target.closest('[data-act]');
            if (!act) return;
            if (act.dataset.act === 'help') helpPositionDialog();
            if (act.dataset.act === 'retry') locate();
        });
        el('changeAddress').addEventListener('click', () => { setStep('start'); el('addressSearch').focus(); });
        el('changePriorities').addEventListener('click', () => setStep('prio'));
        window.addEventListener('popstate', event => {
            if (el('filterPanel').open || (event.state && event.state.filterPanel)) return;
            const step = (event.state && event.state.step) || 'start';
            if (step !== state.step) { showStep(step); if (step === 'results') refreshList(); window.scrollTo(0, 0); }
        });
    }

    // ── A4: what is important ──
    function renderPrioPage() {
        const near = state.address && !state.address.postnummer ? nearbyFor(state.address, entries).list.length : entries.length;
        const groups = [...new Set(PRIORITIES.map(p => p.group))];
        el('prioPage').innerHTML = `
            <div class="prio__inner">
                <button type="button" class="prio__back" id="prioBack">← ${t('Endre adresse')}</button>
                <div class="prio__head">
                    <p class="hero__step">${t('Steg 2 av 2')}</p>
                    <h1 class="prio__title" id="prioTitle">${t('Hva er viktig for dere?')}</h1>
                    <p class="prio__lead">${t('Velg det som gjelder. Vi sorterer skolene etter dette og viser tydelig hva vi vet – og ikke vet – om hver skole. Du kan endre valgene senere.')}</p>
                </div>
                ${state.address ? `<p class="prio__place">${FLOW_ICON.target}<strong>${t('Skoler nær {place}', { place: escapeHtml(state.address.label) })}</strong></p>` : ''}
                ${groups.map(g => `
                    <fieldset class="prio__group"><legend>${t(g)}</legend>
                        <div class="prio__options">${PRIORITIES.filter(p => p.group === g).map(p => `
                            <label class="prio-option"><input type="checkbox" value="${p.id}"${state.priorities.has(p.id) ? ' checked' : ''} />
                                <span class="prio-option__box" aria-hidden="true"></span>
                                <span class="prio-option__body"><span class="prio-option__title">${t(p.title)}</span><span class="prio-option__text">${t(p.text)}</span></span></label>`).join('')}
                        </div></fieldset>`).join('')}
                <div class="prio__bar">
                    <span class="prio__count" id="prioCount" aria-live="polite"></span>
                    <button type="button" class="link-button prio__skip" id="prioSkip">${t('Hopp over')}</button>
                    <button type="button" class="hero-button hero-button--primary" id="prioShow"></button>
                </div>
                <p class="prio__note">${FLOW_ICON.info}<span>${t('Vi lagrer ikke hva du velger om barnet. Valgene finnes bare i nettleseren din og i lenker du selv deler.')}</span></p>
            </div>`;
        const update = () => {
            const count = state.priorities.size;
            el('prioCount').textContent = count ? t('{count} valgt', { count }) : '';
            el('prioShow').innerHTML = `${t('Vis skoler')} (${near}) ${FLOW_ICON.chev}`;
        };
        update();
        el('prioPage').querySelectorAll('input[type=checkbox]').forEach(box => box.addEventListener('change', () => {
            if (box.checked) state.priorities.add(box.value); else state.priorities.delete(box.value);
            writeUrlState();   // in the address at once, so a language change or a reload keeps the choice
            fitCache = new Map();
            update();
        }));
        el('prioBack').addEventListener('click', () => { setStep('start'); el('addressSearch').focus(); });
        const toResults = () => {
            // Chosen priorities sort by fit; with none chosen the list is by distance
            state.sort = state.priorities.size ? 'fit' : (state.sort === 'fit' ? 'distance' : state.sort);
            writeUrlState();
            setStep('results');
        };
        el('prioShow').addEventListener('click', toResults);
        el('prioSkip').addEventListener('click', () => { state.priorities = new Set(); fitCache = new Map(); toResults(); });
    }

    // ── A6: the band over the results ──
    // Phones (Figma H1): «Liste | Kart» sits at the bottom of the band, over Sorter and Filter; wider screens keep it in the toolbar
    function placeViewSwitch() {
        const view = document.querySelector('.view-switch');
        if (!view) return;
        if (phoneLayout.matches) document.querySelector('#resultsBand > .site-container').appendChild(view);
        else el('resultsToolbar').appendChild(view);
    }

    // Phones: «3 lagret» and «Sammenlign» at the bottom of the screen while the results show
    function updateMobileBar() {
        const bar = el('savedBarMobile');
        const count = savedSchools().size;
        bar.hidden = !count || state.step !== 'results' || state.savedOnly;
        bar.innerHTML = `<strong>${t('{count} lagret', { count })}</strong>
            <a class="ds-button" data-variant="primary" href="${I18N.href('sammenlign')}"${count < 2 ? ' aria-disabled="true" tabindex="-1"' : ''}>${t('Sammenlign')}</a>`;
    }

    function renderBand() {
        // Phones show only the address with a pin (Figma H1), so «Skoler nær» is a span the narrow layout hides
        if (state.address && !state.savedOnly) {
            el('bandTitle').innerHTML = `<span class="band-pin" aria-hidden="true">${FLOW_ICON.target}</span><span class="band-prefix">${t('Skoler nær {place}', { place: '' }).trim()} </span>${escapeHtml(state.address.label)}`;
        } else {
            el('bandTitle').textContent = state.savedOnly ? t('Lagrede skoler')
                : state.kommune ? t('Skoler i {kommune} kommune', { kommune: state.kommune })
                : t('Alle skoler');
        }
        el('changeAddress').innerHTML = state.address ? `<span class="wide">${t('Endre adresse')}</span><span class="narrow">${t('Endre')}</span>` : t('Søk på adresse');
        el('addressRow').hidden = !state.address;
        const street = state.address ? state.address.label.split(',')[0] : '';
        el('addressChips').innerHTML = state.address ? `<li><span class="band-chip band-chip--on">${FLOW_ICON.target}${escapeHtml(street)}</span></li>` : '';
        const chosen = selectedPriorities();
        el('priorityRow').hidden = !state.address && !chosen.length;
        el('priorityChips').innerHTML = chosen.map((p, i) => `<li${i >= 2 ? ' class="band-chip-extra"' : ''}><button type="button" class="band-chip band-chip--prio" data-prio="${p.id}" aria-label="${escapeHtml(t('Fjern {label}', { label: t(p.chip) }))}">${t(p.chip)}<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></li>`).join('');
        el('changePriorities').lastChild.textContent = t(chosen.length ? 'Endre prioriteringer' : 'Velg prioriteringer');
        // Phones: the first two as chips, the rest behind «+ N prioriteringer til · Endre» (Figma H1)
        el('priMore').textContent = chosen.length > 2 ? t('+ {count} prioriteringer til · Endre', { count: chosen.length - 2 }) : t(chosen.length ? 'Endre prioriteringer' : 'Velg prioriteringer');
        el('priMore').onclick = () => el('changePriorities').click();
        el('priorityChips').querySelectorAll('[data-prio]').forEach(b => b.addEventListener('click', () => {
            state.priorities.delete(b.dataset.prio);
            fitCache = new Map();
            if (!state.priorities.size && state.sort === 'fit') state.sort = 'distance';
            writeUrlState();
            renderBand();
            state.shown = PAGE_SIZE;
            refreshList();
        }));
        const fit = document.querySelector('.sort-menu__item[data-sort="fit"]');
        if (fit) fit.hidden = !chosen.length;
    }


    function init(_map, _cluster, _entries) {
        map = _map;
        cluster = _cluster;
        entries = _entries;

        fillKommuneOptions();
        fillProfileOptions();
        const fromUrl = readUrlState();
        syncControls();
        addChipIcons();
        bindFilters();
        bindOwnSchoolActions();
        bindSaved();
        placeViewSwitch();
        phoneLayout.addEventListener('change', placeViewSwitch);
        bindAddressSearch();
        bindLocate();
        bindPhoneMap();
        bindView();
        bindStart();
        renderSide();
        document.querySelectorAll('[data-locate]').forEach(button => button.addEventListener('click', () => locate()));
        // The side column lists the saved schools, so it follows every «Lagre» on the page
        document.addEventListener('click', event => { if (event.target.closest('[data-save]')) setTimeout(renderSide, 0); });

        el('showMore').addEventListener('click', () => {
            state.shown += 10;
            refreshList();
        });

        // The list always shows the schools inside the visible part of the map, except right after
        // a school was picked from the list: then the list stays as it was until the user moves the map
        map.on('moveend', () => {
            if (keepList || state.savedOnly) return;
            state.shown = PAGE_SIZE;
            renderList();
        });
        // Leaflet cancels mousedown, so listen for pointer, wheel and keys on the map, and for its own dragstart
        // (not for clicks inside a popup, such as "Les mer om skolen")
        const releaseList = event => {
            if (!(event && event.target && event.target.closest && event.target.closest('.leaflet-popup'))) keepList = false;
        };
        map.on('dragstart', () => { keepList = false; });
        ['pointerdown', 'wheel', 'keydown'].forEach(type => map.getContainer().addEventListener(type, releaseList, { passive: true }));

        keyboardPopupFocus(map);
        // Keep the open school in the URL so a shared link opens the same school
        map.on('popupopen', event => {
            const marker = event.popup._source;
            if (marker && marker.schoolData) {
                state.school = schoolKey(marker.schoolData);
                writeUrlState();
            }
        });
        map.on('popupclose', event => {
            const marker = event.popup._source;
            if (marker && marker.schoolData && state.school === schoolKey(marker.schoolData)) {
                state.school = null;
                writeUrlState();
            }
        });

        // The page opens on step 1 (A1) unless the link or the way back already says there are results to show
        const savedViewEarly = returningView();
        const hasResultsState = Boolean(savedViewEarly) || state.savedOnly || Boolean(state.kommune) || Boolean(fromUrl.school)
            || state.priorities.size > 0 || filtersActive()
            || [...new URLSearchParams(location.search).keys()].some(key => !['lang', 'steg'].includes(key));
        showStep(hasResultsState ? 'results' : 'start');
        history.replaceState({ ...(history.state || {}), step: state.step }, '', location.href);

        applyFilters();
        fetch(I18N.url('static/js/anlegg-index.json'))
            .then(response => (response.ok ? response.json() : {}))
            .then(data => { facilities = data; if (state.anlegg.size) applyFilters(); })
            .catch(() => {});

        // Remember the whole view when leaving the page, so "Tilbake" on a school page returns to it
        window.addEventListener('pagehide', saveView);

        const sharedSchool = fromUrl.school && entryFor(fromUrl.school);
        const savedView = savedViewEarly;
        if (savedView) {
            restoreView(savedView);
        } else if (sharedSchool) {
            // A shared link: go straight to the school, without first animating to all of Norway
            if (!passes(sharedSchool)) resetFilters(true);
            openSchoolAt(sharedSchool);
        } else if (state.savedOnly) {
            setSavedOnly(true);
        } else if (state.kommune) {
            fitToFiltered();
        } else {
            // Start with mainland Norway in view (all schools would include Svalbard
            // and zoom out too far); the map column is narrower than the window.
            if (map.getSize().x) map.fitBounds([[57.9, 4.6], [71.2, 31.2]], { padding: [16, 16], animate: false });
            else map.setView([64.5, 12], 4, { animate: false });
        }
    }

    // ── The view when coming back from a school page ────────────────────
    // Filters, sort and the open school are in the URL; the address, the map position, how far the
    // list was opened and the scroll position are kept in this browser tab only (sessionStorage),
    // like the address for the walking time: never in a link.
    const VIEW_KEY = 'skolekartet.kart';
    const RETURN_KEY = 'skolekartet.tilbake';

    function saveView() {
        const center = map.getCenter();
        const view = {
            center: [center.lat, center.lng],
            zoom: map.getZoom(),
            shown: state.shown,
            // While a school picked from the list is shown, the list is still the one from before
            listBounds: keepList && listBounds ? [[listBounds.getSouth(), listBounds.getWest()], [listBounds.getNorth(), listBounds.getEast()]] : null,
            picked: keepList ? (document.querySelector('#schoolList .school-card[aria-current]') || {}).dataset?.key || null : null,
            sort: state.sort,
            school: state.school,
            // Which of the three screens was shown (start, «Hva er viktig», results): a language change keeps it
            step: state.step,
            address: state.address ? { label: state.address.label, lat: state.address.lat, lng: state.address.lng, kommune: state.address.kommune, postnummer: state.address.postnummer } : null,
            scrollY: window.scrollY
        };
        try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) { /* storage blocked */ }
    }

    // The saved view, when the visitor came back with "Tilbake" or the browser's back button
    function returningView() {
        try {
            const navigation = performance.getEntriesByType('navigation')[0];
            const back = sessionStorage.getItem(RETURN_KEY) || (navigation && navigation.type === 'back_forward');
            sessionStorage.removeItem(RETURN_KEY);
            const view = back && JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
            return view && Array.isArray(view.center) && typeof view.zoom === 'number' ? view : null;
        } catch (_) {
            return null;
        }
    }

    // The sort button shows the chosen order ("Sorter: Høyest snitt"), and the menu marks it
    function showSort(sort) {
        // A kommune without an address is sorted by name (there is nothing to be near)
        if (sort === 'distance' && state.kommune && !state.address) sort = 'name';
        document.querySelectorAll('.sort-menu__item').forEach(item => {
            if (item.dataset.sort === sort) {
                item.setAttribute('aria-current', 'true');
                el('sortLabel').textContent = t(item.dataset.label);
            } else {
                item.removeAttribute('aria-current');
            }
        });
    }

    function restoreView(view) {
        if (view.address && typeof view.address.lat === 'number') selectAddress(view.address);
        if (view.sort && view.sort !== state.sort) {
            state.sort = view.sort;
            showSort(view.sort);
            writeUrlState();
        }
        map.setView(view.center, view.zoom, { animate: false });
        state.shown = view.shown || PAGE_SIZE;
        if (view.listBounds) {
            renderList(L.latLngBounds(view.listBounds));
            keepList = true;
            const picked = [...el('schoolList').querySelectorAll('.school-card')].find(c => c.dataset.key === view.picked);
            if (picked) picked.setAttribute('aria-current', 'true');
        } else {
            renderList();
        }

        // The school that was open, without moving the map to fit its popup
        const entry = view.school && entryFor(view.school);
        if (entry) {
            const popup = entry.marker.getPopup();
            const autoPan = popup && popup.options.autoPan;
            if (map.hasLayer(entry.marker)) {
                if (popup) popup.options.autoPan = false;
                entry.marker.openPopup();
                if (popup) popup.options.autoPan = autoPan;
            } else {
                keepList = true;
                cluster.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
            }
        }
        // The screen that was shown, when it was not the results (a language change on step 1 or 2)
        if (['start', 'prio'].includes(view.step) && view.step !== state.step) {
            showStep(view.step);
            history.replaceState({ ...(history.state || {}), step: state.step }, '', location.href);
        }
        // The band over the results was drawn before the address came back: draw it again with the address
        else if (state.step === 'results') renderBand();
        // Again once the skolekrets cards (loaded after the address) are in place
        const scroll = () => window.scrollTo(0, view.scrollY || 0);
        requestAnimationFrame(scroll);
        setTimeout(scroll, 800);
    }

    // ── URL state: filters, sort, search mode and open school ───────────
    // Only values that differ from the default are written, so a plain visit has a clean URL.
    // The searched address is deliberately NOT stored: the URL is shared and can end up in
    // logs, and a home address is personal data.
    function readUrlState() {
        const params = new URLSearchParams(location.search);
        const list = (name, allowed) => (params.get(name) || '').split(',').filter(v => allowed.includes(v));

        if (params.has('type')) state.types = new Set(list('type', ALL_TYPES));
        if (state.types.size === 0) state.types = new Set(ALL_TYPES);
        if (params.has('eier')) state.owners = new Set(list('eier', ALL_OWNERS));
        if (params.has('resultat')) state.scores = new Set(list('resultat', ALL_SCORES));

        const kommune = params.get('kommune');
        if (kommune && entries.some(e => e.school.kommune === kommune)) state.kommune = kommune;
        const profile = params.get('profil');
        if (profile && PROFILE_LABEL[profile]) state.profile = profile;
        const sort = params.get('sort');
        if (['distance', 'fit', 'known', 'name', 'avg-desc', 'avg-asc', 'triv-desc', 'triv-asc', 'mob-asc', 'mob-desc'].includes(sort)) state.sort = sort;
        if (params.has('mobbing')) state.mobbings = new Set(list('mobbing', ALL_MOBBING));
        if (params.has('laerer')) state.laerere = new Set(list('laerer', ALL_LAERER));
        if (params.has('norsk')) state.norsk = new Set(list('norsk', ALL_NORSK));
        const trivsel = params.get('trivsel');
        // Older shared links used a minimum ("4.2" = 4,2 and over)
        const legacy = { '4.0': ['40', '42', '44'], '4.2': ['42', '44'], '4.4': ['44'] };
        if (legacy[trivsel]) state.trivsels = new Set(legacy[trivsel]);
        else if (params.has('trivsel')) state.trivsels = new Set(list('trivsel', ALL_TRIVSEL));
        if (params.get('lagrede') === '1') state.savedOnly = true;
        if (params.get('visning') === 'liste') state.view = 'liste';
        if (['10', '15', '30'].includes(params.get('gangtid'))) state.walk = Number(params.get('gangtid'));
        if (params.has('anlegg')) state.anlegg = new Set(list('anlegg', ANLEGG.map(a => a.id)));

        if (params.has('prio')) state.priorities = new Set(list('prio', PRIORITIES.map(p => p.id)));
        if (sort === 'fit') state.sort = 'fit';
        return { school: params.get('skole') };
    }

    function writeUrlState() {
        const params = new URLSearchParams();
        const list = (set, all) => all.filter(v => set.has(v)).join(',');

        if (state.types.size !== ALL_TYPES.length) params.set('type', list(state.types, ALL_TYPES));
        if (state.owners.size) params.set('eier', list(state.owners, ALL_OWNERS));
        if (state.scores.size) params.set('resultat', list(state.scores, ALL_SCORES));
        if (state.kommune) params.set('kommune', state.kommune);
        if (state.profile) params.set('profil', state.profile);
        if (state.trivsels.size) params.set('trivsel', list(state.trivsels, ALL_TRIVSEL));
        if (state.mobbings.size) params.set('mobbing', list(state.mobbings, ALL_MOBBING));
        if (state.laerere.size) params.set('laerer', list(state.laerere, ALL_LAERER));
        if (state.norsk.size) params.set('norsk', list(state.norsk, ALL_NORSK));
        if (state.sort !== 'distance') params.set('sort', state.sort);
        if (state.savedOnly) params.set('lagrede', '1');
        if (state.view === 'liste') params.set('visning', 'liste');
        if (state.walk) params.set('gangtid', String(state.walk));
        if (state.anlegg.size) params.set('anlegg', ANLEGG.map(a => a.id).filter(id => state.anlegg.has(id)).join(','));
        if (state.school) params.set('skole', state.school);
        const chosenIds = PRIORITIES.map(p => p.id).filter(id => state.priorities.has(id));
        if (chosenIds.length) params.set('prio', chosenIds.join(','));
        rememberPriorities(chosenIds);
        if (I18N.translated) params.set('lang', I18N.lang);   // a shared link keeps the language

        const query = params.toString();
        history.replaceState(history.state, '', query ? `?${query}` : location.pathname);
    }

    // Put the controls in line with the state (after reading the URL or resetting)
    function syncControls() {
        const level = state.types.size === ALL_TYPES.length ? 'begge' : [...state.types][0];
        document.querySelectorAll('input[name="trinn"]').forEach(i => { i.checked = i.value === level; });
        document.querySelectorAll('input[name="owner"]').forEach(i => { i.checked = state.owners.has(i.value); });
        document.querySelectorAll('input[name="score"]').forEach(i => { i.checked = state.scores.has(i.value); });
        el('kommuneFilter').value = state.kommune;
        document.querySelectorAll('input[name="profile"]').forEach(i => { i.checked = i.value === state.profile; });
        document.querySelectorAll('input[name="trivsel"]').forEach(i => { i.checked = state.trivsels.has(i.value); });
        document.querySelectorAll('input[name="mobbing"]').forEach(i => { i.checked = state.mobbings.has(i.value); });
        document.querySelectorAll('input[name="laerer"]').forEach(i => { i.checked = state.laerere.has(i.value); });
        document.querySelectorAll('input[name="norsk"]').forEach(i => { i.checked = state.norsk.has(i.value); });
        document.querySelectorAll('input[name="walk"]').forEach(i => { i.checked = Number(i.value) === state.walk; });
        renderPresets();
        showSort(state.sort);
    }

    // ── Filters ──────────────────────────────────────────────────────────
    function fillKommuneOptions() {
        const select = el('kommuneFilter');
        const kommuner = [...new Set(entries.map(e => e.school.kommune))]
            .sort((a, b) => a.localeCompare(b, 'nb'));
        select.insertAdjacentHTML('beforeend',
            kommuner.map(k => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join(''));
    }

    function fillProfileOptions() {
        const counts = {};
        entries.forEach(e => {
            if (e.school.profil) counts[e.school.profil] = (counts[e.school.profil] || 0) + 1;
        });
        el('profileOptions').insertAdjacentHTML('beforeend', Object.keys(PROFILE_LABEL)
            .filter(p => counts[p])
            .map(p => `<ds-field class="ds-field filter-option">
                    <input class="ds-input" type="radio" id="f-profile-${p}" name="profile" value="${p}" />
                    <label class="ds-label" data-weight="regular" for="f-profile-${p}">${t(PROFILE_LABEL[p])} (${counts[p]})</label>
                </ds-field>`)
            .join(''));
    }

    function bindFilters() {
        // Trinn under the search: all schools, or only barneskoler or ungdomsskoler
        document.querySelectorAll('input[name="trinn"]').forEach(input => {
            input.addEventListener('change', () => {
                if (!input.checked) return;
                state.types = new Set(input.value === 'begge' ? ALL_TYPES : [input.value]);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="owner"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.owners, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="score"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.scores, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="trivsel"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.trivsels, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="mobbing"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.mobbings, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="laerer"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.laerere, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="norsk"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.norsk, input.value, input.checked);
                applyFilters();
            });
        });
        // «Gangtid til skolen (anslag ut fra luftlinje)» (only with an address)
        document.querySelectorAll('input[name="walk"]').forEach(input => {
            input.addEventListener('change', () => {
                state.walk = Number(input.value);
                applyFilters();
            });
        });
        el('anleggOptions').addEventListener('change', event => {
            const id = event.target.dataset.anlegg;
            if (!id) return;
            if (event.target.checked) state.anlegg.add(id); else state.anlegg.delete(id);
            applyFilters();
        });
        // «Læring og trivsel» in words: each sets one of the interval groups further down
        el('presetOptions').addEventListener('change', event => {
            const p = FILTER_PRESETS.find(x => x.id === event.target.dataset.preset);
            if (!p) return;
            state[p.key] = event.target.checked ? new Set(p.values) : new Set();
            syncControls();
            applyFilters();
        });
        el('profileFilter').addEventListener('change', event => {
            if (event.target.name !== 'profile') return;
            state.profile = event.target.value;
            applyFilters();
        });
        el('kommuneFilter').addEventListener('change', event => {
            state.kommune = event.target.value;
            // The map jumps to the kommune, so a searched address no longer applies
            clearAddressSearch();
            applyFilters();
            fitToFiltered();
        });
        el('sortMenu').addEventListener('click', event => {
            const item = event.target.closest('.sort-menu__item');
            if (!item) return;
            el('sortMenu').hidePopover();
            if (item.dataset.sort === state.sort) return;
            state.sort = item.dataset.sort;
            state.shown = PAGE_SIZE;
            showSort(state.sort);
            announceList = true;
            renderList();
            writeUrlState();
        });

        // Filters slide in from the right (a modal Designsystemet Dialog). The list and map update as you
        // choose; "Vis N skoler", the close button, Esc or a click outside the panel closes it.
        const dialog = el('filterPanel');
        el('filterToggle').addEventListener('click', () => setFilterPanel(true));
        el('filterToggleSticky').addEventListener('click', () => setFilterPanel(true));
        el('filterClose').addEventListener('click', () => setFilterPanel(false));
        el('filterDone').addEventListener('click', () => setFilterPanel(false));
        el('filterResetDialog').addEventListener('click', () => resetFilters(true));
        dialog.addEventListener('click', event => {
            if (event.target === dialog) setFilterPanel(false); // the backdrop
        });
        // The panel is a step in the browser's history, so the phone's back button (or gesture) closes it
        // instead of leaving the page. Closing it any other way (button, Esc, backdrop) takes that step back.
        // Watched through the dialog's "open" attribute: the "close" event did not always come.
        let wasOpen = false;
        let keepFilters = false;
        new MutationObserver(() => {
            if (dialog.open === wasOpen) return;
            wasOpen = dialog.open;
            if (dialog.open) return;
            el('filterToggle').setAttribute('aria-expanded', 'false');
            el('filterToggleSticky').setAttribute('aria-expanded', 'false');
            if (history.state && history.state.filterPanel) {
                // The step back lands on the address the page had before the panel opened: write the filters
                // chosen in the panel into it again once it is there
                keepFilters = true;
                history.back();
            }
            (el('filterToggleSticky').hidden ? el('filterToggle') : el('filterToggleSticky')).focus();
        }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
        window.addEventListener('popstate', () => {
            if (dialog.open && !(history.state && history.state.filterPanel)) dialog.close();
            if (keepFilters) {
                keepFilters = false;
                writeUrlState();
            }
        });
        bindActiveFilters();
        bindStickyFilter();
    }

    function setFilterPanel(open) {
        const dialog = el('filterPanel');
        el('filterToggle').setAttribute('aria-expanded', String(open));
        el('filterToggleSticky').setAttribute('aria-expanded', String(open));
        if (open && !dialog.open) {
            dialog.showModal();
            history.pushState({ ...(history.state || {}), filterPanel: true }, '');
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }

    // Phones: the list head (title, sort) stays at the top while the list scrolls, and shows the filter button
    // once the search row with its own filter button has scrolled out of view
    function bindStickyFilter() {
        const actions = el('resultsToolbar');
        if (!actions || !('IntersectionObserver' in window)) return;
        new IntersectionObserver(([entry]) => {
            el('filterToggleSticky').hidden = entry.isIntersecting || !phoneLayout.matches;
        }).observe(actions);
    }

    // Icons in the chips: the same as on the map markers and in the list
    function addChipIcons() {
        document.querySelectorAll('[data-type-icon]').forEach(span => { span.innerHTML = schoolTypeIcon(span.dataset.typeIcon); });
        document.querySelectorAll('[data-owner-icon]').forEach(span => { span.innerHTML = ownerIcon(span.dataset.ownerIcon); });
        document.querySelectorAll('[data-aksel]').forEach(node => node.insertAdjacentHTML('afterbegin', icon(node.dataset.aksel)));
        document.querySelectorAll('[data-aksel-end]').forEach(node => node.insertAdjacentHTML('beforeend', icon(node.dataset.akselEnd)));
    }

    // Number of filters that differ from the default, shown on the "Filtre" button
    function activeFilterCount() {
        // Trinn is chosen with the chips under the search, so it is not counted here
        return (state.anlegg.size ? 1 : 0)
            + (state.walk && state.address ? 1 : 0)
            + (state.owners.size ? 1 : 0)
            + (state.scores.size ? 1 : 0)
            + (state.kommune ? 1 : 0)
            + (state.profile ? 1 : 0)
            + (state.trivsels.size ? 1 : 0)
            + (state.mobbings.size ? 1 : 0)
            + (state.laerere.size ? 1 : 0)
            + (state.norsk.size ? 1 : 0);
    }

    function updateFilterCount() {
        const count = activeFilterCount();
        [el('filterCount'), el('filterCountSticky')].forEach(badge => {
            badge.hidden = count === 0;
            badge.dataset.count = String(count);
            badge.setAttribute('aria-label', count === 1 ? t('1 aktivt filter') : t('{count} aktive filtre', { count }));
        });
        renderActiveFilters();
        el('filterLabel').textContent = count ? `${t('Filter')} (${count})` : t('Filter');
        renderPresets();
        // "Nullstill" in the panel sets everything back, trinn too; only usable when something is chosen
        el('filterResetDialog').disabled = count === 0 && state.types.size === ALL_TYPES.length;
        updateSummaries();
    }

    // ── Active filters as chips under the search ──────────────────────────
    // One chip per filter group that is not at its default, so you see why the list is short; the chip's ✕
    // sets that group back. The chip shows the chosen values ("Offentlig", "Oslo", "Barneskole"), the score
    // chip the chosen colours. Trivsel and Mobbing are number ranges, so their chips keep the word.
    // `named`: the group's name goes before the values (and is always in the label for screen readers).
    // In the panel's order: national tests first, then school type, owner, (kommune, profile,) trivsel, mobbing
    const FILTER_GROUPS = [
        { name: 'score', label: 'Nasjonale prøver', key: 'scores', all: () => ALL_SCORES, named: false, dots: true },
        { name: 'owner', label: 'Eierform', key: 'owners', all: () => ALL_OWNERS, named: false },
        { name: 'trivsel', label: 'Trivsel', key: 'trivsels', all: () => ALL_TRIVSEL, named: true },
        { name: 'mobbing', label: 'Mobbing', key: 'mobbings', all: () => ALL_MOBBING, named: true },
        { name: 'laerer', label: 'Lærertetthet', key: 'laerere', all: () => ALL_LAERER, named: true },
        { name: 'norsk', label: 'Forsterket norsk', key: 'norsk', all: () => ALL_NORSK, named: true }
    ];

    function activeFilterChips() {
        const optionLabel = input => document.querySelector(`#filterPanel label[for="${input.id}"]`).textContent.trim();
        const chips = [];
        FILTER_GROUPS.forEach(group => {
            if (state[group.key].size === 0) return;
            const inputs = [...document.querySelectorAll(`#filterPanel input[name="${group.name}"]`)];
            const checked = inputs.filter(i => i.checked);
            const value = checked.length <= 2 ? checked.map(optionLabel).join(', ')
                : t('{current} av {total}', { current: checked.length, total: inputs.length });
            const dots = group.dots ? checked.map(i => `<span class="color-dot score-${escapeHtml(i.value)}" aria-hidden="true"></span>`).join('') : '';
            chips.push({ id: group.name, dots, text: group.named ? `${t(group.label)} ${value}` : value, label: `${t(group.label)}: ${value}` });
        });
        if (state.kommune) chips.push({ id: 'kommune', text: state.kommune, label: `${t('Kommune')}: ${state.kommune}` });
        if (state.anlegg.size) {
            const text = ANLEGG.filter(a => state.anlegg.has(a.id)).map(a => t(a.label)).join(', ');
            chips.push({ id: 'anlegg', text, label: `${t('Anlegg ved skolen')}: ${text}` });
        }
        if (state.walk && state.address) {
            const text = t('Inntil {minutes} min å gå', { minutes: state.walk });
            chips.push({ id: 'walk', text, label: `${t('Gangtid til skolen (anslag ut fra luftlinje)')}: ${text}` });
        }
        if (state.profile) {
            const input = document.querySelector(`#filterPanel input[name="profile"][value="${CSS.escape(state.profile)}"]`);
            // The label has the number of schools in brackets; the chip only the profile
            const name = input ? optionLabel(input).replace(/\s*\(\d+\)$/, '') : state.profile;
            chips.push({ id: 'profile', text: name, label: `${t('Profil')}: ${name}` });
        }
        // In the panel's order
        const ORDER = ['score', 'anlegg', 'walk', 'owner', 'kommune', 'profile', 'trivsel', 'mobbing', 'laerer', 'norsk'];
        return chips.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    }

    function renderActiveFilters() {
        const list = el('activeFilters');
        const chips = activeFilterChips();
        list.hidden = chips.length === 0;
        list.innerHTML = chips.map(chip => `<li><button type="button" class="ds-chip" data-removable="true" data-size="sm"
                data-filter="${chip.id}" aria-label="${escapeHtml(t('Fjern filter: {label}', { label: chip.label }))}">${chip.dots || ''}${escapeHtml(chip.text)}</button></li>`).join('')
            // With two or more filters on, one link at the end removes them all (as on most search sites)
            + (chips.length > 1 ? `<li><button type="button" class="ds-button active-filters__clear" data-variant="tertiary" data-size="sm" data-clear>${t('Fjern alle')}</button></li>` : '');
    }

    function removeFilter(id) {
        if (id === 'kommune') state.kommune = '';
        else if (id === 'walk') state.walk = 0;
        else if (id === 'anlegg') state.anlegg = new Set();
        else if (id === 'profile') state.profile = '';
        else {
            const group = FILTER_GROUPS.find(g => g.name === id);
            state[group.key] = new Set();
        }
        syncControls();
        applyFilters();
    }

    function bindActiveFilters() {
        el('activeFilters').addEventListener('click', event => {
            if (event.target.closest('[data-clear]')) {
                resetFilters();
                el('filterToggle').focus();
                return;
            }
            const chip = event.target.closest('[data-filter]');
            if (!chip) return;
            const index = [...el('activeFilters').querySelectorAll('[data-filter]')].indexOf(chip);
            removeFilter(chip.dataset.filter);
            // Focus moves to the chip that took its place, or to the filter button when none is left
            const rest = el('activeFilters').querySelectorAll('[data-filter]');
            (rest[Math.min(index, rest.length - 1)] || el('filterToggle')).focus();
        });
    }

    // The dropdown buttons say what is chosen: "Alle", the one option, or "2 av 5"
    function updateSummaries() {
        document.querySelectorAll('[data-summary]').forEach(summary => {
            const inputs = [...document.querySelectorAll(`input[name="${summary.dataset.summary}"]`)];
            const checked = inputs.filter(i => i.checked);
            const label = input => document.querySelector(`label[for="${input.id}"]`).textContent.trim();
            summary.textContent = checked.length === 0 || checked.length === inputs.length ? t('Alle')
                : checked.length === 1 ? label(checked[0])
                : t('{current} av {total}', { current: checked.length, total: inputs.length });
            summary.closest('.filter-dd__button').toggleAttribute('data-active', checked.length > 0 && checked.length !== inputs.length);
        });
    }

    function toggle(set, value, on) {
        if (on) set.add(value); else set.delete(value);
    }

    // A filter group with nothing chosen lets every school through
    const allows = (set, value) => set.size === 0 || set.has(value);

    function passes(entry) {
        const school = entry.school;
        const shown = levelsShown(entry);
        // With no owner type chosen (or both), schools without a register match are included too
        const ownerOk = state.owners.size === 0 || state.owners.size === ALL_OWNERS.length || state.owners.has(school.eierform);
        // A school with both levels passes when one of the levels the type filter shows does
        return shown.length > 0
            && ownerOk
            && shown.some(level => allows(state.scores, scoreCategory(level.color)))
            && (!state.kommune || school.kommune === state.kommune)
            && (!state.profile || school.profil === state.profile)
            && (!state.anlegg.size || entry.levels.some(level => [...state.anlegg].every(id => ANLEGG.find(a => a.id === id).test(facilities[level.orgnr]))))
            && (!state.walk || !state.address || state.address.postnummer || walkEstimate(state.address, school).minutes <= state.walk)
            && shown.some(level => allows(state.trivsels, trivselBand(level)))
            && shown.some(level => allows(state.mobbings, mobbingBand(level)))
            && shown.some(level => allows(state.laerere, laererBand(level)))
            && shown.some(level => allows(state.norsk, norskBand(level)));
    }

    // ── Schools with 1.–10. trinn ──────────────────────────────────────
    // An entry is one school; `levels` has its record (or the barneskole and the ungdomsskole record of
    // the same school), `keys` the school page of each level. Sorting and the card use the levels the
    // type filter shows, and with both shown the mean of the two: both scales have 50 as the national
    // average, so the mean says how the school does on both tests together.
    function entryFor(key) {
        return entries.find(e => e.keys.includes(key));
    }

    function levelsShown(entry) {
        return entry.levels.filter(level => state.types.has(level.schoolType));
    }

    function meanOf(values) {
        const known = values.filter(v => v !== null && v !== undefined);
        return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    }

    const averageOf = entry => meanOf(levelsShown(entry).map(l => (l.hasData ? l.average : null)));
    const trivselOf = entry => meanOf(levelsShown(entry).map(l => (l.trivsel ? l.trivsel.score : null)));
    const mobbingOf = entry => meanOf(levelsShown(entry).map(l => (l.mobbing ? l.mobbing.share : null)));

    function trivselBand(school) {
        if (!school.trivsel) return 'none';
        const score = Math.round(school.trivsel.score * 10);   // 4.2 -> 42, avoids float edge cases
        if (score < 38) return 'u38';
        if (score < 40) return '38';
        if (score < 42) return '40';
        if (score < 44) return '42';
        return '44';
    }

    function mobbingBand(school) {
        if (!school.mobbing) return 'none';
        const share = school.mobbing.share;
        if (share < 5) return 'u5';
        if (share < 10) return '5';
        if (share < 15) return '10';
        return '15';
    }

    function laererBand(school) {
        const value = school.gsi && school.gsi.laerertetthet;
        // 0 is what GSI reports for some special schools: no figure, not «under 14»
        if (value === null || value === undefined || value === 0) return 'none';
        if (value < 14) return 'u14';
        if (value < 16) return '14';
        if (value < 18) return '16';
        return '18';
    }

    function norskBand(school) {
        const share = school.gsi && school.gsi.norsk;
        if (share === null || share === undefined) return 'none';
        if (share < 5) return 'u5';
        if (share < 10) return '5';
        if (share < 20) return '10';
        return '20';
    }

    function filtersActive() {
        return activeFilterCount() > 0;
    }

    function applyFilters() {
        announceList = true;
        filtered = entries.filter(passes);
        cluster.clearLayers();
        cluster.addLayers(filtered.map(e => e.marker));
        state.shown = PAGE_SIZE;
        updateFilterCount();
        // The panel's main button says how many schools the filters leave, in all of Norway
        el('filterDone').textContent = filtered.length === 1 ? t('Vis 1 skole')
            : t('Vis {count} skoler', { count: countFormat.format(filtered.length) });
        el('filterCountText').textContent = filtered.length === 1 ? t('1 skole passer valgene')
            : t('{count} skoler passer valgene', { count: countFormat.format(filtered.length) });
        renderList();
        writeUrlState();
    }

    // The filter groups go back to nothing chosen. Trinn stays as chosen, except when a school must be
    // shown that it hides (`allLevels`: a shared link or a school picked in the search).
    function resetFilters(allLevels = false) {
        if (allLevels === true) state.types = new Set(ALL_TYPES);
        state.walk = 0;
        state.anlegg = new Set();
        state.owners = new Set();
        state.scores = new Set();
        state.kommune = '';
        state.profile = '';
        state.trivsels = new Set();
        state.mobbings = new Set();
        state.laerere = new Set();
        state.norsk = new Set();
        syncControls();
        applyFilters();
    }

    function fitToFiltered() {
        if (!filtered.length) return;
        const bounds = L.latLngBounds(filtered.map(e => [e.school.lat, e.school.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }

    // ── School list ──────────────────────────────────────────────────────
    function referencePoint() {
        if (state.address) return L.latLng(state.address.lat, state.address.lng);
        return map.getCenter();
    }

    function sortEntries(list) {
        const ref = referencePoint();
        const byName = (a, b) => a.school.name.localeCompare(b.school.name, 'nb');
        const avg = averageOf;
        const triv = trivselOf;
        const byValue = (value, dir) => (a, b) => {
            const x = value(a), y = value(b);
            if (x === null && y === null) return byName(a, b);
            if (x === null) return 1;   // schools without data last
            if (y === null) return -1;
            return dir * (x - y) || byName(a, b);
        };

        // A kommune without an address has no place to measure from: «Nærmest» means by name there
        if (state.sort === 'name' || (state.sort === 'distance' && state.kommune && !state.address)) return list.sort(byName);
        if (state.sort === 'avg-desc') return list.sort(byValue(avg, -1));
        if (state.sort === 'avg-asc') return list.sort(byValue(avg, 1));
        if (state.sort === 'triv-desc') return list.sort(byValue(triv, -1));
        if (state.sort === 'triv-asc') return list.sort(byValue(triv, 1));
        const mob = mobbingOf;
        if (state.sort === 'mob-asc') return list.sort(byValue(mob, 1));
        if (state.sort === 'mob-desc') return list.sort(byValue(mob, -1));

        list.forEach(e => { e.distance = ref.distanceTo([e.school.lat, e.school.lng]); });
        // «Mest bekreftet informasjon» (Figma J5): the schools we know the most about first – results, well-being,
        // bullying, extra Norwegian teaching and the chosen priorities that have data – then nearest
        if (state.sort === 'known') {
            const known = e => [averageOf(e), trivselOf(e), mobbingOf(e), e.school.gsi && e.school.gsi.norsk].filter(v => v !== null && v !== undefined).length
                + (state.priorities.size ? evaluate(e).known : 0);
            return list.sort((a, b) => (known(b) - known(a)) || (a.distance - b.distance));
        }
        // «Passer best»: the most priorities met first, fewest things worth checking, then nearest
        if (state.sort === 'fit' && state.priorities.size) {
            return list.sort((a, b) => {
                const x = evaluate(a), y = evaluate(b);
                return (y.met - x.met) || (x.warnings - y.warnings) || (a.distance - b.distance);
            });
        }
        // The address's own school is shown in its own card above; the list stays in distance order
        return list.sort((a, b) => a.distance - b.distance);
    }

    // The list is drawn again after a bookmark is pressed: keyboard focus goes back to the same bookmark,
    // or to the list heading when the school has left the list (the saved list)
    function refocusSave(key) {
        const again = [...document.querySelectorAll('#kretsNote button[data-save], #schoolList button[data-save]')]
            .find(button => button.dataset.save === key);
        if (again) again.focus();
        else {
            const heading = el(state.savedOnly ? 'savedTitle' : 'resultsTitle');
            heading.tabIndex = -1;
            heading.focus();
        }
    }

    // Render again without letting go of a list that is held after a pick from it
    function refreshList() {
        const held = keepList;
        renderList(held ? listBounds : undefined);
        keepList = held;
    }

    // ── Saved schools ("Lagre til senere") ──────────────────────────────
    function bindSaved() {
        // "Lagrede skoler" in the header: on this page, no need to load it again
        document.querySelectorAll('.saved-link').forEach(link => link.addEventListener('click', event => {
            event.preventDefault();
            setSavedOnly(true);
            el('resultsTitle').scrollIntoView({ block: 'nearest' });
        }));
        // A bookmark changed somewhere on the page: the counter (and the saved list) follow
        document.addEventListener('savedschools', () => {
            renderSide();
            if (state.savedOnly) refreshList();
        });
    }

    function setSavedOnly(on) {
        announceList = true;
        state.savedOnly = on;
        if (on && state.step !== 'results') showStep('results');
        state.shown = PAGE_SIZE;
        // The saved schools are this browser's own list: not a page for search engines
        let robots = document.querySelector('meta[name="robots"]');
        if (on && !robots) {
            robots = document.createElement('meta');
            robots.name = 'robots';
            robots.content = 'noindex';
            document.head.appendChild(robots);
        } else if (!on && robots) {
            robots.remove();
        }
        if (on) {
            const saved = savedSchools();
            const points = entries.filter(e => e.keys.some(k => saved.has(k)) && e.school.lat).map(e => [e.school.lat, e.school.lng]);
            if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 14, animate: false });
        }
        renderList();
        writeUrlState();
    }

    // The saved schools are opened from "Lagrede skoler" in the header. Then the page is only the list
    // and the map: the search, filters, the address's schools and the sorting are hidden, and
    // "Vis alle skoler" goes back to the start page with nothing chosen (like the logo)
    function updateSavedBar() {
        el('savedBar').hidden = !state.savedOnly;
        // The title sits next to the way back, so the list starts at the same height as the map
        document.querySelector('.results-head').hidden = state.savedOnly;
        el('resultsBand').hidden = state.savedOnly || state.step !== 'results';
        document.querySelector('.results-sort').hidden = state.savedOnly;
        el('savedToggle').href = I18N.href('./');
        el('savedToggle').innerHTML = `${icon('chevronLeft')}<span>${t('Vis alle skoler')}</span>`;
        document.querySelectorAll('.saved-link').forEach(link => {
            if (state.savedOnly) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
    }

    // ── Liste or Kart (Figma, section 10) ──────────────────────────────
    // The start (Figma 10.1, F0) is always drawn as in the design, the ways to begin and the side column; the chosen
    // view comes with the list
    function showView() {
        const view = state.step === 'results' ? state.view : 'liste';
        if (el('resultsGrid').dataset.view === view) return;
        el('resultsGrid').dataset.view = view;
        if (map) setTimeout(() => map.invalidateSize(), 0);
    }

    // Liste: the list is wide and the side column has the saved schools and a way to the map; the map waits
    // out of sight at its real size, since it still decides which schools the list shows. Kart: the list
    // next to the map, as before.
    function bindView() {
        document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
        setView(state.view, false);
    }

    function setView(view, write = true) {
        state.view = view === 'liste' ? 'liste' : 'kart';
        showView();
        document.querySelectorAll('.view-switch [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
        if (write) writeUrlState();
    }

    // The side column: the saved schools by name (links to their pages) and the way to the saved list
    function renderSide() {
        const saved = savedSchools();
        const list = entries.filter(e => e.keys.some(k => saved.has(k)));
        // The link to the comparison holds only the schools' public keys, never the address
        const params = new URLSearchParams();
        list.slice(0, 4).forEach(e => params.append('s', e.keys.find(k => saved.has(k))));
        const compareUrl = new URL(`sammenlign?${params}`, location.href).href;
        // Every part of the card is there also before anything is saved (Figma 10.1, F1), each with its own empty state
        const canCompare = list.length >= 2;
        updateMobileBar();
        el('sideSaved').innerHTML = `
            <h2 class="ds-heading" data-size="2xs" id="sideSavedTitle">${t('Lagrede skoler ({count})', { count: list.length })}</h2>
            ${list.length ? `<ul class="side-card__list">${list.slice(0, 6).map(e => {
                const key = e.keys.find(k => saved.has(k));
                const level = e.levels.find(l => schoolKey(l) === key) || e.school;
                return `<li>${icon('bookmarkFill')}<a class="ds-link" href="${schoolUrl(level)}">${escapeHtml(e.school.name)}</a></li>`;
            }).join('')}</ul>`
            : `<p class="ds-paragraph side-card__empty" data-size="sm">${t('Du har ikke lagret noen skoler ennå. Trykk «Lagre» ved en skole for å finne den igjen her.')}</p>`}
            ${canCompare
                ? `<a class="ds-button side-card__primary" data-variant="primary" href="${I18N.href('sammenlign')}">${t('Sammenlign ({count})', { count: Math.min(list.length, 4) })}</a>`
                : `<button type="button" class="ds-button side-card__primary" data-variant="primary" disabled aria-describedby="sideCompareHint">${t('Sammenlign ({count})', { count: list.length })}</button>
                   <p class="side-card__hint" id="sideCompareHint">${t('Lagre minst to skoler for å sammenligne dem.')}</p>`}
            ${list.length
                ? `<a class="ds-button side-card__secondary" data-variant="secondary" href="${I18N.href('sammenlign')}#del">${icon('share')}<span>${t('Del listen med familien')}</span></a>`
                : `<button type="button" class="ds-button side-card__secondary" data-variant="secondary" disabled>${icon('share')}<span>${t('Del listen med familien')}</span></button>`}`;
    }

    // (see updateSavedBar)

    // A preset is on when its group holds exactly its values (walking time: the same number of minutes)
    const quickOn = q => (q.key === 'walk' ? state.walk === q.values[0]
        : state[q.key].size === q.values.length && q.values.every(v => state[q.key].has(v)));
    const quickSet = (q, on) => { state[q.key] = q.key === 'walk' ? (on ? q.values[0] : 0) : (on ? new Set(q.values) : new Set()); };

    // The filter panel's first group (Figma, section 10, F3): the same kind of choices in words
    const FILTER_PRESETS = [
        { id: 'p-over', label: 'Over snittet på nasjonale prøver', key: 'scores', values: ['very-high', 'high'] },
        { id: 'p-high', label: 'Godt over snittet (55+)', key: 'scores', values: ['very-high'] },
        { id: 'p-trives', label: 'Trivsel 4,2 eller høyere', key: 'trivsels', values: ['42', '44'] },
        { id: 'p-mobbing', label: 'Mobbing under 10 %', key: 'mobbings', values: ['u5', '5'] }
    ];
    // «Anlegg ved skolen» (OpenStreetMap): a football pitch or a sports hall at the school, a pool within 1 km
    const ANLEGG = [
        { id: 'fotball', label: 'Fotballbane', test: f => Boolean(f && f[0]) },
        { id: 'hall', label: 'Idrettshall', test: f => Boolean(f && f[1]) },
        { id: 'basseng', label: 'Basseng innen 1 km', test: f => Boolean(f && f[2] !== null && f[2] <= 1000) }
    ];
    function renderPresets() {
        el('anleggOptions').innerHTML = ANLEGG.map(a => `<label class="ds-chip"><input type="checkbox" data-anlegg="${a.id}"${state.anlegg.has(a.id) ? ' checked' : ''} />${t(a.label)}</label>`).join('');
        el('presetOptions').innerHTML = FILTER_PRESETS.map(p => `<label class="ds-chip"><input type="checkbox" data-preset="${p.id}"${quickOn(p) ? ' checked' : ''} />${t(p.label)}</label>`).join('');
        // Walking time needs an address to measure from
        const noPlace = !state.address || Boolean(state.address.postnummer);
        document.querySelectorAll('input[name="walk"]').forEach(i => { i.disabled = noPlace; });
        el('walkHint').hidden = !noPlace;
    }

    // `bounds`: the area the list is built from (by default the visible map)
    function renderList(bounds = map.getBounds()) {
        // Phones only show the list, and the hidden map is so small that it held two or three schools: there the
        // list after an address search has the schools within 2 km of it instead
        if (phoneLayout.matches && state.address && !state.address.postnummer && !state.savedOnly) {
            bounds = L.latLng(state.address.lat, state.address.lng).toBounds(4000);
        }
        // Any other change (filters, address, sorting) shows the schools in the map view again
        keepList = false;
        renderPresets();
        listBounds = bounds;
        // Before a search, with (nearly) all of Norway in view, the list would be random schools sorted by the
        // distance to the middle of the map. Show how to start instead, until there is a place, a filter or a zoom.
        const start = state.step !== 'results';
        updateSavedBar();
        showView();
        el('schoolList').hidden = start;
        // «Slik leser du kortene» only explains the facts that come with the family's priorities
        el('readCards').hidden = start || state.savedOnly || !state.priorities.size;
        el('resultsToolbar').hidden = start || state.savedOnly;
        if (start) {
            document.querySelector('.results-head').hidden = true;
            el('kretsNote').hidden = true;
            el('showMore').hidden = true;
            el('schoolList').removeAttribute('aria-busy');
            if (el('listLoading')) el('listLoading').remove();
            renderSideMap(true);
            return;
        }
        // Phones: an open card (and its small map), in the list or among the address's schools, stays open
        // when they are drawn again
        const reopen = phoneLayout.matches && openKey ? { key: openKey, where: openWhere } : null;
        const inCards = slot => slot && (el('schoolList').contains(slot) || el('kretsNote').contains(slot));
        const reopenMap = Boolean(reopen) && miniKey === openKey && inCards(mapSlot());
        if (inCards(mapSlot())) closeMiniMap();
        openKey = null;
        // The address's schools come first, in their own block; the list below has the other schools
        renderKretsNote();
        renderSideMap(false);
        // The saved schools: all of them, wherever they are and whatever the filters say
        const saved = savedSchools();
        // Around an address: the schools within 3 km (wider where there are fewer than five); otherwise those in the map view
        let inScope = e => bounds.contains([e.school.lat, e.school.lng]);
        if (state.address && !state.address.postnummer && !state.savedOnly) {
            const ref = L.latLng(state.address.lat, state.address.lng);
            radiusKm = nearbyFor(state.address, filtered.filter(e => !kretsEntries.has(e))).km;
            inScope = e => ref.distanceTo([e.school.lat, e.school.lng]) <= radiusKm * 1000;
        }
        const inView = state.savedOnly
            ? sortEntries(entries.filter(e => e.keys.some(k => saved.has(k))))
            : sortEntries(filtered.filter(e => inScope(e) && !kretsEntries.has(e)));
        const visible = inView.slice(0, state.shown);
        const ref = referencePoint();

        const total = inView.length;
        const noun = t(total === 1 ? 'skole' : 'skoler');
        el('resultsTitle').textContent = state.savedOnly
            ? t('Lagrede skoler ({count})', { count: total })
            : total === 0
                ? t('Ingen skoler')
                : state.kommune && !state.address
                    // A kommune: «Barneskoler i Oslo kommune (125)», by name
                    ? t('{type} i {kommune} kommune ({count})', { type: t(state.types.size === 1 ? (state.types.has('barneskole') ? 'Barneskoler' : 'Ungdomsskoler') : 'Skoler'), kommune: state.kommune, count: countFormat.format(total) })
                : state.address
                    // The address is in the search field, so the heading only says these are the nearby schools;
                    // "Andre" when the address's own schools are in the block above
                    ? (kretsEntries.size
                        ? (visible.length < total
                            ? t('Andre skoler i nærheten ({shown} av {total})', { shown: visible.length, total: countFormat.format(total) })
                            : t('Andre skoler i nærheten ({count})', { count: countFormat.format(total) }))
                        : (visible.length < total
                            ? t('Skoler i nærheten ({shown} av {total})', { shown: visible.length, total: countFormat.format(total) })
                            : t('Skoler i nærheten ({count})', { count: countFormat.format(total) })))
                    : (visible.length < total
                        ? t('Viser {shown} av {total} {noun}', { shown: visible.length, total: countFormat.format(total), noun })
                        : t('{total} {noun}', { total: countFormat.format(total), noun }));

        // With an address, "Skoler i nærheten (12)" is set like "Trolig skolekrets for adressen" above it
        showSort(state.sort);
        el('resultsTitle').classList.toggle('results-title--nearby', Boolean(state.address) && !state.savedOnly && total > 0);
        // That the list is filtered is said by the chips under the search, not again here
        const contextText = '';
        el('resultCount').textContent = state.savedOnly
            ? (total === 0 ? t('Du har ikke lagret noen skoler ennå. Trykk på bokmerket ved en skole for å lagre den til senere.')
                           : t('Lagret i denne nettleseren. Bare du ser dem.'))
            : total === 0
                ? 'Flytt kartet eller endre filtrene.'
                : contextText.charAt(0).toUpperCase() + contextText.slice(1);
        el('resultCount').hidden = !el('resultCount').textContent;
        updateSavedBar();
        if (state.savedOnly) {
            el('savedTitle').textContent = t('Lagrede skoler ({count})', { count: total });
            // Only when there is nothing saved yet: how to save a school
            el('savedText').hidden = total > 0;
            el('savedText').textContent = t('Du har ikke lagret noen skoler ennå. Trykk på bokmerket ved en skole for å lagre den til senere.');
        }

        const SORT_WORDS = { fit: 'hvor godt de passer dere', known: 'hvor mye vi vet', distance: 'avstand', name: 'navn', 'avg-desc': 'høyeste snitt', 'avg-asc': 'laveste snitt',
            'triv-desc': 'høyeste trivsel', 'triv-asc': 'laveste trivsel', 'mob-asc': 'minst mobbing', 'mob-desc': 'mest mobbing' };
        const sortWord = t(SORT_WORDS[state.kommune && !state.address && state.sort === 'distance' ? 'name' : state.sort] || 'avstand');
        const count = countFormat.format(total + kretsEntries.size);
        el('toolbarText').textContent = state.savedOnly ? '' : state.address && !state.address.postnummer
            ? t('{count} skoler innen {km} km · sortert etter {sort}', { count, km: radiusKm, sort: sortWord })
            : t('{count} skoler · sortert etter {sort}', { count, sort: sortWord });
        // Phones only say how many (Figma H1): «19 skoler innen 3 km»
        el('toolbarText').dataset.short = state.address && !state.address.postnummer
            ? t('{count} skoler innen {km} km', { count, km: radiusKm }) : t('{count} skoler', { count });
        const nearest = state.address && state.sort === 'fit' ? null : (state.address && visible[0]);
        // Screen readers hear the new count once, after a choice; moving the map does not repeat it
        if (announceList) {
            const own = !el('kretsNote').hidden && el('kretsNote').querySelector('.own-school__name');
            el('listStatus').textContent = [own ? `${t('Skolekrets for adressen')}: ${own.textContent}` : '', el('resultsTitle').textContent].filter(Boolean).join('. ');
            announceList = false;
        }
        el('schoolList').innerHTML = total === 0 && !state.savedOnly && !kretsEntries.size
            ? emptyStateHtml()
            : visible.map((e, i) => schoolCard(e, ref, i, nearest === e)).join('');
        if (total === 0) bindEmptyState();
        // The first list replaces the loading placeholders
        el('schoolList').removeAttribute('aria-busy');
        if (el('listLoading')) el('listLoading').remove();
        el('schoolList').querySelectorAll('.school-card__save').forEach(button => {
            button.addEventListener('click', () => {
                updateSaveButton(button, toggleSaved(button.dataset.save));
                if (state.savedOnly) {
                    refreshList();
                    refocusSave(button.dataset.save);
                }
            });
        });
        markExpandable(el('schoolList'));
        markExpandable(el('kretsNote'));
        el('schoolList').querySelectorAll('.school-card').forEach(card => {
            card.addEventListener('click', () => {
                if (phoneLayout.matches) {
                    toggleCard(card);
                    return;
                }
                document.querySelectorAll('.school-card[aria-current], .own-school[aria-current]').forEach(c => c.removeAttribute('aria-current'));
                card.setAttribute('aria-current', 'true');
                showSchool(card.dataset.key, true);
            });
        });
        el('schoolList').querySelectorAll('.school-card__map').forEach(button => {
            button.addEventListener('click', () => toggleCardMap(button));
        });
        if (reopen) {
            const container = el(reopen.where === 'krets' ? 'kretsNote' : 'schoolList');
            const card = [...container.querySelectorAll(CARD)].find(c => cardKey(c) === reopen.key);
            if (card) {
                openCard(card.closest(ITEM));
                if (reopenMap) {
                    openMiniMap(card.closest(ITEM), entryFor(reopen.key), { keepPlace: false });
                    setMapButton(card.closest(ITEM).querySelector('.school-card__map'), true);
                }
            }
        }

        el('showMore').hidden = inView.length <= visible.length;
        el('showMore').textContent = t('Vis flere skoler ({count} til)', { count: countFormat.format(inView.length - visible.length) });
    }

    // G2: nothing left after the filters
    function emptyStateHtml() {
        const wider = state.address && !state.address.postnummer && RADIUS_STEPS.find(km => km > radiusKm);
        return `<li class="empty-state">
            <h2 class="empty-state__title">${t('Ingen skoler passer valgene')}</h2>
            <p>${t('Det betyr ikke at ingen skoler kan passe. Mange opplysninger er «Ukjent» – skolene kan ha det dere trenger, uten at vi vet det. Spør skolen.')}</p>
            <div class="empty-state__actions">
                ${wider ? `<button type="button" class="hero-button hero-button--secondary" data-empty="wider" data-km="${wider}">${t('Utvid til {km} km', { km: wider })}</button>` : ''}
                ${filtersActive() ? `<button type="button" class="hero-button hero-button--secondary" data-empty="filters">${t('Fjern alle filtre')}</button>` : ''}
                ${state.priorities.size ? `<button type="button" class="hero-button hero-button--secondary" data-empty="prio">${t('Endre prioriteringer')}</button>` : ''}
            </div></li>`;
    }

    function bindEmptyState() {
        el('schoolList').querySelectorAll('[data-empty]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.empty === 'filters') resetFilters(true);
            if (b.dataset.empty === 'prio') setStep('prio');
            if (b.dataset.empty === 'wider') {
                RADIUS_STEPS.splice(0, RADIUS_STEPS.indexOf(Number(b.dataset.km)));
                refreshList();
            }
        }));
    }

    // The school card as in Figma 5 · PROTOTYPE, A6 «Skolekort»: name and the bookmark, a line of facts, and – when the
    // family chose priorities – «Passer X av N prioriteringer» with a segment for each, then one fact for each
    // priority: «Bekreftet», «Ukjent» (no data, ask the school) or «Verdt å sjekke». Without priorities the three
    // numbers of the school in words, as before.
    function schoolCard(entry, ref, index, isNearest = false) {
        const school = entry.school;
        const shown = levelsShown(entry);
        const combined = entry.levels.length > 1;
        const levels = shown.length ? shown : [school];
        const type = combined ? t('Barne- og ungdomsskole (1.–10. trinn)') : t(school.schoolType === 'barneskole' ? 'Barneskole (1.–7. trinn)' : 'Ungdomsskole (8.–10. trinn)');
        const meta = [type];
        if (school.eierform) {
            meta.push(school.eierform === 'privat' && school.profil && school.profil !== 'annen'
                ? t('Privat, {profile}', { profile: t(PROFILE_LABEL[school.profil]).toLowerCase() })
                : t(OWNER_LABEL[school.eierform]));
        }
        if (!state.address && !state.kommune) meta.push(escapeHtml(school.kommune));
        if (state.address) {
            meta.push(state.address.postnummer ? distanceLabel(school) : formatDistance(L.latLng(state.address.lat, state.address.lng).distanceTo([school.lat, school.lng])));
        }
        if (isNearest) meta.push(t('nærmeste skole'));
        const isOwn = entry.levels.some(isKretsSchool);
        if (isOwn) meta.push(t('Skolen for adressen'));
        // The bookmark shows saved when either level's page was saved
        const saveKey = entry.keys.find(isSaved) || entry.key;
        const numbers = levelNumbers(levels);
        const band = scoreBand(numbers.avg, numbers.avgNational);

        let body = tilesHtml(levels);
        if (state.priorities.size) {
            const ev = evaluate(entry);
            const bar = ev.known
                ? `<span class="sk-fit"><span class="sk-bar" aria-hidden="true">${Array.from({ length: ev.known }, (_, i) => `<span class="sk-bar__seg${i < ev.met ? ' is-on' : ''}"></span>`).join('')}</span>
                    <strong>${t('Passer {met} av {total} prioriteringer', { met: ev.met, total: ev.known })}</strong></span>` : '';
            body = `${bar}<span class="sk-facts">${ev.facts.map(priorityFactHtml).join('')}</span>`;
        }
        return `
            <li class="school-list__item">
                <button type="button" class="school-card school-sk score-${band}${isOwn ? ' school-card--own' : ''}" data-key="${escapeHtml(entry.key)}">
                    <span class="sk-name">${escapeHtml(school.name)}</span>
                    <span class="sk-meta">${meta.join(' · ')}</span>
                    ${body}
                </button>
                ${saveButtonHtml(saveKey, 'school-card__save', true)}
                ${moreLinkHtml(entry.school, 'school-card__more')}
                ${cardDetails(entry, `schoolDetails${index}`)}
            </li>`;
    }

    // Phones: what the map popup adds to the card (the year, the scores per subject, what the numbers
    // are based on, the photo), then "Vis på kartet" («Les mer om skolen» is on the card itself). The numbers already on the
    // card are not repeated. Hidden until the card is tapped; other screens use the map popup instead.
    function cardDetails(entry, id) {
        const combined = entry.levels.length > 1;
        const formatScore = score => (score === null || score === undefined) ? '*' : score;
        const levels = entry.levels.map(level => {
            const notes = [
                level.hasData ? `${t('Snitt')} ${t('({count} fag)', { count: level.validScoresCount })}` : null,
                level.trivsel ? `${t('Trivsel')} ${t('({trinn}. trinn)', { trinn: level.trivsel.trinn })}` : null,
                level.mobbing ? `${t('Mobbing')} ${t('(landet {value})', { value: formatPercent(level.mobbing.national) })}` : null
            ].filter(Boolean);
            return `${combined ? `<p class="ds-paragraph popup-level" data-size="xs"><span class="school-marker score-${scoreCategory(level.color)}" aria-hidden="true">${schoolTypeIcon(level.schoolType)}</span>${t(level.schoolType === 'barneskole' ? '5. trinn' : 'Ungdomstrinnet')}</p>` : ''}
                <p class="ds-paragraph school-card__subjects" data-size="sm">${level.hasData
                    ? t('Engelsk {engelsk} · Lesing {lesing} · Regning {regning}', { engelsk: formatScore(level.engelsk), lesing: formatScore(level.lesing), regning: formatScore(level.regning) })
                    : t('Ingen resultater publisert')}</p>
                ${notes.length ? `<p class="ds-paragraph school-card__notes" data-size="xs">${notes.join(' · ')}</p>` : ''}`;
        }).join('');
        const year = window.SCHOOL_DATA_YEAR
            ? `<p class="ds-paragraph school-card__year" data-size="xs">${t('Nasjonale prøver {year}', { year: window.SCHOOL_DATA_YEAR })}</p>`
            : '';
        return `
            <div class="school-card__details" id="${id}" hidden>
                ${year}
                ${levels}
                ${schoolPhotoHtml(entry.school, 'popup-photo school-card__photo')}
                <div class="school-card__actions">
                    <button type="button" class="ds-button school-card__map" data-variant="secondary" data-size="sm" aria-expanded="false">${icon('locationPin')}<span>${t('Vis på kartet')}</span></button>
                </div>
            </div>`;
    }

    // «Les mer om skolen» on every card, as in the map popup; a link of its own beside the card button
    // (a link inside a button is not allowed)
    const moreLinkHtml = (school, className) => `<a class="ds-link ${className}" href="${schoolUrl(school)}"
        aria-label="${escapeHtml(t('Les mer om {school}', { school: school.name }))}">${t('Les mer om skolen')} →</a>`;

    // One row of label–value pairs: "Snitt 47,0   Trivsel 3,9   Mobbing –"; the list keeps it short, so
    // Trivsel has no "av 5" here (the school page has it, and the scores per subject). The
    // pairs are spaced by CSS (no "·" between them), and a missing value is a dash.
    const statPair = (label, text) => `<span class="school-card__stat">${label} <span class="school-card__stat-value">${text}</span></span>`;

    function statsLine(school) {
        return `<span class="school-card__stats">${statPair(t('Snitt'), school.hasData ? numberFormat.format(school.average) : '–')}${
            statPair(t('Trivsel'), school.trivsel ? numberFormat.format(school.trivsel.score) : '–')}${
            statPair(t('Mobbing'), school.mobbing ? formatPercent(school.mobbing.share) : '–')}</span>`;
    }

    // A school with both levels shown: the mean (used for sorting), then each level's snitt in the same
    // pairs. The second row is left out when neither level has results, since it would only repeat dashes.
    function combinedStats(entry) {
        const fmt = v => (v === null ? '–' : numberFormat.format(v));
        const avg = averageOf(entry), triv = trivselOf(entry), mob = mobbingOf(entry);
        const [barne, ungdom] = entry.levels;
        const levels = barne.hasData || ungdom.hasData
            ? `<span class="school-card__stats">${statPair(t('Snitt 5. trinn'), barne.hasData ? numberFormat.format(barne.average) : '–')}${
                statPair(t('Snitt ungdomstrinnet'), ungdom.hasData ? numberFormat.format(ungdom.average) : '–')}</span>`
            : '';
        return `<span class="school-card__stats">${statPair(t('Snitt'), fmt(avg))}${
            statPair(t('Trivsel'), fmt(triv))}${
            statPair(t('Mobbing'), mob === null ? '–' : formatPercent(mob))}</span>${levels}`;
    }

    // "680 m · ca. 11 min å gå": distance in a straight line and the estimated walk
    function distanceLabel(school) {
        const meters = L.latLng(state.address.lat, state.address.lng).distanceTo([school.lat, school.lng]);
        if (state.address.postnummer) {
            return inPostalArea(state.address, school)
                ? t('I postnummer {postnummer}', { postnummer: state.address.postnummer })
                : t('{distance} fra midten av {postnummer}', { distance: formatDistance(meters), postnummer: state.address.postnummer });
        }
        const walk = walkEstimate(state.address, school);
        return walk.minutes > WALK_MAX_MINUTES
            ? formatDistance(meters)
            : `${formatDistance(meters)} · ${t('ca. {minutes} min å gå', { minutes: walk.minutes })}`;
    }

    // Jump to a school without animation and open its popup once the marker is on the map
    function openSchoolAt(entry) {
        map.setView([entry.school.lat, entry.school.lng], 15, { animate: false });
        cluster.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
    }

    // Zoom to a school (from the list or the name search). If the filters hide it,
    // clear them first so the marker exists on the map.
    function showSchool(key, fromList = false) {
        const entry = entryFor(key);
        if (!entry) return;
        if (!passes(entry)) resetFilters(true);
        keepList = fromList;
        zoomToMarker(entry.marker, map, cluster);

        // Phones: a pick from the name search opens a small map at the top of the list (list cards open
        // it under themselves, see the card click)
        if (phoneLayout.matches && !fromList) {
            closeCards();
            openMiniMap(document.querySelector('.results-head'), entry, { popup: true });
        }
    }

    // ── Phones: only the list; a tapped school opens under itself ──
    // The big map stays out of sight (it still decides which schools the list shows). A tapped card opens
    // with what the map popup would show and two buttons in one row: "Vis på kartet" (a small map inside the card,
    // above the buttons, centred on the school without its popup since the card already says it all, with the other
    // schools around it as on the big map) and "Les mer om skolen". One
    // card is open at a time: tapping another opens that one and closes the first, tapping the same card
    // closes it. The tapped card keeps its place on the screen (no jump when a card above it closes), and
    // the page only scrolls when the opened part does not fit below.
    const phoneLayout = window.matchMedia('(max-width: 640px)');
    let miniMap = null;
    let miniKey = null;
    let openKey = null;

    function bindPhoneMap() {
        // Phone ↔ wider screen: close what is open and draw the cards for the new layout
        phoneLayout.addEventListener('change', () => {
            closeCards();
            if (map) refreshList();
        });
    }

    // The cards that open on phones: the list's and the address's schools ("Trolig skolekrets for adressen")
    const CARD = '.school-card, .own-school';
    const ITEM = '.school-list__item, .own-school-item';
    const cardKey = card => card.dataset.key || card.dataset.show;
    let openWhere = null;

    // Phones: each card says that it opens the details under it
    function markExpandable(container) {
        if (!phoneLayout.matches) return;
        container.querySelectorAll(CARD).forEach(card => {
            const details = card.closest(ITEM).querySelector('.school-card__details');
            if (!details) return;
            card.setAttribute('aria-expanded', 'false');
            card.setAttribute('aria-controls', details.id);
        });
    }

    // Phones: the tapped card opens (the open one closes, wherever it is); the same card again closes it.
    // The tapped card keeps its place on the screen when a card above it closes.
    function toggleCard(card) {
        const item = card.closest(ITEM);
        const wasOpen = item.classList.contains('is-open');
        const before = card.getBoundingClientRect().top;
        closeCards();
        if (!wasOpen) openCard(item);
        window.scrollBy(0, card.getBoundingClientRect().top - before);
        if (!wasOpen) scrollIntoViewIfCut(item);
    }

    // "Vis på kartet" in an open card: the school's small map inside the card, and "Skjul kartet" again
    function toggleCardMap(button) {
        const item = button.closest(ITEM);
        const entry = entryFor(cardKey(item.querySelector(CARD)));
        if (miniKey === entry.key && mapSlot()) {
            closeMiniMap();
        } else {
            openMiniMap(item, entry);
            setMapButton(button, true);
        }
    }

    function openCard(item) {
        const card = item.querySelector(CARD);
        item.classList.add('is-open');
        item.querySelector('.school-card__details').hidden = false;
        card.setAttribute('aria-expanded', 'true');
        card.setAttribute('aria-current', 'true');
        openKey = cardKey(card);
        openWhere = el('kretsNote').contains(item) ? 'krets' : 'list';
    }

    // Close the open card and any small map (also one under an address's school)
    function closeCards() {
        closeMiniMap();
        document.querySelectorAll('.school-list__item.is-open, .own-school-item.is-open').forEach(item => {
            item.classList.remove('is-open');
            item.querySelector('.school-card__details').hidden = true;
            item.querySelector(CARD).setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.school-card[aria-current], .own-school[aria-current]').forEach(c => c.removeAttribute('aria-current'));
        openKey = null;
    }

    function setMapButton(button, open) {
        if (!button) return;
        button.setAttribute('aria-expanded', String(open));
        button.querySelector('span').textContent = t(open ? 'Skjul kartet' : 'Vis på kartet');
    }

    // Scroll only as far as needed to show the whole of `node` (smoothly, after the layout has settled)
    function scrollIntoViewIfCut(node) {
        requestAnimationFrame(() => {
            if (node.isConnected && node.getBoundingClientRect().bottom > window.innerHeight) {
                node.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }
        });
    }

    function mapSlot() {
        return document.getElementById('mapSlot');
    }

    function closeMiniMap() {
        if (miniMap) miniMap.remove();
        miniMap = null;
        miniKey = null;
        if (mapSlot()) mapSlot().remove();
        document.querySelectorAll('.school-card__map[aria-expanded="true"]').forEach(button => setMapButton(button, false));
    }

    // A small map with one school, right after `anchor` (an open list card, a krets card or the top of the
    // list). `popup`: open the school's popup too, where no card above shows the school (name search, krets)
    function openMiniMap(anchor, entry, { keepPlace = true, popup = false } = {}) {
        if (!anchor || !entry) return;
        const before = anchor.getBoundingClientRect().top;
        closeMiniMap();
        // An open card: the map opens inside it, above the row of buttons ("Skjul kartet" right under the map);
        // elsewhere right after `anchor`
        const actions = anchor.matches(ITEM) ? anchor.querySelector('.school-card__actions') : null;
        const slot = document.createElement(!actions && anchor.tagName === 'LI' ? 'li' : 'div');
        slot.id = 'mapSlot';
        slot.className = 'map-slot';
        slot.innerHTML = '<div class="mini-map"></div>';
        if (actions) actions.before(slot);
        else anchor.after(slot);
        if (keepPlace) window.scrollBy(0, anchor.getBoundingClientRect().top - before);

        const school = entry.school;
        // Zoom buttons at the bottom right, stacked above the attribution, so the open popup does not cover them
        // maxZoom: the marker cluster needs one, as on the big map. Without zoom animation: in this small map the
        // cluster did not redraw after an animated zoom, so "−" showed no other schools.
        miniMap = L.map(slot.firstElementChild, { scrollWheelZoom: false, zoomControl: false, maxZoom: 19, zoomAnimation: false })
            .setView([school.lat, school.lng], 15);
        L.control.zoom({ position: 'bottomright' }).addTo(miniMap);
        addBaseMap(miniMap);
        miniMap.attributionControl.setPrefix(false);
        // Popups sized to the small map (their frame adds about 50 px). The bottom padding keeps the marker
        // under a popup clear of the attribution; a school with two levels scrolls inside its popup.
        const popupOptions = {
            maxWidth: Math.min(320, slot.clientWidth - 74),
            maxHeight: Math.max(120, slot.clientHeight - 150),
            autoPanPaddingTopLeft: [12, 12],
            autoPanPaddingBottomRight: [12, 80]
        };
        // The school itself, above the others; tappable only where no card above shows it already
        const marker = L.marker([school.lat, school.lng], { ...entry.marker.options, keyboard: false, interactive: popup, zIndexOffset: 1000 })
            .addTo(miniMap);
        if (popup) marker.bindPopup(createPopupContent(entry.marker.schoolLevels || [school]), popupOptions).openPopup();
        // The other schools that pass the filters, grouped as on the big map, so zooming out shows what is around.
        // A tap opens the school's popup (made only then).
        const others = L.markerClusterGroup(cluster.options);
        others.addLayers(filtered.filter(other => other !== entry && other.school.lat != null).map(other =>
            L.marker([other.school.lat, other.school.lng], { ...other.marker.options, keyboard: false })
                .bindPopup(() => createPopupContent(other.marker.schoolLevels || [other.school]), popupOptions)));
        others.addTo(miniMap);
        miniKey = entry.key;

        if (keepPlace) scrollIntoViewIfCut(slot);
    }

    // ── One search for everything ───────────────────────────────────────
    // Schools and kommuner come from our own data as soon as two letters are typed; a postnummer and
    // addresses come from Kartverket a moment later. A school opens on the map, a kommune becomes the
    // kommune filter, and a postnummer or an address sorts the list from there.
    function bindAddressSearch() {
        const suggestion = el('addressSuggestion');
        const input = el('addressSearch');
        const list = el('addressResults');

        // Only react to what the user types; the combobox itself also fires
        // input events when it fills in or clears the selected value.
        input.addEventListener('input', event => {
            if (!event.isTrusted) return;
            showLocateError(null); // typing an address answers the "Din posisjon" message
            const query = input.value.trim();
            clearTimeout(addressTimer);
            if (query.length === 0) {
                unselectAddress(suggestion);
                list.innerHTML = locateOptionHtml();
                return;
            }
            if (query.length < 2) {
                list.innerHTML = '';
                return;
            }
            const local = localMatches(query);
            showSearchItems(query, list, local, [], false, query.length >= 3);
            if (query.length >= 3) addressTimer = setTimeout(() => searchAddress(query, list, local), 250);
        });

        // An empty field lists "Din posisjon" first, so it is there when the field gets focus
        const offerLocation = () => {
            if (!input.value.trim()) list.innerHTML = locateOptionHtml();
        };
        input.addEventListener('focus', offerLocation);
        input.addEventListener('pointerdown', offerLocation);

        // Like the React Suggestion: we own the selection and keep it as a
        // <data> element inside <ds-suggestion>, so the combobox shows its label.
        suggestion.addEventListener('comboboxbeforeselect', event => {
            event.preventDefault();
            const item = event.detail;
            if (!item) return;

            if (item.isConnected) {          // the current address was removed (clear button)
                unselectAddress(suggestion);
                return;
            }

            if (item.value === 'locate') {
                list.innerHTML = '';
                locate();
                return;
            }

            // Only real results carry an index; the empty-state option does not
            if (!/^\d+$/.test(item.value)) return;
            const result = searchItems[Number(item.value)];
            if (!result) return;
            list.innerHTML = '';
            if (result.kind === 'school') {
                // Straight to the school's page (the searched address, if any, stays)
                location.href = schoolUrl(result.school);
            } else if (result.kind === 'kommune') {
                chooseKommune(result.kommune);
            } else if (result.postnummer) placePostalArea(result).then(selectAddress);
            else selectAddress(result);
        });
    }

    // "Din posisjon" (like Entur and Vy): the first suggestion in the empty address field, and the target
    // icon at the end of the field. The browser asks for permission only when one of them is chosen. The
    // position is used like a searched address (nearest schools, skolekrets, walking time) and stays in the
    // browser: it is not sent to Kartverket or put in the address bar. The kommune for the skolekrets
    // pilot is found from the krets polygons themselves.
    const canLocate = () => 'geolocation' in navigator;

    function locateOptionHtml() {
        if (!canLocate()) return '';
        const label = escapeHtml(t('Din posisjon'));
        return `<u-option value="locate" label="${label}" class="locate-option search-option">${TARGET_ICON}<span class="search-option__text"><span class="search-result-name">${label}</span><span class="search-result-kommune">${t('Bruk posisjonen i stedet for en adresse')}</span></span></u-option>`;
    }

    function bindLocate() {
        el('locateButton').hidden = !canLocate();
        el('locateButton').addEventListener('click', locate);
        if (!canLocate()) return;

        // The same on the map, under the zoom buttons, as on most web maps
        const control = L.control({ position: 'topright' });
        control.onAdd = () => {
            const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control-locate');
            const label = escapeHtml(t('Bruk min posisjon'));
            bar.innerHTML = `<a href="#" role="button" aria-label="${label}" title="${label}">${TARGET_ICON}</a>`;
            L.DomEvent.disableClickPropagation(bar);
            L.DomEvent.on(bar.firstChild, 'click', event => {
                L.DomEvent.preventDefault(event);
                locate();
            });
            return bar;
        };
        control.addTo(map);
    }

    // Why "Din posisjon" did not work, as Designsystemet's validation message under the address field:
    // <ds-field> links it to the input and marks the input invalid while it is there
    function showLocateError(text) {
        if (text) positionError(); else showStartError('');
    }

    function locate() {
        showLocateError(null);
        navigator.geolocation.getCurrentPosition(async position => {
            const result = { label: t('Din posisjon'), lat: position.coords.latitude, lng: position.coords.longitude };
            const data = await loadKretsData();
            const krets = data && data.kretser.find(k => insideRings(result.lng, result.lat, k.rings));
            if (krets) result.kommune = krets.kommune;
            selectAddress(result);
            if (state.step === 'start') setStep('prio');
        }, error => {
            showLocateError(t(error.code === error.PERMISSION_DENIED
                ? 'Nettleseren har ikke lov til å bruke posisjonen din. Skriv inn en adresse i stedet.'
                : 'Fant ikke posisjonen din. Skriv inn en adresse i stedet.'));
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }

    // Show the address as the combobox's selected value and place it on the map
    function selectAddress(result) {
        showStartError('');
        const suggestion = el('addressSuggestion');
        suggestion.querySelectorAll(':scope > data').forEach(d => d.remove());
        const data = document.createElement('data');
        data.value = 'selected';
        data.textContent = result.label;
        suggestion.prepend(data);
        el('addressSearch').value = result.label;
        setAddress(result);
    }

    function clearAddressSearch() {
        el('addressSearch').value = '';
        el('addressResults').innerHTML = '';
        unselectAddress(el('addressSuggestion'));
    }

    function unselectAddress(suggestion) {
        suggestion.querySelectorAll(':scope > data').forEach(d => d.remove());
        clearAddress();
    }

    // Schools by name (a school with both levels is one hit) and kommuner, best matches first
    function localMatches(query) {
        const q = query.toLocaleLowerCase('nb');
        const seen = new Set();
        const schools = findSchools(query)
            .filter(school => {
                const place = `${school.name}|${school.kommune}`;
                if (seen.has(place) || !school.name.toLocaleLowerCase('nb').includes(q)) return false;
                seen.add(place);
                return true;
            })
            .slice(0, 5)
            .map(school => ({ kind: 'school', key: schoolKey(school), school }));
        const starts = name => (name.toLocaleLowerCase('nb').startsWith(q) ? 0 : 1);
        const kommuner = [...new Set(entries.map(e => e.school.kommune))]
            .filter(name => name.toLocaleLowerCase('nb').includes(q))
            .sort((a, b) => starts(a) - starts(b) || a.localeCompare(b, 'nb'))
            .slice(0, 3)
            .map(kommune => ({ kind: 'kommune', kommune }));
        return [...kommuner, ...schools];
    }

    // The suggestions in fixed groups (Figma 10.1, F1): «Din posisjon», then schools, addresses, and kommuner
    // and postnumre, each group with its own «Ingen treff», and a line on what a school and an address lead to.
    // Addresses and postnumre come from Kartverket a moment later («Søker …» until then).
    function showSearchItems(query, list, local, places = [], failed = false, pending = false) {
        const schools = local.filter(item => item.kind === 'school');
        const addresses = places.filter(item => !item.postnummer).slice(0, schools.length ? 3 : 5);
        const areas = [...local.filter(item => item.kind === 'kommune'), ...places.filter(item => item.postnummer)];
        searchItems = [...schools, ...addresses, ...areas];
        const row = (i, label, iconName, name, sub) => `<u-option value="${i}" label="${escapeHtml(label)}" class="search-option">
            ${iconName === 'pin' ? PIN_ICON.replace('<svg ', '<svg class="ds-icon" ') : icon(iconName)}
            <span class="search-option__text"><span class="search-result-name">${name}</span><span class="search-result-kommune">${sub}</span></span></u-option>`;
        const option = (item, i) => {
            if (item.kind === 'school') {
                const levels = schoolsData.filter(s => s.name === item.school.name && s.kommune === item.school.kommune);
                const type = levels.length > 1 ? t('Barne- og ungdomsskole (1.–10. trinn)') : t(SCHOOL_TYPE_LABEL[item.school.schoolType] || item.school.schoolType);
                return row(i, `${item.school.name}, ${item.school.kommune}`, 'hatSchool', highlightMatch(item.school.name, query), `${escapeHtml(item.school.kommune)} · ${type}`);
            }
            if (item.kind === 'kommune') return row(i, item.kommune, 'buildings3', highlightMatch(item.kommune, query), t('Kommune'));
            if (item.postnummer) return row(i, item.label, 'buildings3', escapeHtml(item.label), `${t('Postnummer')}${item.kommune ? ` · ${escapeHtml(item.kommune)}` : ''}`);
            const cut = item.label.lastIndexOf(', ');
            return row(i, item.label, 'pin', escapeHtml(cut > 0 ? item.label.slice(0, cut) : item.label), escapeHtml(cut > 0 ? item.label.slice(cut + 2) : ''));
        };
        let index = 0;
        const empty = text => `<p class="search-group__empty" aria-hidden="true">${t(text)}</p>`;
        const group = (title, items, waiting) => `<p class="search-group" aria-hidden="true">${t(title)}</p>${items.length
            ? items.map(item => option(item, index++)).join('')
            : empty(waiting ? 'Søker …' : failed ? 'Adressesøket er ikke tilgjengelig akkurat nå' : 'Ingen treff')}`;
        list.innerHTML = locateOptionHtml()
            + group('Skoler', schools, false)
            + group('Adresser', addresses, pending)
            + group('Kommuner og postnummer', areas, pending)
            + `<p class="search-group__hint" aria-hidden="true">${t('Skole: går rett til skolen')} · ${t('Adresse: viser skolekretsen og skolene i nærheten')}</p>`;
        openSuggestions(list, 'addressSearch');
    }

    // A kommune from the search works as the kommune filter: the map shows the whole kommune
    function chooseKommune(kommune) {
        state.kommune = kommune;
        el('kommuneFilter').value = kommune;
        clearAddressSearch();
        if (state.step !== 'results') showStep('results');
        applyFilters();
        fitToFiltered();
        if (history.state && history.state.step !== 'results') history.pushState({ ...history.state, step: 'results' }, '', location.href);
        renderBand();
        window.scrollTo(0, 0);
    }

    async function searchAddress(query, list, local) {
        if (addressAbort) addressAbort.abort();
        addressAbort = new AbortController();
        try {
            const places = await searchPlaces(query, { signal: addressAbort.signal });
            if (el('addressSearch').value.trim() === query) showSearchItems(query, list, local, places);
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Address search failed:', error);
            if (el('addressSearch').value.trim() === query) showSearchItems(query, list, local, [], true);
        }
    }

    function drawPostalArea(result) {
        if (postalLayer) postalLayer.remove();
        postalLayer = null;
        if (!result.area || !result.area.length) return;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        postalLayer = L.polygon(result.area.map(polygon => polygon.map(ring => ring.map(([lng, lat]) => [lat, lng]))), {
            color, weight: 2, fillOpacity: 0.06, interactive: false,
            attribution: POSTAL_AREA_ATTRIBUTION
        }).addTo(map);
    }

    const inPostalArea = (address, school) => Boolean(address.area) && address.area.some(polygon => insideRings(school.lng, school.lat, polygon));

    function setAddress(result) {
        announceList = true;
        state.address = result;
        // A postnummer is an area, not a place to walk from: the school page gets no walking time from it
        rememberAddress(result.postnummer ? null : result);
        state.sort = 'distance';
        showSort('distance');

        if (addressMarker) addressMarker.remove();
        addressMarker = L.marker([result.lat, result.lng], {
            icon: L.divIcon({
                html: `<span class="address-marker">${PIN_ICON}</span>`,
                className: 'address-marker-icon',
                iconSize: [36, 36],
                iconAnchor: [18, 34]
            }),
            keyboard: false,
            zIndexOffset: 1000
        }).bindTooltip(escapeHtml(result.label)).addTo(map);

        clearKrets();
        if (result.postnummer) {
            // Back from a school page the area is loaded again; the view is already the saved one
            const ready = result.area !== undefined ? Promise.resolve(result) : placePostalArea({ ...result }).then(loaded => {
                result.area = loaded.area;
                return result;
            });
            ready.then(() => {
                if (state.address !== result) return;
                drawPostalArea(result);
                if (postalLayer) map.fitBounds(postalLayer.getBounds(), { maxZoom: 15, padding: [16, 16] });
                refreshList();
            });
            map.setView([result.lat, result.lng], 14);
            writeUrlState();
            return;
        }
        map.setView([result.lat, result.lng], 14);
        writeUrlState();

        // Pilot: exact skolekrets where the kommune publishes open data
        findKretser(result).then(found => {
            if (state.address !== result || !found) return;
            state.krets = found;
            drawKretser(found.hits);
            announceList = true;
            refreshList();
        });
    }

    function clearAddress() {
        if (!state.address) return;
        announceList = true;
        state.address = null;
        rememberAddress(null);
        clearKrets();
        if (postalLayer) {
            postalLayer.remove();
            postalLayer = null;
        }
        if (addressMarker) {
            addressMarker.remove();
            addressMarker = null;
        }
        renderList();
        writeUrlState();
    }

    // ── Skolekrets pilot (Halden, Stavanger) ──────────────────────────────
    function findKretser(result) {
        // Every kommune in skolekretser.json (see skolekretser.py) is looked up; others get the note
        return lookupKrets(result);
    }

    function isKretsSchool(school) {
        return Boolean(state.krets && state.krets.hits.some(k => k.school === school.name && k.level === school.schoolType
            && sameKommune(k.kommune, school.kommune)));
    }

    function drawKretser(hits) {
        if (!hits.length) return;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        kretsLayer = L.layerGroup(hits.map(k => L.polygon(
            k.rings.map(ring => ring.map(([lng, lat]) => [lat, lng])),
            { color, weight: 2, dashArray: k.level === 'barneskole' ? '6 4' : '2 6', fillOpacity: k.level === 'barneskole' ? 0.06 : 0, interactive: false }
        ))).addTo(map);
    }

    function clearKrets() {
        state.krets = null;
        if (kretsLayer) {
            kretsLayer.remove();
            kretsLayer = null;
        }
    }

    // The small map in the side column shows the same schools as the list on the map («Vis i kart»)
    function renderSideMap(start) {
        el('sideMapText').textContent = start
            ? t('Alle {count} grunnskolene i Norge på kart. Søk først for å se skolene nær dere.', { count: countFormat.format(entries.length) })
            : t('Kartet viser de samme skolene som listen, og grensen for skolekretsen.');
    }

    // Distance is not the same as skolekrets: say so whenever the list is sorted from an address.
    // Where a kommune publishes open skolekrets data, show the exact krets as a pilot.
    function renderKretsNote() {
        const note = el('kretsNote');
        // Not on the saved schools page, which is only the list and the map. Not for a postnummer either:
        // it spans several kretser, so neither the krets nor the nearest schools from its middle would be right
        note.hidden = !state.address || state.savedOnly || Boolean(state.address.postnummer);
        kretsEntries = new Set();
        if (note.hidden) return;
        const kommune = state.address.kommune;
        const check = `<a class="ds-link" href="${I18N.href('om-skolekrets')}">${kommune
            ? t('Sjekk skolekretsen hos {kommune} kommune', { kommune: escapeHtml(kommune) })
            : t('Sjekk skolekretsen hos kommunen')}</a>.`;
        const krets = state.krets;
        const own = krets ? krets.hits
            .map(k => {
                const entry = k.school && entries.find(e => e.levels.some(l => l.name === k.school && sameKommune(l.kommune, k.kommune) && l.schoolType === k.level));
                return { krets: k, entry, level: entry && entry.levels.find(l => l.schoolType === k.level) };
            })
            .filter(hit => (hit.entry || hit.krets.school) && state.types.has(hit.krets.level)) : [];

        // No skolekrets data for this address (Oslo and most kommuner): show the nearest public
        // barneskole and ungdomsskole in the same cards, clearly named as the nearest, not the krets
        if (!own.length) {
            const out = (href, label) => `<a class="ds-link" href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener">${t(label)}${icon('externalLink')}</a>`;
            // In the info popover: where to look up the real krets, and which kommuner we can show it for
            const osloLookup = kommune === 'Oslo'
                ? `<p class="ds-paragraph" data-size="sm">${t('Slå opp skolekretsen hos Oslo kommune:')}
                       ${out('https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/', 'Finn barneskole')} ·
                       ${out('https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-ungdomsskole/', 'Finn ungdomsskole')}</p>`
                : `<p class="ds-paragraph" data-size="sm">${check}</p>`;
            const where = `<p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${I18N.href('om-skolekrets')}#pilot">${t('Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra')}</a></p>`;
            const ref = L.latLng(state.address.lat, state.address.lng);
            const nearest = ['barneskole', 'ungdomsskole'].map(type => entries
                .filter(e => e.levels.some(l => l.schoolType === type) && e.school.eierform !== 'privat' && e.school.lat && e.school.lng)
                .map(e => ({ entry: e, level: e.levels.find(l => l.schoolType === type), metres: ref.distanceTo([e.school.lat, e.school.lng]) }))
                .sort((a, b) => a.metres - b.metres)[0])
                .filter(hit => hit && hit.metres <= 20000 && state.types.has(hit.level.schoolType))
                .map(hit => ({ krets: { level: hit.level.schoolType, name: null }, entry: hit.entry, level: hit.level }));
            if (!nearest.length) {
                note.innerHTML = `<div class="ds-alert results-note" data-color="info" data-size="sm">
                    <p class="ds-paragraph" data-size="sm">${t('Listen viser skolene nærmest adressen. Det er ikke sikkert at dette er skolen barnet sogner til. Kommunen bestemmer skolekretsen.')}</p>
                    ${osloLookup}${where}</div>`;
                return;
            }
            // A6 «Hvilken skole hører adressen til?»: where the kommune has not published the krets, we say we do not
            // know, name the nearest school and send them to the kommune and to the rights of the child. The schools
            // themselves stay in the list below, sorted as chosen (not pulled out into a block of their own).
            const names = [...new Set(nearest.map(hit => hit.entry.school.name))].map(escapeHtml);
            const who = kommune ? t('{kommune} kommune', { kommune: escapeHtml(kommune) }) : t('kommunen');
            const lookup = kommune === 'Oslo'
                ? out('https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/', 'Slå opp skolekrets hos Oslo kommune')
                : check.replace(/\.$/, '');
            note.innerHTML = `<div class="saved-note saved-note--info results-message" role="note">${FLOW_ICON.info}<div>
                    <strong>${t('Hvilken skole hører adressen til?')}</strong>
                    <p>${t('Vi vet ikke sikkert. {school} er nærmest, men det er {who} som bestemmer skolekretsen. Barn som trenger tilrettelegging har som hovedregel rett til å gå på nærskolen.', { school: names.join(` ${t('og')} `), who })}</p>
                    <p class="saved-note__links">${lookup}<a class="ds-link" href="${I18N.href('barn-med-sarskilte-behov')}">${t('Skoleplass for barn med særskilte behov')}</a></p>
                    <p class="results-message__short">${t('Kommunen bestemmer skolekretsen.')} ${lookup}</p>
                </div></div>`;
            return;
        }

        // A6 «Hvilken skole hører adressen til?» also where the kommune publishes the krets (a pilot): the message names
        // the krets school from that data and says who decides; the schools stay in the list below, sorted as chosen
        const ownNames = [...new Set(own.map(hit => (hit.entry ? hit.entry.school.name : hit.krets.school)))].map(escapeHtml);
        const decider = kommune ? t('{kommune} kommune', { kommune: escapeHtml(kommune) }) : t('kommunen');
        const lookupLink = kommune === 'Oslo'
            ? `<a class="ds-link" href="https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/" target="_blank" rel="noopener">${t('Slå opp skolekrets hos Oslo kommune')}${icon('externalLink')}</a>`
            : check.replace(/\.$/, '');
        note.innerHTML = `<div class="saved-note saved-note--info results-message" role="note">${FLOW_ICON.info}<div>
                <strong>${t('Hvilken skole hører adressen til?')}</strong>
                <p>${t('Ifølge åpne data (pilot) hører adressen til {school}. Det kan avvike fra gjeldende grenser, og det er {who} som bestemmer skolekretsen. Barn som trenger tilrettelegging har som hovedregel rett til å gå på nærskolen.', { school: ownNames.join(` ${t('og')} `), who: decider })}</p>
                <p class="saved-note__links">${lookupLink}<a class="ds-link" href="${I18N.href('barn-med-sarskilte-behov')}">${t('Skoleplass for barn med særskilte behov')}</a></p>
                <p class="results-message__short">${t('Kommunen bestemmer skolekretsen.')} ${lookupLink}</p>
            </div></div>`;
        return;

        function renderOwn() {
            note.innerHTML = `
            <section class="own-schools" aria-labelledby="ownHeading">
                <div class="own-schools__head"><h2 class="own-schools__title" id="ownHeading">${t('Skolekrets for adressen')}</h2>
                    <span class="own-schools__source">${t('Kilde:')} ${escapeHtml(shortSource())}</span>
                    <button type="button" class="ds-button filter-help" data-variant="tertiary" data-size="sm" data-icon="true"
                            popovertarget="ownInfo" aria-label="${t('Om skolekretsdataene')}">${icon('questionmarkCircle')}</button></div>
                <div class="ds-popover own-schools__info" popover id="ownInfo" data-placement="bottom-start">
                    <p class="ds-paragraph" data-size="sm">${t('Dette er en pilot og kan avvike fra kommunens gjeldende grenser.')} ${escapeHtml(t(krets.info.caveat))}</p>
                    <p class="ds-paragraph" data-size="sm">${t('Kilde:')} <a class="ds-link" href="${escapeHtml(safeUrl(krets.info.sourceUrl))}" target="_blank" rel="noopener">${escapeHtml(t(krets.info.source))}</a>.</p>
                    <p class="ds-paragraph" data-size="sm">${check}</p>
                    <p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${I18N.href('om-skolekrets')}#pilot">${t('Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra')}</a></p>
                </div>
                ${own.map(card).join('<hr class="own-schools__rule" />')}
                <div class="own-schools__links">${mapLinkHtml(own)}${finnHtml(own)}</div>
            </section>`;
        }

        // The source in short beside the heading, as in Figma 10.1 F2: «Oslo kommune (Plan- og bygningsetaten)», or
        // just «Halden kommune» when the kommune itself publishes the data; the full source is in the ⓘ popover
        function shortSource() {
            const kommune = `${krets.kommune} kommune`;
            const publisher = krets.info.source.split(',')[0].trim();
            return publisher === kommune ? kommune : `${kommune} (${publisher})`;
        }

        // The krets boundaries on the map page, centred on the krets school (never on the address itself,
        // which must not end up in a link)
        function mapLinkHtml(hits) {
            const school = (hits.find(h => h.level) || {}).level;
            if (!school || !school.lat || !school.lng) return '';
            const view = `${school.lat.toFixed(5)},${school.lng.toFixed(5)},14`;
            return `<a class="ds-link own-schools__map" href="${escapeHtml(I18N.href(`kart?lag=skolekretser#${view}`))}">${t('Se kretsgrensen på kartet')} →</a>`;
        }

        // Housing search on Finn.no for each postnummer in the barneskolekrets (or the krets found)
        function finnHtml(hits) {
            const krets = (hits.find(h => h.krets.level === 'barneskole') || hits[0] || {}).krets;
            const numbers = (krets && krets.postnummer) || [];
            if (!numbers.length) return '';
            return `<p class="ds-paragraph own-schools__finn" data-size="sm">${t('Boligsøk på Finn.no i kretsen:')}
                ${numbers.map(n => `<a class="ds-link" href="https://www.finn.no/realestate/homes/search.html?q=${encodeURIComponent(n)}" target="_blank" rel="noopener"
                    aria-label="${escapeHtml(t('Boligsøk på Finn.no for postnummer {n}', { n }))}">${escapeHtml(n)}</a>`).join(' · ')}</p>`;
        }

        // Oslo: a barneskole whose pupils go to two ungdomsskoler, depending on the address
        function splitNote(k) {
            if (!k.split || !k.split.length) return '';
            return k.split.map(sp => `<span class="own-school__split-line">${t('Fra {school} går noen elever til {others}, avhengig av adressen.', {
                    school: escapeHtml(sp.school), others: sp.others.map(escapeHtml).join(', ') })}
                    ${sp.map ? `<a class="ds-link" href="${escapeHtml(safeUrl(sp.map))}" target="_blank" rel="noopener">${t('Se kretskartet')}</a>` : ''}</span>`).join('');
        }

        // A card for one school: the krets name only when it comes from skolekrets data
        function card({ krets: k, entry, level }, index) {
            // The krets school is not in our data (too small to have published results): name only
            if (!entry) return `
                <div class="own-school-item">
                    <p class="own-school__level">${t(LEVEL_LABEL[k.level] || k.level)}</p>
                    <div class="own-school__line">
                        <span class="own-school__name own-school__name--plain">${escapeHtml(k.school)}</span>
                        <span class="own-school__meta">${t('({name} skolekrets)', { name: escapeHtml(k.name) }).replace(/^\(|\)$/g, '')}</span>
                    </div>
                    <p class="ds-paragraph own-school__split" data-size="xs">${t('Skolen har ingen offentlige resultater og er derfor ikke med i lista.')} ${splitNote(k)}</p>
                </div>`;
            const school = level || entry.school;
            const key = schoolKey(school);
            const meta = [k.name ? t('({name} skolekrets)', { name: escapeHtml(k.name) }).replace(/^\(|\)$/g, '') : null,
                          distanceLabel(school)].filter(Boolean);
            // The whole name shows the school on the map (phones: opens the card under it), as in the list
            return `
                <div class="own-school-item">
                    <p class="own-school__level">${t(LEVEL_LABEL[school.schoolType] || school.schoolType)}</p>
                    <div class="own-school__line">
                        <button type="button" class="own-school own-school__name" data-show="${escapeHtml(key)}">${escapeHtml(school.name)}</button>
                        <span class="own-school__meta">${meta.join(' · ')}</span>
                        ${saveButtonHtml(key, 'own-school__save')}
                    </div>
                    ${tilesHtml([school])}
                    ${moreLinkHtml(school, 'own-school__more')}
                    ${cardDetails({ levels: [school], school }, `ownDetails${index}`)}
                    ${k.split ? `<p class="ds-paragraph own-school__split" data-size="xs">${splitNote(k)}</p>` : ''}
                </div>`;
        }
    }

    // The cards for the address's schools: the bookmark ("Lagre til senere"), and the card itself,
    // which shows the school on the map and turns blue as the one picked
    function bindOwnSchoolActions() {
        el('kretsNote').addEventListener('click', event => {
            const save = event.target.closest('button[data-save]');
            if (save) {
                updateSaveButton(save, toggleSaved(save.dataset.save));
                refreshList();
                refocusSave(save.dataset.save);
                return;
            }
            const mapButton = event.target.closest('.school-card__map');
            if (mapButton) {
                toggleCardMap(mapButton);
                return;
            }
            const card = event.target.closest('button[data-show]');
            if (!card) return;
            // Phones: the card opens under itself, as in the list
            if (phoneLayout.matches) {
                toggleCard(card);
                return;
            }
            document.querySelectorAll('.own-school[aria-current], .school-card[aria-current]').forEach(c => c.removeAttribute('aria-current'));
            card.setAttribute('aria-current', 'true');
            showSchool(card.dataset.show, true);
        });
    }

    return { init, showSchool };
})();

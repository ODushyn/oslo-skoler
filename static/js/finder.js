// Finder: filters, address search and the school list next to the map.
// main.js creates the markers and calls Finder.init(map, markerCluster, entries).

const Finder = (() => {
    const PAGE_SIZE = 10;
    const ADDRESS_API = 'https://ws.geonorge.no/adresser/v1/sok';
    const ALL_TYPES = ['barneskole', 'ungdomsskole'];
    const ALL_OWNERS = ['offentlig', 'privat'];
    const ALL_SCORES = ['very-low', 'low', 'high', 'very-high', 'none'];
    // Trivsel bands (scores have one decimal): under 3,8 · 3,8–3,9 · 4,0–4,1 · 4,2–4,3 · 4,4 and over
    const ALL_TRIVSEL = ['u38', '38', '40', '42', '44', 'none'];
    // Mobbing bands, share of pupils bullied: under 5 % · 5–9,9 % · 10–14,9 % · 15 % and over
    const ALL_MOBBING = ['u5', '5', '10', '15', 'none'];
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

    const state = {
        types: new Set(ALL_TYPES),
        owners: new Set(ALL_OWNERS),
        scores: new Set(ALL_SCORES),
        kommune: '',
        profile: '',
        trivsels: new Set(ALL_TRIVSEL),
        mobbings: new Set(ALL_MOBBING),
        sort: 'distance',
        address: null, // { lat, lng, label, kommune }
        krets: null,   // pilot: { info, hits } when the address is in a kommune with open skolekrets data
        school: null,  // key of the school whose popup is open
        mode: 'address',
        savedOnly: false,   // the list shows the saved schools ("Lagre til senere") instead of the map view
        shown: PAGE_SIZE
    };

    let map, cluster, entries = [], filtered = [];
    let addressMarker = null;
    let keepList = false;   // true after a school was picked from the list, until the user moves the map
    let listBounds = null;  // the map area the list was last built from
    let addressResults = [];
    let addressAbort = null;
    let addressTimer = null;
    let kretsData = null;   // static/js/skolekretser.json, loaded on first use
    let kretsLayer = null;


    const el = id => document.getElementById(id);
    const numberFormat = new Intl.NumberFormat(I18N.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const countFormat = new Intl.NumberFormat(I18N.locale);

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
        bindAddressSearch();
        bindLocate();
        bindPhoneMap();
        bindSearchMode();

        el('showMore').addEventListener('click', () => {
            state.shown += PAGE_SIZE;
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

        applyFilters();

        // Remember the whole view when leaving the page, so "Tilbake" on a school page returns to it
        window.addEventListener('pagehide', saveView);

        const sharedSchool = fromUrl.school && entryFor(fromUrl.school);
        const savedView = returningView();
        if (savedView) {
            restoreView(savedView);
        } else if (sharedSchool) {
            // A shared link: go straight to the school, without first animating to all of Norway
            if (!passes(sharedSchool)) resetFilters();
            openSchoolAt(sharedSchool);
        } else if (state.savedOnly) {
            setSavedOnly(true);
        } else if (state.kommune) {
            fitToFiltered();
        } else {
            // Start with mainland Norway in view (all schools would include Svalbard
            // and zoom out too far); the map column is narrower than the window.
            map.fitBounds([[57.9, 4.6], [71.2, 31.2]], { padding: [16, 16], animate: false });
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
            address: state.address ? { label: state.address.label, lat: state.address.lat, lng: state.address.lng, kommune: state.address.kommune } : null,
            schoolQuery: el('schoolSearch').value,
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
        if (view.schoolQuery) el('schoolSearch').value = view.schoolQuery;
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
        if (params.has('eier')) state.owners = new Set(list('eier', ALL_OWNERS));
        if (params.has('resultat')) state.scores = new Set(list('resultat', ALL_SCORES));

        const kommune = params.get('kommune');
        if (kommune && entries.some(e => e.school.kommune === kommune)) state.kommune = kommune;
        const profile = params.get('profil');
        if (profile && PROFILE_LABEL[profile]) state.profile = profile;
        const sort = params.get('sort');
        if (['distance', 'name', 'avg-desc', 'avg-asc', 'triv-desc', 'triv-asc', 'mob-asc', 'mob-desc'].includes(sort)) state.sort = sort;
        if (params.has('mobbing')) state.mobbings = new Set(list('mobbing', ALL_MOBBING));
        const trivsel = params.get('trivsel');
        // Older shared links used a minimum ("4.2" = 4,2 and over)
        const legacy = { '4.0': ['40', '42', '44'], '4.2': ['42', '44'], '4.4': ['44'] };
        if (legacy[trivsel]) state.trivsels = new Set(legacy[trivsel]);
        else if (params.has('trivsel')) state.trivsels = new Set(list('trivsel', ALL_TRIVSEL));
        if (params.get('sok') === 'skole') state.mode = 'school';
        if (params.get('lagrede') === '1') state.savedOnly = true;

        return { school: params.get('skole') };
    }

    function writeUrlState() {
        const params = new URLSearchParams();
        const list = (set, all) => all.filter(v => set.has(v)).join(',');

        if (state.types.size !== ALL_TYPES.length) params.set('type', list(state.types, ALL_TYPES));
        if (state.owners.size !== ALL_OWNERS.length) params.set('eier', list(state.owners, ALL_OWNERS));
        if (state.scores.size !== ALL_SCORES.length) params.set('resultat', list(state.scores, ALL_SCORES));
        if (state.kommune) params.set('kommune', state.kommune);
        if (state.profile) params.set('profil', state.profile);
        if (state.trivsels.size !== ALL_TRIVSEL.length) params.set('trivsel', list(state.trivsels, ALL_TRIVSEL));
        if (state.mobbings.size !== ALL_MOBBING.length) params.set('mobbing', list(state.mobbings, ALL_MOBBING));
        if (state.sort !== 'distance') params.set('sort', state.sort);
        if (state.mode === 'school') params.set('sok', 'skole');
        if (state.savedOnly) params.set('lagrede', '1');
        if (state.school) params.set('skole', state.school);
        if (I18N.translated) params.set('lang', I18N.lang);   // a shared link keeps the language

        const query = params.toString();
        history.replaceState(null, '', query ? `?${query}` : location.pathname);
    }

    // Put the controls in line with the state (after reading the URL or resetting)
    function syncControls() {
        document.querySelectorAll('input[name="type"]').forEach(i => { i.checked = state.types.has(i.value); });
        document.querySelectorAll('input[name="owner"]').forEach(i => { i.checked = state.owners.has(i.value); });
        document.querySelectorAll('input[name="score"]').forEach(i => { i.checked = state.scores.has(i.value); });
        el('kommuneFilter').value = state.kommune;
        document.querySelectorAll('input[name="profile"]').forEach(i => { i.checked = i.value === state.profile; });
        document.querySelectorAll('input[name="trivsel"]').forEach(i => { i.checked = state.trivsels.has(i.value); });
        document.querySelectorAll('input[name="mobbing"]').forEach(i => { i.checked = state.mobbings.has(i.value); });
        showSort(state.sort);
        document.querySelectorAll('input[name="searchMode"]').forEach(i => { i.checked = i.value === state.mode; });
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
        document.querySelectorAll('input[name="type"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.types, input.value, input.checked);
                applyFilters();
            });
        });
        document.querySelectorAll('input[name="owner"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.owners, input.value, input.checked);
                applyFilters();
            });
        });
        // The result choices are both in the "Nasjonale prøver" row and in the filter panel; keep them in step
        document.querySelectorAll('input[name="score"]').forEach(input => {
            input.addEventListener('change', () => {
                toggle(state.scores, input.value, input.checked);
                document.querySelectorAll('input[name="score"]').forEach(i => { i.checked = state.scores.has(i.value); });
                applyFilters();
            });
        });
        el('scoreToggle').addEventListener('click', () => {
            const open = el('scoreToggle').getAttribute('aria-expanded') !== 'true';
            el('scoreToggle').setAttribute('aria-expanded', String(open));
            el('scoreBar').hidden = !open;
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
            renderList();
            writeUrlState();
        });
        el('resetFilters').addEventListener('click', resetFilters);

        // Filters slide in from the right (a modal Designsystemet Dialog). The list and map update as you
        // choose; "Vis N skoler", the close button, Esc or a click outside the panel closes it.
        const dialog = el('filterPanel');
        el('filterToggle').addEventListener('click', () => setFilterPanel(true));
        el('filterClose').addEventListener('click', () => setFilterPanel(false));
        el('filterDone').addEventListener('click', () => setFilterPanel(false));
        el('filterResetDialog').addEventListener('click', resetFilters);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) setFilterPanel(false); // the backdrop
        });
        dialog.addEventListener('close', () => {
            el('filterToggle').setAttribute('aria-expanded', 'false');
            el('filterToggle').focus();
        });
    }

    function setFilterPanel(open) {
        const dialog = el('filterPanel');
        el('filterToggle').setAttribute('aria-expanded', String(open));
        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
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
        return (state.types.size !== ALL_TYPES.length ? 1 : 0)
            + (state.owners.size !== ALL_OWNERS.length ? 1 : 0)
            + (state.scores.size !== ALL_SCORES.length ? 1 : 0)
            + (state.kommune ? 1 : 0)
            + (state.profile ? 1 : 0)
            + (state.trivsels.size !== ALL_TRIVSEL.length ? 1 : 0)
            + (state.mobbings.size !== ALL_MOBBING.length ? 1 : 0);
    }

    function updateFilterCount() {
        const count = activeFilterCount();
        const badge = el('filterCount');
        badge.hidden = count === 0;
        badge.dataset.count = String(count);
        badge.setAttribute('aria-label', count === 1 ? t('1 aktivt filter') : t('{count} aktive filtre', { count }));
        // "Nullstill" next to the Filter button and in the panel; only usable when a filter is on
        el('resetFilters').disabled = count === 0;
        // The "Nasjonale prøver" button is marked while some results are left out
        el('scoreToggle').toggleAttribute('data-active', state.scores.size !== ALL_SCORES.length);
        el('filterResetDialog').disabled = count === 0;
        updateSummaries();
    }

    // The dropdown buttons say what is chosen: "Alle", the one option, or "2 av 5"
    function updateSummaries() {
        document.querySelectorAll('[data-summary]').forEach(summary => {
            const inputs = [...document.querySelectorAll(`input[name="${summary.dataset.summary}"]`)];
            const checked = inputs.filter(i => i.checked);
            const label = input => document.querySelector(`label[for="${input.id}"]`).textContent.trim();
            summary.textContent = checked.length === inputs.length ? t('Alle')
                : checked.length === 0 ? t('Ingen')
                : checked.length === 1 ? label(checked[0])
                : t('{current} av {total}', { current: checked.length, total: inputs.length });
            summary.closest('.filter-dd__button').toggleAttribute('data-active', checked.length !== inputs.length);
        });
    }

    function toggle(set, value, on) {
        if (on) set.add(value); else set.delete(value);
    }

    function passes(entry) {
        const school = entry.school;
        const shown = levelsShown(entry);
        // With both owner types selected, schools without a register match are included too
        const ownerOk = state.owners.size === ALL_OWNERS.length || state.owners.has(school.eierform);
        // A school with both levels passes when one of the levels the type filter shows does
        return shown.length > 0
            && ownerOk
            && shown.some(level => state.scores.has(scoreCategory(level.color)))
            && (!state.kommune || school.kommune === state.kommune)
            && (!state.profile || school.profil === state.profile)
            && shown.some(level => state.trivsels.has(trivselBand(level)))
            && shown.some(level => state.mobbings.has(mobbingBand(level)));
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

    function filtersActive() {
        return activeFilterCount() > 0;
    }

    function applyFilters() {
        filtered = entries.filter(passes);
        cluster.clearLayers();
        cluster.addLayers(filtered.map(e => e.marker));
        state.shown = PAGE_SIZE;
        updateFilterCount();
        // The panel's main button says how many schools the filters leave, in all of Norway
        el('filterDone').textContent = filtered.length === 1 ? t('Vis 1 skole')
            : t('Vis {count} skoler', { count: countFormat.format(filtered.length) });
        renderList();
        writeUrlState();
    }

    function resetFilters() {
        state.types = new Set(ALL_TYPES);
        state.owners = new Set(ALL_OWNERS);
        state.scores = new Set(ALL_SCORES);
        state.kommune = '';
        state.profile = '';
        state.trivsels = new Set(ALL_TRIVSEL);
        state.mobbings = new Set(ALL_MOBBING);
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

        if (state.sort === 'name') return list.sort(byName);
        if (state.sort === 'avg-desc') return list.sort(byValue(avg, -1));
        if (state.sort === 'avg-asc') return list.sort(byValue(avg, 1));
        if (state.sort === 'triv-desc') return list.sort(byValue(triv, -1));
        if (state.sort === 'triv-asc') return list.sort(byValue(triv, 1));
        const mob = mobbingOf;
        if (state.sort === 'mob-asc') return list.sort(byValue(mob, 1));
        if (state.sort === 'mob-desc') return list.sort(byValue(mob, -1));

        list.forEach(e => { e.distance = ref.distanceTo([e.school.lat, e.school.lng]); });
        // The address's own school is shown in its own card above; the list stays in distance order
        return list.sort((a, b) => a.distance - b.distance);
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
            if (state.savedOnly) refreshList();
        });
    }

    function setSavedOnly(on) {
        state.savedOnly = on;
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
        document.querySelector('.search-panel').hidden = state.savedOnly;
        document.querySelector('.results-sort').hidden = state.savedOnly;
        el('savedToggle').href = I18N.href('./');
        el('savedToggle').innerHTML = `${icon('chevronLeft')}<span>${t('Vis alle skoler')}</span>`;
        document.querySelectorAll('.saved-link').forEach(link => {
            if (state.savedOnly) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
    }

    // `bounds`: the area the list is built from (by default the visible map)
    function renderList(bounds = map.getBounds()) {
        // Any other change (filters, address, sorting) shows the schools in the map view again
        keepList = false;
        listBounds = bounds;
        // The saved schools: all of them, wherever they are and whatever the filters say
        const saved = savedSchools();
        const inView = state.savedOnly
            ? sortEntries(entries.filter(e => e.keys.some(k => saved.has(k))))
            : sortEntries(filtered.filter(e => bounds.contains([e.school.lat, e.school.lng])));
        const visible = inView.slice(0, state.shown);
        const ref = referencePoint();

        const total = inView.length;
        const noun = t(total === 1 ? 'skole' : 'skoler');
        el('resultsTitle').textContent = state.savedOnly
            ? t('Lagrede skoler ({count})', { count: total })
            : total === 0
                ? t('Ingen skoler')
                : state.address
                    // The address is in the search field, so the heading only says these are the nearby schools
                    ? (visible.length < total
                        ? t('Skoler i nærheten ({shown} av {total})', { shown: visible.length, total: countFormat.format(total) })
                        : t('Skoler i nærheten ({count})', { count: countFormat.format(total) }))
                    : (visible.length < total
                        ? t('Viser {shown} av {total} {noun}', { shown: visible.length, total: countFormat.format(total), noun })
                        : t('{total} {noun}', { total: countFormat.format(total), noun }));

        // With an address, "Skoler i nærheten (12)" is set like "Trolig skolekrets for adressen" above it
        el('resultsTitle').classList.toggle('results-title--nearby', Boolean(state.address) && !state.savedOnly && total > 0);
        const context = [];
        if (filtersActive()) context.push(t('filtrert'));
        const contextText = context.join(' · ');
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

        // Phones: an open card (and its small map), in the list or among the address's schools, stays open
        // when they are drawn again
        const reopen = phoneLayout.matches && openKey ? { key: openKey, where: openWhere } : null;
        const inCards = slot => slot && (el('schoolList').contains(slot) || el('kretsNote').contains(slot));
        const reopenMap = Boolean(reopen) && miniKey === openKey && inCards(mapSlot());
        if (inCards(mapSlot())) closeMiniMap();
        openKey = null;
        renderKretsNote();
        el('schoolList').innerHTML = visible.map((e, i) => schoolCard(e, ref, i)).join('');
        // The first list replaces the loading placeholders
        el('schoolList').removeAttribute('aria-busy');
        if (el('listLoading')) el('listLoading').remove();
        el('schoolList').querySelectorAll('.school-card__save').forEach(button => {
            button.addEventListener('click', () => {
                updateSaveButton(button, toggleSaved(button.dataset.save));
                if (state.savedOnly) refreshList();
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
    }

    function schoolCard(entry, ref, index) {
        const school = entry.school;
        const shown = levelsShown(entry);
        const combined = entry.levels.length > 1;
        const meta = [escapeHtml(school.kommune), combined ? t('Barne- og ungdomsskole (1.–10. trinn)') : (SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType)];
        if (school.eierform) {
            const label = school.eierform === 'privat' && school.profil && school.profil !== 'annen'
                ? t('Privat, {profile}', { profile: t(PROFILE_LABEL[school.profil]).toLowerCase() })
                : t(OWNER_LABEL[school.eierform]);
            meta.push(`<span class="owner-meta">${ownerIcon(school.eierform)}${label}</span>`);
        }
        if (state.address) meta.push(distanceLabel(school));
        const isOwn = entry.levels.some(isKretsSchool);
        // The bookmark shows saved when either level's page was saved
        const saveKey = entry.keys.find(isSaved) || entry.key;
        const kretsTag = isOwn
            ? `<span class="school-card__krets"><span>${t('Skolen for adressen')}</span></span>`
            : '';

        // The bookmark ("Lagre til senere") sits in the top right corner, next to the card button
        // (a button inside a button is not allowed), and can be pressed again to remove the school
        return `
            <li class="school-list__item">
                <button type="button" class="ds-card school-card${isOwn ? ' school-card--own' : ''}" data-variant="${isOwn ? 'tinted' : 'default'}"${isOwn ? ' data-color="brand1"' : ''} data-key="${escapeHtml(entry.key)}">
                    <span class="school-card__badge${combined ? ' school-card__badge--pair' : ''}" aria-hidden="true">${entry.levels.map(level =>
                        `<span class="school-marker score-${scoreCategory(level.color)}">${schoolTypeIcon(level.schoolType)}</span>`).join('')}</span>
                    <span class="school-card__body">
                        <span class="school-card__name">${escapeHtml(school.name)}</span>
                        ${kretsTag}
                        <span class="school-card__meta">${meta.join(' · ')}</span>
                        ${combined && shown.length > 1 ? combinedStats(entry) : statsLine(shown[0] || school)}
                    </span>
                </button>
                ${saveButtonHtml(saveKey, 'school-card__save')}
                ${cardDetails(entry, `schoolDetails${index}`)}
            </li>`;
    }

    // Phones: what the map popup adds to the card (the year, the scores per subject, what the numbers
    // are based on, the photo), then "Vis på kartet" and "Les mer om skolen". The numbers already on the
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
                    <a class="ds-button" data-variant="primary" data-size="sm" href="${schoolUrl(entry.school)}"><span>${t('Les mer om skolen')}</span>${icon('arrowRight')}</a>
                </div>
            </div>`;
    }

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
        const walk = walkEstimate(state.address, school);
        return walk.minutes > WALK_MAX_MINUTES
            ? formatDistance(meters)
            : `${formatDistance(meters)} · ${t('ca. {minutes} min å gå', { minutes: walk.minutes })}`;
    }

    function formatDistance(meters) {
        return meters < 1000
            ? `${Math.round(meters / 10) * 10} m`
            : `${numberFormat.format(meters / 1000)} km`;
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
        if (!passes(entry)) resetFilters();
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
                node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
        L.maplibreGL({ style: THEME.mapStyle(), attributionControl: { customAttribution: MAP_ATTRIBUTION } }).addTo(miniMap);
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

    // ── Search mode: one search row, the select decides what we search by ─
    const SEARCH_MODES = {
        address: { field: 'addressField', input: 'addressSearch' },
        school: { field: 'schoolField', input: 'schoolSearch' }
    };

    function bindSearchMode() {
        const radios = document.querySelectorAll('input[name="searchMode"]');
        radios.forEach(radio => radio.addEventListener('change', () => {
            if (radio.checked) setSearchMode(radio.value, true);
        }));
        const checked = document.querySelector('input[name="searchMode"]:checked');
        setSearchMode(checked ? checked.value : 'address', false);
    }

    function setSearchMode(mode, focus) {
        Object.entries(SEARCH_MODES).forEach(([name, config]) => {
            el(config.field).hidden = name !== mode;
        });
        showLocateError(null);
        const config = SEARCH_MODES[mode] || SEARCH_MODES.address;
        state.mode = mode === 'school' ? 'school' : 'address';
        if (map) writeUrlState();
        if (focus) el(config.input).focus();
    }

    // ── Address search (Kartverket) ─────────────────────────────────────
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
            if (query.length < 3) {
                list.innerHTML = '';
                return;
            }
            addressTimer = setTimeout(() => searchAddress(query, list), 250);
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
            const result = addressResults[Number(item.value)];
            if (!result) return;
            list.innerHTML = '';
            selectAddress(result);
        });
    }

    // "Din posisjon" (like Entur and Vy): the first suggestion in the empty address field, and the target
    // icon at the end of the field. The browser asks for permission only when one of them is chosen. The
    // position is used like a searched address (nearest schools, skolekrets, walking time) and stays in the
    // browser: it is not sent to Kartverket or put in the address bar. The kommune for the skolekrets
    // pilot is found from the krets polygons themselves.
    const canLocate = () => 'geolocation' in navigator;
    const TARGET_ICON = '<svg class="ds-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6.25" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.25" fill="currentColor"/><path d="M12 2.75V5.75M12 18.25V21.25M2.75 12H5.75M18.25 12H21.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

    function locateOptionHtml() {
        if (!canLocate()) return '';
        const label = escapeHtml(t('Din posisjon'));
        return `<u-option value="locate" label="${label}" class="locate-option">${TARGET_ICON}<span>${label}</span></u-option>`;
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
        const field = el('addressField');
        field.querySelectorAll(':scope > [data-field="validation"]').forEach(node => node.remove());
        if (!text) return;
        const message = document.createElement('p');
        message.className = 'ds-validation-message';
        message.dataset.field = 'validation';
        message.dataset.size = 'sm';
        message.setAttribute('role', 'status');
        message.textContent = text;
        field.append(message);
    }

    function locate() {
        showLocateError(null);
        navigator.geolocation.getCurrentPosition(async position => {
            const result = { label: t('Din posisjon'), lat: position.coords.latitude, lng: position.coords.longitude };
            const data = await loadKretser();
            const krets = data && data.kretser.find(k => insideRings(result.lng, result.lat, k.rings));
            if (krets) result.kommune = krets.kommune;
            selectAddress(result);
        }, error => {
            showLocateError(t(error.code === error.PERMISSION_DENIED
                ? 'Nettleseren har ikke lov til å bruke posisjonen din. Skriv inn en adresse i stedet.'
                : 'Fant ikke posisjonen din. Skriv inn en adresse i stedet.'));
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }

    // Show the address as the combobox's selected value and place it on the map
    function selectAddress(result) {
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

    async function searchAddress(query, list) {
        if (addressAbort) addressAbort.abort();
        addressAbort = new AbortController();
        const params = new URLSearchParams({ sok: query, fuzzy: 'true', treffPerSide: '8', utkoordsys: '4258' });

        try {
            const response = await fetch(`${ADDRESS_API}?${params}`, { signal: addressAbort.signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            addressResults = (data.adresser || [])
                .filter(a => a.representasjonspunkt)
                .map(a => ({
                    label: `${a.adressetekst}, ${a.postnummer} ${titleCase(a.poststed)}`,
                    lat: a.representasjonspunkt.lat,
                    lng: a.representasjonspunkt.lon,
                    kommune: titleCase(a.kommunenavn)
                }));
            list.innerHTML = addressResults.length
                ? addressResults.map((a, i) => `<u-option value="${i}" label="${escapeHtml(a.label)}">${escapeHtml(a.label)}</u-option>`).join('')
                : '<u-option data-empty value="">Ingen adresser funnet</u-option>';
            openSuggestions(list, 'addressSearch');
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Address search failed:', error);
            list.innerHTML = '<u-option data-empty value="">Adressesøket er ikke tilgjengelig akkurat nå</u-option>';
        }
    }

    function setAddress(result) {
        state.address = result;
        rememberAddress(result);
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

        map.setView([result.lat, result.lng], 14);
        writeUrlState();

        // Pilot: exact skolekrets where the kommune publishes open data
        clearKrets();
        findKretser(result).then(found => {
            if (state.address !== result || !found) return;
            state.krets = found;
            drawKretser(found.hits);
            refreshList();
        });
    }

    function clearAddress() {
        if (!state.address) return;
        state.address = null;
        rememberAddress(null);
        clearKrets();
        if (addressMarker) {
            addressMarker.remove();
            addressMarker = null;
        }
        renderList();
        writeUrlState();
    }

    // ── Skolekrets pilot (Halden, Stavanger) ──────────────────────────────
    function loadKretser() {
        if (!kretsData) {
            kretsData = fetch('static/js/skolekretser.json?v=1')
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null);
        }
        return kretsData;
    }

    // Even-odd rule over all rings, so holes work too. Coordinates are [lng, lat].
    function insideRings(lng, lat, rings) {
        let inside = false;
        rings.forEach(ring => {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const [xi, yi] = ring[i], [xj, yj] = ring[j];
                if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
            }
        });
        return inside;
    }

    async function findKretser(result) {
        // Every kommune in skolekretser.json (see skolekretser.py) is looked up; others get the note
        const data = await loadKretser();
        if (!data || !data.kommuner[result.kommune]) return null;
        const hits = data.kretser
            .filter(k => k.kommune === result.kommune && insideRings(result.lng, result.lat, k.rings))
            .sort((a, b) => (a.level === 'barneskole' ? -1 : 1) - (b.level === 'barneskole' ? -1 : 1));
        return { kommune: result.kommune, info: data.kommuner[result.kommune], hits };
    }

    function isKretsSchool(school) {
        return Boolean(state.krets && state.krets.hits.some(k => k.school === school.name && k.level === school.schoolType
            && k.kommune === school.kommune));
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

    // Distance is not the same as skolekrets: say so whenever the list is sorted from an address.
    // Where a kommune publishes open skolekrets data, show the exact krets as a pilot.
    function renderKretsNote() {
        const note = el('kretsNote');
        // Not on the saved schools page, which is only the list and the map
        note.hidden = !state.address || state.savedOnly;
        if (note.hidden) return;
        const kommune = state.address.kommune;
        const check = `<a class="ds-link" href="${I18N.href('om-skolekrets.html')}">${kommune
            ? t('Sjekk skolekretsen hos {kommune} kommune', { kommune: escapeHtml(kommune) })
            : t('Sjekk skolekretsen hos kommunen')}</a>.`;
        const krets = state.krets;
        const own = krets ? krets.hits
            .map(k => {
                const entry = k.school && entries.find(e => e.levels.some(l => l.name === k.school && l.kommune === k.kommune && l.schoolType === k.level));
                return { krets: k, entry, level: entry && entry.levels.find(l => l.schoolType === k.level) };
            })
            .filter(hit => hit.entry) : [];

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
            const where = `<p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${I18N.href('om-skolekrets.html')}#pilot">${t('Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra')}</a></p>`;
            const ref = L.latLng(state.address.lat, state.address.lng);
            const nearest = ['barneskole', 'ungdomsskole'].map(type => entries
                .filter(e => e.levels.some(l => l.schoolType === type) && e.school.eierform !== 'privat' && e.school.lat && e.school.lng)
                .map(e => ({ entry: e, level: e.levels.find(l => l.schoolType === type), metres: ref.distanceTo([e.school.lat, e.school.lng]) }))
                .sort((a, b) => a.metres - b.metres)[0])
                .filter(hit => hit && hit.metres <= 20000)
                .map(hit => ({ krets: { level: hit.level.schoolType, name: null }, entry: hit.entry, level: hit.level }));
            if (!nearest.length) {
                note.innerHTML = `<div class="ds-alert results-note" data-color="info" data-size="sm">
                    <p class="ds-paragraph" data-size="sm">${t('Listen viser skolene nærmest adressen. Det er ikke sikkert at dette er skolen barnet sogner til. Kommunen bestemmer skolekretsen.')}</p>
                    ${osloLookup}${where}</div>`;
                return;
            }
            note.innerHTML = `
                <section class="own-schools" aria-labelledby="ownHeading">
                    <p class="own-schools__eyebrow" id="ownHeading">${t('Trolig skolekrets for adressen')}
                        <button type="button" class="ds-button filter-help" data-variant="tertiary" data-size="sm" data-icon="true"
                                popovertarget="ownInfo" aria-label="${t('Om skolekretsen')}">${icon('questionmarkCircle')}</button></p>
                    <div class="ds-popover own-schools__info" popover id="ownInfo" data-placement="bottom-start">
                        <p class="ds-paragraph" data-size="sm">${t('Kommunen bestemmer skolekretsen, men har ikke publisert kretsgrensene som åpne data. Vi viser derfor de nærmeste offentlige skolene, som oftest er skolene i kretsen. Sjekk alltid med kommunen.')}</p>
                        ${osloLookup}
                        ${where}
                    </div>
                    ${nearest.map(card).join('')}
                </section>`;
            return;
        }

        renderOwn();

        function renderOwn() {
            note.innerHTML = `
            <section class="own-schools" aria-labelledby="ownHeading">
                <p class="own-schools__eyebrow" id="ownHeading">${t('Skolekrets for adressen')}
                    <button type="button" class="ds-button filter-help" data-variant="tertiary" data-size="sm" data-icon="true"
                            popovertarget="ownInfo" aria-label="${t('Om skolekretsdataene')}">${icon('questionmarkCircle')}</button></p>
                <div class="ds-popover own-schools__info" popover id="ownInfo" data-placement="bottom-start">
                    <p class="ds-paragraph" data-size="sm">${t('Dette er en pilot på åpne data og kan avvike fra kommunens gjeldende grenser.')} ${escapeHtml(t(krets.info.caveat))}</p>
                    <p class="ds-paragraph" data-size="sm">${t('Kilde:')} <a class="ds-link" href="${escapeHtml(safeUrl(krets.info.sourceUrl))}" target="_blank" rel="noopener">${escapeHtml(t(krets.info.source))}</a>.</p>
                    <p class="ds-paragraph" data-size="sm">${check}</p>
                    <p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${I18N.href('om-skolekrets.html')}#pilot">${t('Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra')}</a></p>
                </div>
                ${own.map(card).join('')}
            </section>`;
        }

        // A card for one school: the krets name only when it comes from skolekrets data
        function card({ krets: k, entry, level }, index) {
            const school = level || entry.school;
            const key = schoolKey(school);
            const meta = [SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType,
                          distanceLabel(school),
                          k.name ? t('({name} skolekrets)', { name: escapeHtml(k.name) }).replace(/^\(|\)$/g, '') : null].filter(Boolean);
            // Grey until picked; the whole card shows the school on the map (like the list cards), the
            // bookmark sits next to it, and the school page is one click further, in the popup
            return `
                <div class="own-school-item">
                    <button type="button" class="ds-card own-school" data-variant="tinted" data-color="neutral" data-show="${escapeHtml(key)}">
                        <span class="own-school__head">
                            <span class="school-marker score-${scoreCategory(school.color)}" aria-hidden="true">${schoolTypeIcon(school.schoolType)}</span>
                            <span class="own-school__body">
                                <span class="own-school__name">${escapeHtml(school.name)}</span>
                                <span class="own-school__meta">${meta.join(' · ')}</span>
                                ${statsLine(school)}
                            </span>
                        </span>
                    </button>
                    ${saveButtonHtml(key, 'own-school__fav')}
                    ${cardDetails({ levels: [school], school }, `ownDetails${index}`)}
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

    function titleCase(text) {
        return (text || '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase());
    }

    return { init, showSchool };
})();

// Finder: filters, address search and the school list next to the map.
// main.js creates the markers and calls Finder.init(map, markerCluster, entries).

const Finder = (() => {
    const PAGE_SIZE = 10;
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
    // Målform from Nasjonalt skoleregister (maalform.py); a school without one only passes with no choice made
    const ALL_MAALFORM = ['bokmal', 'nynorsk'];
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
        laerere: new Set(ALL_LAERER),
        norsk: new Set(ALL_NORSK),
        maalform: new Set(ALL_MAALFORM),
        shared: null,       // a list opened from «Del listen» (?skoler=): its school keys, until it is saved here
        sort: 'distance',
        address: null, // { lat, lng, label, kommune }
        krets: null,   // pilot: { info, hits } when the address is in a kommune with open skolekrets data
        school: null,  // key of the school whose popup is open
        savedOnly: false,   // the list shows the saved schools ("Lagre til senere") instead of the map view
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
    let kretsData = null;   // static/js/skolekretser.json, loaded on first use
    let kretsLayer = null;
    let kretsLegend = null;
    let postalLayer = null; // the outline of a searched postnummer


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
        bindCompare();
        bindAddressSearch();
        bindLocate();
        fitResults();
        bindMapOpen();
        // In the upper right corner: «Fargene», and «Skolekrets» under it (the krets lines, only while they are drawn,
        // see drawKretser); the upper left has «Skjul kartet» (bindMapOpen)
        addColorLegend(map, 'topright');
        kretsLegend = addKretsLegend(map, 'topright');
        kretsLegend.getContainer().hidden = true;
        bindPhoneMap();

        el('showMore').addEventListener('click', () => {
            // After «Vis flere» the list may be longer than the map and scrolls on its own
            state.listExpanded = true;
            state.shown += PAGE_SIZE;
            refreshList();
        });

        // The list always shows the schools inside the visible part of the map, except right after
        // a school was picked from the list: then the list stays as it was until the user moves the map
        map.on('moveend', () => {
            if (keepList || state.savedOnly) return;
            state.shown = PAGE_SIZE;
            state.listExpanded = false;
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
            savedFrom = activeFilterCount() || state.address ? 'list' : 'start';
            if (state.kommune) fitToFiltered();
            setSavedOnly(true);
        } else if (state.kommune) {
            fitToFiltered();
        } else {
            // A plain visit: the start (how to read the colours and a link to /kart) until a search or a filter
            setStart(true);
        }
        document.querySelectorAll('[data-start-map]').forEach(button => button.addEventListener('click', () => {
            leaveStart();
            el('resultsTitle').focus({ preventScroll: true });
            document.querySelector('.results').scrollIntoView({ block: 'start' });
        }));
    }

    // ── Start (Figma F0): before a search the list and the map are hidden ─────
    let atStart = false;
    function setStart(on) {
        atStart = on;
        el('main').dataset.mode = on ? 'start' : '';
        el('startHint').hidden = !on;
        document.querySelector('.results').hidden = on;
        if (on) el('startMapText').textContent = t('Alle {count} grunnskolene i Norge og skolekretsene i kommunene der vi har dem.', { count: countFormat.format(entries.length) });
    }

    function leaveStart() {
        if (!atStart) return;
        setStart(false);
        map.invalidateSize();
        // Mainland Norway (all schools would include Svalbard and zoom out too far); the map column is narrower than the window
        if (!state.address) map.fitBounds([[57.9, 4.6], [71.2, 31.2]], { padding: [16, 16], animate: false });
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
            address: state.address ? { label: state.address.label, lat: state.address.lat, lng: state.address.lng, kommune: state.address.kommune, postnummer: state.address.postnummer } : null,
            scrollY: window.scrollY,
            // Wide screens: the list scrolls on its own (fitResults)
            listScroll: document.querySelector('.results-list').scrollTop
        };
        try { sessionStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) { /* storage blocked */ }
    }

    // The saved view, when the visitor came back with "Tilbake" or the browser's back button
    function returningView() {
        try {
            const navigation = performance.getEntriesByType('navigation')[0];
            // Back from a school page, the browser's back button, or a reload of the page: the same view again (the
            // address is kept in this tab only, never in the link)
            const back = sessionStorage.getItem(RETURN_KEY) || (navigation && ['back_forward', 'reload'].includes(navigation.type));
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
        const scroll = () => {
            window.scrollTo(0, view.scrollY || 0);
            document.querySelector('.results-list').scrollTop = view.listScroll || 0;
        };
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
        if (params.has('laerer')) state.laerere = new Set(list('laerer', ALL_LAERER));
        if (params.has('norsk')) state.norsk = new Set(list('norsk', ALL_NORSK));
        if (params.has('maalform')) state.maalform = new Set(list('maalform', ALL_MAALFORM));
        const trivsel = params.get('trivsel');
        // Older shared links used a minimum ("4.2" = 4,2 and over)
        const legacy = { '4.0': ['40', '42', '44'], '4.2': ['42', '44'], '4.4': ['44'] };
        if (legacy[trivsel]) state.trivsels = new Set(legacy[trivsel]);
        else if (params.has('trivsel')) state.trivsels = new Set(list('trivsel', ALL_TRIVSEL));
        if (params.get('lagrede') === '1') state.savedOnly = true;
        if (params.has('skoler')) {
            const keys = params.get('skoler').split(',').map(keyForToken).filter(Boolean);
            if (keys.length) {
                state.shared = keys;
                state.savedOnly = true;
            }
        }

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
        if (state.laerere.size !== ALL_LAERER.length) params.set('laerer', list(state.laerere, ALL_LAERER));
        if (state.norsk.size !== ALL_NORSK.length) params.set('norsk', list(state.norsk, ALL_NORSK));
        if (state.maalform.size !== ALL_MAALFORM.length) params.set('maalform', list(state.maalform, ALL_MAALFORM));
        if (state.sort !== 'distance') params.set('sort', state.sort);
        if (state.savedOnly) params.set('lagrede', '1');
        if (state.savedOnly && state.shared) params.set('skoler', state.shared.map(tokenForKey).filter(Boolean).join(','));
        if (state.school) params.set('skole', state.school);
        if (I18N.translated) params.set('lang', I18N.lang);   // a shared link keeps the language

        const query = params.toString();
        history.replaceState(history.state, '', query ? `?${query}` : location.pathname);
    }

    // Put the controls in line with the state (after reading the URL or resetting)
    function syncControls() {
        // Nothing is ticked while a group lets every school through (the default): the ticks are the choices
        const tick = (name, set, all) => document.querySelectorAll(`input[name="${name}"]`)
            .forEach(i => { i.checked = set.size !== all.length && set.has(i.value); });
        tick('type', state.types, ALL_TYPES);
        tick('owner', state.owners, ALL_OWNERS);
        tick('score', state.scores, ALL_SCORES);
        el('kommuneFilter').value = state.kommune;
        document.querySelectorAll('input[name="profile"]').forEach(i => { i.checked = i.value === state.profile; });
        tick('trivsel', state.trivsels, ALL_TRIVSEL);
        tick('mobbing', state.mobbings, ALL_MOBBING);
        tick('laerer', state.laerere, ALL_LAERER);
        tick('norsk', state.norsk, ALL_NORSK);
        tick('maalform', state.maalform, ALL_MAALFORM);
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
        // Ticked options are the choice; with none ticked the group lets every school through
        [['type', 'types', ALL_TYPES], ['owner', 'owners', ALL_OWNERS], ['score', 'scores', ALL_SCORES],
            ['trivsel', 'trivsels', ALL_TRIVSEL], ['mobbing', 'mobbings', ALL_MOBBING],
            ['laerer', 'laerere', ALL_LAERER], ['norsk', 'norsk', ALL_NORSK], ['maalform', 'maalform', ALL_MAALFORM]].forEach(([name, key, all]) => {
            document.querySelectorAll(`input[name="${name}"]`).forEach(input => {
                input.addEventListener('change', () => {
                    const picked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
                    state[key] = new Set(picked.length ? picked : all);
                    applyFilters();
                });
            });
        });
        // Profil is one choice: a click on the chosen profile takes it away again (the hidden «Alle»)
        el('profileFilter').addEventListener('click', event => {
            const input = event.target.closest('input[name="profile"]');
            if (!input || !input.value || input.value !== state.profile) return;
            el('f-profile-alle').checked = true;
            state.profile = '';
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
        // «Sorter skolene» (Figma I2, dialogs.js): one radio button per order; a choice sorts at once and closes it.
        // The orders and their names are the items in #sortMenu (kept in the page as the list of orders).
        const applySort = sort => {
            if (sort === state.sort) return;
            state.sort = sort;
            state.shown = PAGE_SIZE;
            state.listExpanded = false;
            showSort(state.sort);
            announceList = true;
            renderList();
            writeUrlState();
        };
        el('sortButton').addEventListener('click', () => {
            const rows = [...document.querySelectorAll('#sortMenu .sort-menu__item')].map(item => `
                <label class="ui-choice"><input type="radio" name="sortChoice" value="${item.dataset.sort}"${item.dataset.sort === state.sort ? ' checked' : ''}>
                    <span class="ui-choice__mark" aria-hidden="true"></span><span>${escapeHtml(t(item.dataset.label))}</span></label>`).join('');
            const { dialog, close } = UiDialog.open({
                title: t('Sorter skolene'),
                html: `<fieldset class="ui-choices"><legend class="ds-sr-only">${t('Sorter skolene')}</legend>${rows}</fieldset>`
            });
            dialog.querySelectorAll('input[name="sortChoice"]').forEach(input => input.addEventListener('change', () => {
                applySort(input.value);
                close();
            }));
            (dialog.querySelector('input:checked') || dialog.querySelector('input')).focus();
        });

        // Filters slide in from the right (a modal Designsystemet Dialog). The list and map update as you
        // choose; "Vis N skoler", the close button, Esc or a click outside the panel closes it.
        const dialog = el('filterPanel');
        el('filterToggle').addEventListener('click', () => setFilterPanel(true));
        el('filterToggleSticky').addEventListener('click', () => setFilterPanel(true));
        el('filterClose').addEventListener('click', () => setFilterPanel(false));
        el('filterDone').addEventListener('click', () => setFilterPanel(false));
        el('filterResetDialog').addEventListener('click', resetFilters);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) setFilterPanel(false); // the backdrop
        });
        // The panel is a step in the browser's history, so the phone's back button (or gesture) closes it
        // instead of leaving the page. Closing it any other way (button, Esc, backdrop) takes that step back.
        // Watched through the dialog's "open" attribute: the "close" event did not always come.
        let wasOpen = false;
        new MutationObserver(() => {
            if (dialog.open === wasOpen) return;
            wasOpen = dialog.open;
            if (dialog.open) return;
            el('filterToggle').setAttribute('aria-expanded', 'false');
            el('filterToggleSticky').setAttribute('aria-expanded', 'false');
            if (history.state && history.state.filterPanel) history.back();
            (el('filterToggleSticky').hidden ? el('filterToggle') : el('filterToggleSticky')).focus();
        }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
        window.addEventListener('popstate', () => {
            if (dialog.open && !(history.state && history.state.filterPanel)) dialog.close();
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
        const actions = document.querySelector('.search-bar__actions');
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
        return (state.types.size !== ALL_TYPES.length ? 1 : 0)
            + (state.owners.size !== ALL_OWNERS.length ? 1 : 0)
            + (state.scores.size !== ALL_SCORES.length ? 1 : 0)
            + (state.kommune ? 1 : 0)
            + (state.profile ? 1 : 0)
            + (state.trivsels.size !== ALL_TRIVSEL.length ? 1 : 0)
            + (state.mobbings.size !== ALL_MOBBING.length ? 1 : 0)
            + (state.laerere.size !== ALL_LAERER.length ? 1 : 0)
            + (state.norsk.size !== ALL_NORSK.length ? 1 : 0)
            + (state.maalform.size !== ALL_MAALFORM.length ? 1 : 0);
    }

    function updateFilterCount() {
        const count = activeFilterCount();
        [el('filterCount'), el('filterCountSticky')].forEach(badge => {
            badge.hidden = count === 0;
            badge.dataset.count = String(count);
            badge.setAttribute('aria-label', count === 1 ? t('1 aktivt filter') : t('{count} aktive filtre', { count }));
        });
        renderActiveFilters();
        // "Nullstill" in the panel; only usable when a filter is on
        el('filterResetDialog').disabled = count === 0;
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
        { name: 'type', label: 'Skoletype', key: 'types', all: () => ALL_TYPES, named: false },
        { name: 'owner', label: 'Eierform', key: 'owners', all: () => ALL_OWNERS, named: false },
        { name: 'maalform', label: 'Målform', key: 'maalform', all: () => ALL_MAALFORM, named: false },
        { name: 'trivsel', label: 'Trivsel', key: 'trivsels', all: () => ALL_TRIVSEL, named: true },
        { name: 'mobbing', label: 'Mobbing', key: 'mobbings', all: () => ALL_MOBBING, named: true },
        { name: 'laerer', label: 'Lærertetthet', key: 'laerere', all: () => ALL_LAERER, named: true },
        { name: 'norsk', label: 'Forsterket norsk', key: 'norsk', all: () => ALL_NORSK, named: true }
    ];

    function activeFilterChips() {
        const optionLabel = input => document.querySelector(`#filterPanel label[for="${input.id}"]`).textContent.trim();
        const chips = [];
        FILTER_GROUPS.forEach(group => {
            const all = group.all();
            if (state[group.key].size === all.length) return;
            const inputs = [...document.querySelectorAll(`#filterPanel input[name="${group.name}"]`)];
            const checked = inputs.filter(i => i.checked);
            const value = checked.length === 0 ? t('Ingen')
                : checked.length <= 2 ? checked.map(optionLabel).join(', ')
                : t('{current} av {total}', { current: checked.length, total: inputs.length });
            const dots = group.dots ? checked.map(i => `<span class="color-dot score-${escapeHtml(i.value)}" aria-hidden="true"></span>`).join('') : '';
            chips.push({ id: group.name, dots, text: group.named ? `${t(group.label)} ${value}` : value, label: `${t(group.label)}: ${value}` });
        });
        if (state.kommune) chips.push({ id: 'kommune', text: state.kommune, label: `${t('Kommune')}: ${state.kommune}` });
        if (state.profile) {
            const input = document.querySelector(`#filterPanel input[name="profile"][value="${CSS.escape(state.profile)}"]`);
            // The label has the number of schools in brackets; the chip only the profile
            const name = input ? optionLabel(input).replace(/\s*\(\d+\)$/, '') : state.profile;
            chips.push({ id: 'profile', text: name, label: `${t('Profil')}: ${name}` });
        }
        // In the panel's order
        const ORDER = ['score', 'type', 'owner', 'kommune', 'profile', 'trivsel', 'mobbing'];
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
        else if (id === 'profile') state.profile = '';
        else {
            const group = FILTER_GROUPS.find(g => g.name === id);
            state[group.key] = new Set(group.all());
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
            const all = checked.length === 0 || checked.length === inputs.length;
            summary.textContent = all ? t('Alle')
                : checked.length === 1 ? label(checked[0])
                : t('{current} av {total}', { current: checked.length, total: inputs.length });
            summary.closest('.filter-dd__button').toggleAttribute('data-active', !all);
        });
    }

    function passes(entry) {
        const school = entry.school;
        const shown = levelsShown(entry);
        // With both owner types selected, schools without a register match are included too
        const ownerOk = state.owners.size === ALL_OWNERS.length || state.owners.has(school.eierform);
        const maalformOk = state.maalform.size === ALL_MAALFORM.length || state.maalform.has(school.maalform);
        // A school with both levels passes when one of the levels the type filter shows does
        return shown.length > 0
            && ownerOk
            && maalformOk
            && shown.some(level => state.scores.has(scoreCategory(level.color)))
            && (!state.kommune || school.kommune === state.kommune)
            && (!state.profile || school.profil === state.profile)
            && shown.some(level => state.trivsels.has(trivselBand(level)))
            && shown.some(level => state.mobbings.has(mobbingBand(level)))
            && shown.some(level => state.laerere.has(laererBand(level)))
            && shown.some(level => state.norsk.has(norskBand(level)));
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
        if (value === null || value === undefined) return 'none';
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
        leaveStart();
        announceList = true;
        filtered = entries.filter(passes);
        cluster.clearLayers();
        cluster.addLayers(filtered.map(e => e.marker));
        state.shown = PAGE_SIZE;
        state.listExpanded = false;
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
        state.laerere = new Set(ALL_LAERER);
        state.norsk = new Set(ALL_NORSK);
        state.maalform = new Set(ALL_MAALFORM);
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
            state.shared = null;   // the header's «Lagrede skoler» is always this browser's own list
            setSavedOnly(true);
            el('resultsTitle').scrollIntoView({ block: 'nearest' });
        }));
        // A bookmark changed somewhere on the page: the counter (and the saved list) follow
        document.addEventListener('savedschools', () => {
            if (state.savedOnly) refreshList();
        });
    }

    // Where the saved schools were opened from: the start or the list (with its filters, address and map view,
        // all kept in `state` and the map while the comparison is shown), so «Tilbake til skolene» and «Legg til en
        // skole» go back to the same place
    let savedFrom = null;
    function setSavedOnly(on) {
        if (on) {
            savedFrom = savedFrom || (atStart ? 'start' : 'list');
            leaveStart();
        }
        announceList = true;
        state.savedOnly = on;
        state.shown = PAGE_SIZE;
        state.listExpanded = false;
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
        renderList();
        writeUrlState();
    }

    // Back from the saved schools to where they were opened from
    function leaveSaved() {
        const from = savedFrom;
        state.shared = null;
        savedFrom = null;
        setSavedOnly(false);
        if (from === 'start') {
            setStart(true);
            el('addressSearch') ? el('addressSearch').focus() : window.scrollTo(0, 0);
        } else {
            el('resultsTitle').focus({ preventScroll: true });
            document.querySelector('.results').scrollIntoView({ block: 'start' });
        }
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
        el('savedToggle').innerHTML = `${icon('chevronLeft')}<span>${t('Tilbake til skolene')}</span>`;
        document.querySelectorAll('.saved-link').forEach(link => {
            if (state.savedOnly) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
    }

    // ── The saved schools compared (Figma 321:38686, «Hva skiller dem?», and 174:11826, the table) ──
    // «Del listen»: a link with only the schools, as organisation number and level («974590603b»), never an address
    // or anything about the visitor
    const levelByKey = key => entries.flatMap(e => e.levels).find(level => schoolKey(level) === key);
    function tokenForKey(key) {
        const level = levelByKey(key);
        return level && level.orgnr ? `${level.orgnr}${level.schoolType === 'barneskole' ? 'b' : 'u'}` : null;
    }
    function keyForToken(token) {
        const match = /^(\d{9})([bu])$/.exec(token.trim());
        if (!match) return null;
        const level = entries.flatMap(e => e.levels).find(l => l.orgnr === match[1] && (l.schoolType === 'barneskole') === (match[2] === 'b'));
        return level ? schoolKey(level) : null;
    }
    function sharedEntries() {
        const list = [];
        state.shared.forEach(key => {
            const entry = entries.find(e => e.keys.includes(key));
            if (entry && !list.includes(entry)) list.push(entry);
        });
        return list;
    }

    function listUrl() {
        const saved = savedSchools();
        const keys = compareEntries.flatMap(entry => (state.shared ? entry.keys.filter(k => state.shared.includes(k)) : entry.keys.filter(k => saved.has(k))));
        return new URL(I18N.href(`./?lagrede=1&skoler=${keys.map(tokenForKey).filter(Boolean).join(',')}`), location.href).href;
    }

    // «Send til e-post» (Figma «Finn listen igjen senere»): the visitor's own e-mail program with the link, so the
    // list can be found again on another device. No server, so the address is never stored or seen by us.
    function mailHref() {
        const subject = t('Lagrede skoler på Skolekartet');
        const body = `${compareEntries.map(entry => `– ${entry.school.name} (${entry.school.kommune})`).join('\n')}\n\n${listUrl()}`;
        return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    // «Del listen med familien» (Figma I3): the link to read or copy, and the ways to send it. Only the schools are in
    // it, never the address. Copying and the e-mail end with a short confirmation (I4, I5).
    function shareList() {
        const url = listUrl();
        const names = compareEntries.map(entry => `– ${entry.school.name} (${entry.school.kommune})`).join('\n');
        const smsBody = `${t('Lagrede skoler på Skolekartet')}:\n${names}\n${url}`;
        // Copying and the e-mail confirm in this same box (one window, not one more on top of it); printing is the
        // button on the page itself
        const { dialog } = UiDialog.open({
            title: t('Del listen med familien'),
            html: `<p class="ds-paragraph">${t('Lenken viser de samme skolene. Adressen deres er ikke med.')}</p>
                <label class="ds-sr-only" for="shareUrl">${t('Lenke til listen')}</label>
                <input class="ds-input" id="shareUrl" type="text" readonly value="${escapeHtml(url)}">
                <p class="ds-paragraph ui-status" id="shareStatus" role="status"></p>`,
            actions: [
                { label: t('Kopier lenke'), primary: true, keepOpen: true, onClick: async () => {
                    let ok = false;
                    try { await navigator.clipboard.writeText(url); ok = true; } catch (_) { /* no clipboard */ }
                    if (ok) dialog.querySelector('#shareStatus').textContent = `✓ ${t('Lenken er kopiert')}`;
                    else window.prompt(t('Kopier lenken til listen:'), url);
                } },
                { label: t('Send på SMS'), href: `sms:?&body=${encodeURIComponent(smsBody)}` },
                { label: t('Send på e-post'), href: mailHref(), keepOpen: true, onClick: () => {
                    dialog.querySelector('#shareStatus').textContent = `✓ ${t('E-posten er klar')}`;
                } }
            ]
        });
        // The whole link is selected when the field gets the focus, ready to copy by hand
        dialog.querySelector('#shareUrl').addEventListener('focus', event => event.target.select());
    }

    // A shared list is saved here only when asked; until then the visitor's own saved schools are left alone
    function saveSharedList() {
        const saved = savedSchools();
        state.shared.forEach(key => { if (!saved.has(key)) toggleSaved(key); });
        setSavedOrder([...state.shared, ...[...saved].filter(key => !state.shared.includes(key))]);
        state.shared = null;
        refreshList();
        writeUrlState();
        el('compareStatus').textContent = t('Listen er lagret');
        el('savedTitle').focus();
    }

    // The saved schools in the visitor's own order (dragged in the table or sorted by a column); new ones last
    function bySavedOrder(list) {
        const order = [...savedSchools()];
        const place = entry => Math.min(...entry.keys.map(key => {
            const i = order.indexOf(key);
            return i < 0 ? Infinity : i;
        }));
        return list.slice().sort((a, b) => place(a) - place(b));
    }

    // «Kort» or «Liste», remembered in this browser; the cards first (Figma 321:38751)
    const COMPARE_VIEW_KEY = 'skolekartet.sammenlign';
    function compareView() {
        try { return localStorage.getItem(COMPARE_VIEW_KEY) === 'liste' ? 'liste' : 'kort'; } catch (_) { return 'kort'; }
    }

    let compareEntries = [];
    // The column the table was last sorted by, until a school is moved by hand
    let compareSort = null;
    const COMPARE_SORT = {
        name: { dir: 'asc', value: entry => entry.school.name },
        prover: { dir: 'desc', value: entry => averageOf(entry) },
        trivsel: { dir: 'desc', value: entry => trivselOf(entry) },
        mobbing: { dir: 'asc', value: entry => mobbingOf(entry) },
        distance: { dir: 'asc', value: entry => (state.address ? L.latLng(state.address.lat, state.address.lng).distanceTo([entry.school.lat, entry.school.lng]) : null) }
    };
    const COMPARE_COLUMN = { name: 'Skole', prover: 'Prøver', trivsel: 'Trivsel', mobbing: 'Mobbing', distance: 'Avstand' };

    const mobbingNationalOf = entry => meanOf(levelsShown(entry).map(l => (l.mobbing ? l.mobbing.national : null)));
    const listFormat = list => (typeof Intl.ListFormat === 'function' ? new Intl.ListFormat(I18N.locale, { type: 'conjunction' }).format(list) : list.join(', '));

    function renderCompare(list) {
        compareEntries = state.savedOnly ? list : [];
        el('compare').hidden = !state.savedOnly;
        el('sharedNotice').hidden = !(state.savedOnly && state.shared);
        el('compare').classList.toggle('compare--shared', Boolean(state.shared));
        // The saved schools are this comparison only: no map and no list of nearby schools
        el('resultsGrid').hidden = state.savedOnly;
        if (!state.savedOnly) return;
        const table = list.length > 0 && compareView() === 'liste';
        el('compareTable').hidden = !table;
        el('compareCards').hidden = table;
        compareCardStars = compareStars(list);
        // Up to four schools side by side (Figma 321:38751): the place to add one goes when there are four
        if (!table) el('compareCards').innerHTML = list.length ? list.map(compareCard).join('') + (list.length < 4 ? addCardHtml() : '') : '';
        // Nothing saved yet: only the hint under the title
        el('compare').querySelector('.compare__actions').hidden = list.length === 0;
        el('compare').querySelector('.compare__view').hidden = list.length === 0;
        el('compareView').querySelectorAll('[data-view]').forEach(button =>
            button.setAttribute('aria-checked', String(button.dataset.view === compareView())));
        renderCompareDiff(list);
        if (!table) return;

        const column = key => {
            const sort = compareSort === key ? (COMPARE_SORT[key].dir === 'asc' ? 'ascending' : 'descending') : 'none';
            return `<th scope="col" aria-sort="${sort}"><button type="button" data-sort-by="${key}">${t(COMPARE_COLUMN[key])}</button></th>`;
        };
        el('compareHead').innerHTML = `<tr>
            <th scope="col" class="compare-table__move"><span class="ds-sr-only">${t('Rekkefølge')}</span></th>
            ${column('name')}${column('prover')}${column('trivsel')}${column('mobbing')}${state.address ? column('distance') : ''}
            <th scope="col"><span class="ds-sr-only">${t('Fjern')}</span></th></tr>`;
        el('compareBody').innerHTML = list.map((entry, index) => compareRow(entry, index, list.length)).join('');
    }

    // ↑, ↓ or = against the national average at the shown precision; green where it is better, orange where it
    // is worse (for mobbing lower is better), and «Ikke oppgitt» with a dashed border where there is no number
    function compareBadge(value, national, higherIsBetter, format) {
        if (value === null || value === undefined) return `<span class="compare-badge" data-tone="none">${t('Ikke oppgitt')}</span>`;
        const diff = national === null || national === undefined ? 0 : Math.round(value * 10) - Math.round(national * 10);
        const tone = diff === 0 ? 'neutral' : (diff > 0) === higherIsBetter ? 'good' : 'warn';
        return `<span class="compare-badge" data-tone="${tone}">${format(value)} <span aria-hidden="true">${diff === 0 ? '=' : diff > 0 ? '↑' : '↓'}</span><span class="ds-sr-only">${t(diff === 0 ? 'Som snittet' : diff > 0 ? 'Over snittet' : 'Under snittet')}</span></span>`;
    }

    function compareRow(entry, index, total) {
        const school = entry.school;
        const type = entry.levels.length > 1 ? t('Barne- og ungdomsskole') : t(school.schoolType === 'barneskole' ? 'Barneskole' : 'Ungdomsskole');
        const moveLabel = t('Flytt {name}, plass {place} av {total}', { name: school.name, place: index + 1, total });
        // The same marks as on the cards: a star for the clear best, «Verdt å sjekke» for high mobbing
        const stars = compareCardStars[entry.key] || {};
        // The Digdir tag for the mark (the same on the cards and in the list)
        const star = (on, label) => (on ? `<span class="ds-tag compare-table__mark" data-color="success" data-size="sm">★ ${t(label)}</span>` : '');
        const mob = mobbingOf(entry), national = mobbingNationalOf(entry);
        const worry = mob !== null && national && mob / national >= 1.5;
        // In one line with the school's name
        const marks = star(stars.prover, 'Best på prøver') + star(stars.trivsel, 'Best trivsel') + star(stars.mobbing, 'Minst mobbing')
            + (worry ? `<span class="ds-tag compare-table__mark" data-color="warning" data-size="sm">${t('Verdt å sjekke: Mobbing')}</span>` : '');
        return `<tr data-key="${escapeHtml(entry.key)}">
                <td class="compare-table__move"><button type="button" class="ds-button compare-table__handle" data-variant="tertiary" data-size="sm" data-icon="true"
                        data-move aria-label="${escapeHtml(moveLabel)}" aria-describedby="compareMoveHelp">${icon('grip')}</button></td>
                <th scope="row"><span class="compare-table__title"><a class="ds-link compare-table__name" href="${schoolUrl(levelsShown(entry)[0] || school)}">${escapeHtml(school.name)}</a>${marks}</span>
                    <span class="compare-table__meta">${type} · ${escapeHtml(school.kommune)}</span></th>
                <td>${snittBadge(averageOf(entry), '')}</td>
                <td>${compareBadge(trivselOf(entry), TRIVSEL_NATIONAL, true, value => numberFormat.format(value))}</td>
                <td>${compareBadge(mob, national, false, formatPercent)}</td>
                ${state.address ? `<td class="compare-table__distance">${distanceLabel(school)}</td>` : ''}
                <td>${removeButtonHtml(entry)}</td>
            </tr>`;
    }

    // «Fjern ×»: takes the school (each of its saved levels) off the list
    // «Fjern» on the cards is the ✕ alone; the name is for screen readers (aria-label)
    function removeButtonHtml(entry, iconOnly = false) {
        const label = escapeHtml(t('Fjern {name} fra listen', { name: entry.school.name }));
        return `<button type="button" class="ds-button compare-remove${iconOnly ? ' compare-remove--icon' : ''}" data-variant="tertiary" data-size="sm" data-remove="${escapeHtml(entry.key)}"
            aria-label="${label}"${iconOnly ? ` title="${label}"` : ''}>${iconOnly ? '' : `<span>${t('Fjern')}</span>`}${icon('xMark')}</button>`;
    }

    // The best school on a measure gets a star, only where the lead is clear (the same limits as «Hva skiller dem?»)
    function compareStars(list) {
        const stars = {};
        const best = (value, higher, gap, label) => {
            const known = list.map(entry => ({ entry, value: value(entry) })).filter(hit => hit.value !== null && hit.value !== undefined)
                .sort((a, b) => (higher ? b.value - a.value : a.value - b.value));
            if (known.length < 2 || Math.abs(known[0].value - known[1].value) < gap) return;
            (stars[known[0].entry.key] = stars[known[0].entry.key] || {})[label] = true;
        };
        best(averageOf, true, 1, 'prover');
        best(trivselOf, true, 0.2, 'trivsel');
        best(mobbingOf, false, 3, 'mobbing');
        return stars;
    }

    // One measure on a card: the name and the comparison in words on the left, the number on the right, on the
    // colour of how it compares (green better, orange worse, grey the same, dashed with no number)
    function compareTile(label, value, words, tone, star) {
        return `${star ? `<span class="ds-tag" data-color="success" data-size="sm">★ ${star}</span>` : ''}
            <div class="compare-tile" data-tone="${tone}">
                <span class="compare-tile__text"><span class="compare-tile__label">${label}</span><span class="compare-tile__words">${words}</span></span>
                <span class="compare-tile__value">${value}</span>
            </div>`;
    }

    function compareCard(entry) {
        const school = entry.school;
        const stars = compareCardStars[entry.key] || {};
        const type = entry.levels.length > 1 ? t('Barne- og ungdomsskole') : t(school.schoolType === 'barneskole' ? 'Barneskole' : 'Ungdomsskole');
        const meta = [type];
        if (state.address) meta.push(distanceLabel(school));

        const avg = averageOf(entry);
        const band = scoreBand(avg);
        const proveWords = { 'very-high': 'Godt over snittet', high: 'Over snittet', low: 'Under snittet', 'very-low': 'Godt under snittet' }[band];
        const prove = avg === null
            ? compareTile(t('Nasjonale prøver'), '–', t('Ikke oppgitt'), 'none')
            : compareTile(t('Nasjonale prøver'), numberFormat.format(avg), t(proveWords), band === 'very-high' || band === 'high' ? 'good' : 'warn', stars.prover && t('Best på prøver'));

        const triv = trivselOf(entry);
        const trivDiff = triv === null ? 0 : Math.round(triv * 10) - Math.round(TRIVSEL_NATIONAL * 10);
        const trivsel = triv === null
            ? compareTile(t('Trivsel'), '–', t('Ikke oppgitt'), 'none')
            : compareTile(t('Trivsel'), t('{value} av 5', { value: numberFormat.format(triv) }), t(trivDiff > 0 ? 'Over snittet' : trivDiff < 0 ? 'Under snittet' : 'Som snittet'),
                trivDiff > 0 ? 'good' : trivDiff < 0 ? 'warn' : 'neutral', stars.trivsel && t('Best trivsel'));

        const mob = mobbingOf(entry);
        const national = mobbingNationalOf(entry);
        let mobWords = 'Som snittet', mobTone = 'neutral';
        if (mob !== null && national) {
            if (mob / national >= 2) { mobWords = 'Over dobbelt så høyt'; mobTone = 'warn'; }
            else if (mob - national >= 1) { mobWords = 'Høyere enn snittet'; mobTone = 'warn'; }
            else if (national - mob >= 1) { mobWords = 'Lavere enn snittet'; mobTone = 'good'; }
        }
        const mobbing = mob === null
            ? compareTile(t('Mobbing'), '–', t('Ikke oppgitt'), 'none')
            : compareTile(t('Mobbing'), formatPercent(mob), t(mobWords), mobTone, stars.mobbing && t('Minst mobbing'));
        const worry = mob !== null && national && mob / national >= 1.5;

        return `<li class="ds-card compare-card score-${band}" data-key="${escapeHtml(entry.key)}">
                <div class="compare-card__head">
                    <button type="button" class="ds-button compare-table__handle" data-variant="tertiary" data-size="sm" data-icon="true"
                        data-move aria-label="${escapeHtml(t('Flytt {name}, plass {place} av {total}', { name: school.name, place: compareEntries.indexOf(entry) + 1, total: compareEntries.length }))}" aria-describedby="compareMoveHelp">${icon('grip')}</button>
                    <h3 class="ds-heading compare-card__name" data-size="2xs">${escapeHtml(school.name)}</h3>
                    ${removeButtonHtml(entry, true)}
                </div>
                <p class="ds-paragraph compare-card__meta" data-size="sm">${meta.join(' · ')}</p>
                ${prove}${trivsel}${mobbing}
                ${worry ? `<p class="ds-tag" data-color="warning" data-size="sm">${t('Verdt å sjekke: Mobbing')}</p>` : ''}
                <a class="ds-link compare-card__more" href="${schoolUrl(levelsShown(entry)[0] || school)}">${t('Se hele skolesiden')}${icon('arrowRight')}</a>
            </li>`;
    }
    let compareCardStars = {};

    // The last place in the row: find and save more schools on the map
    function addCardHtml() {
        return `<li class="compare-card compare-card--add"><a class="ds-link" href="${I18N.href('./')}" data-leave-saved>+ ${t('Legg til en skole')}</a>
            <span class="compare-card__hint">${t('Opptil 4')}</span></li>`;
    }

    // «Hva skiller dem?»: a short answer per measure for two or more schools, so the table does not have to
    // be read first. Small differences are called that, not a ranking.
    function renderCompareDiff(list) {
        const items = list.length >= 2 ? compareDiffItems(list) : [];
        el('compareDiffSection').hidden = items.length === 0;
        el('compareDiff').innerHTML = items.map(item => `
            <li class="ds-card compare-diff" data-tone="${item.tone || 'neutral'}">
                <span class="compare-diff__icon" aria-hidden="true">${item.icon}</span>
                <span class="compare-diff__body">
                    <span class="compare-diff__title">${t(item.title)}</span>
                    <strong class="compare-diff__head">${item.head}</strong>
                    <span class="compare-diff__text">${item.text}</span>
                </span>
            </li>`).join('');
    }

    function compareDiffItems(list) {
        const items = [];
        const name = entry => escapeHtml(entry.school.name);
        const decimal = value => numberFormat.format(value);
        const known = value => list.map(entry => ({ entry, value: value(entry) })).filter(hit => hit.value !== null && hit.value !== undefined);

        const prover = known(averageOf).sort((a, b) => b.value - a.value);
        if (prover.length >= 2) {
            const [top, next] = prover;
            const gap = top.value - next.value;
            const low = prover[prover.length - 1];
            items.push(gap < 1
                ? { title: 'Nasjonale prøver', icon: '=', head: t('Ingen tydelig forskjell'),
                    text: t('{low}–{high} poeng.', { low: decimal(low.value), high: decimal(top.value) }) }
                : { title: 'Nasjonale prøver', icon: gap < 4 ? '≈' : '↑', tone: gap < 4 ? 'neutral' : 'good',
                    head: t(gap < 4 ? '{name} litt høyere' : '{name} høyest', { name: name(top.entry) }),
                    text: `${t('{value} mot {others}.', { value: decimal(top.value), others: listFormat(prover.slice(1).map(hit => decimal(hit.value))) })}${gap < 4 ? ` ${t('Små forskjeller kan være tilfeldige.')}` : ''}` });
        }

        const trivsel = known(trivselOf).sort((a, b) => b.value - a.value);
        if (trivsel.length >= 2) {
            const top = trivsel[0], low = trivsel[trivsel.length - 1];
            const range = `${t('{low}–{high} av 5.', { low: decimal(low.value), high: decimal(top.value) })} ${t('Landet: {value}.', { value: decimal(TRIVSEL_NATIONAL) })}`;
            items.push(Math.round(top.value * 10) - Math.round(low.value * 10) <= 2
                ? { title: 'Trivsel', icon: '=', head: t('Ingen tydelig forskjell'), text: range }
                : { title: 'Trivsel', icon: '↑', tone: 'good', head: t('Best trivsel på {name}', { name: name(top.entry) }), text: range });
        }

        const mobbing = known(mobbingOf).sort((a, b) => a.value - b.value);
        if (mobbing.length >= 2) {
            const least = mobbing[0], most = mobbing[mobbing.length - 1];
            const national = mobbingNationalOf(most.entry);
            const times = national ? most.value / national : 0;
            if (times >= 1.5) {
                items.push({ title: 'Mobbing', icon: '!', tone: 'warn', head: t('{name} skiller seg ut', { name: name(most.entry) }),
                    text: `${t(times >= 2 ? '{value} – over dobbelt så høyt som landet ({national}).' : '{value} – høyere enn landet ({national}).', { value: formatPercent(most.value), national: formatPercent(national) })} ${t('{name} har minst ({value}).', { name: name(least.entry), value: formatPercent(least.value) })}` });
            } else if (most.value - least.value < 3) {
                items.push({ title: 'Mobbing', icon: '=', head: t('Ingen tydelig forskjell'),
                    text: t('{low}–{high}.', { low: formatPercent(least.value), high: formatPercent(most.value) }) });
            } else {
                items.push({ title: 'Mobbing', icon: '↓', tone: 'good', head: t('Minst mobbing på {name}', { name: name(least.entry) }),
                    text: t('{value} mot {others}.', { value: formatPercent(least.value), others: listFormat(mobbing.slice(1).map(hit => formatPercent(hit.value))) }) });
            }
        }

        // The way to school only from an address (a postnummer is an area, not a starting point)
        if (state.address && !state.address.postnummer) {
            const here = L.latLng(state.address.lat, state.address.lng);
            const distance = list.map(entry => ({ entry, value: here.distanceTo([entry.school.lat, entry.school.lng]) })).sort((a, b) => a.value - b.value);
            items.push({ title: 'Avstand', icon: '→', head: t('{name} er nærmest', { name: name(distance[0].entry) }),
                text: t('{value} mot {others}.', { value: formatDistance(distance[0].value), others: listFormat(distance.slice(1).map(hit => formatDistance(hit.value))) }) });
        }
        return items;
    }

    function saveCompareOrder(list) {
        const saved = savedSchools();
        setSavedOrder(list.flatMap(entry => entry.keys.filter(key => saved.has(key))));
    }

    // A school one place up or down (the arrow keys on the handle), or to where it was dragged
    function moveCompare(from, to) {
        if (to < 0 || to >= compareEntries.length || from === to) return;
        const list = compareEntries.slice();
        const [entry] = list.splice(from, 1);
        list.splice(to, 0, entry);
        saveCompareOrder(list);
        compareSort = null;
        refreshList();
        const handle = el(compareView() === 'liste' ? 'compareBody' : 'compareCards').querySelector(`[data-key="${CSS.escape(entry.key)}"] [data-move]`);
        if (handle) handle.focus();
        el('compareStatus').textContent = t('{name} er flyttet til plass {place} av {total}', { name: entry.school.name, place: to + 1, total: list.length });
    }

    function bindCompare() {
        // «Tilbake til skolene» and «Legg til en skole»: back to the list (or the start) the comparison came from
        document.addEventListener('click', event => {
            const link = event.target.closest('#savedToggle, [data-leave-saved]');
            if (!link || !state.savedOnly || event.ctrlKey || event.metaKey || event.shiftKey) return;
            event.preventDefault();
            leaveSaved();
        });
        el('comparePrint').addEventListener('click', () => window.print());
        el('compareShare').addEventListener('click', shareList);
        el('saveShared').addEventListener('click', saveSharedList);
        el('compareView').addEventListener('click', event => {
            const button = event.target.closest('[data-view]');
            if (!button || button.dataset.view === compareView()) return;
            try { localStorage.setItem(COMPARE_VIEW_KEY, button.dataset.view); } catch (_) { /* storage blocked */ }
            refreshList();
            el('compareView').querySelector(`[data-view="${button.dataset.view}"]`).focus();
        });
        // A column heading sorts the schools by it, and that becomes their order
        el('compareHead').addEventListener('click', event => {
            const button = event.target.closest('[data-sort-by]');
            if (!button) return;
            const key = button.dataset.sortBy;
            const { dir, value } = COMPARE_SORT[key];
            const list = compareEntries.slice().sort((a, b) => {
                const x = value(a), y = value(b);
                if (x === null || x === undefined) return 1;
                if (y === null || y === undefined) return -1;
                const order = typeof x === 'string' ? x.localeCompare(y, I18N.locale) : x - y;
                return dir === 'asc' ? order : -order;
            });
            saveCompareOrder(list);
            compareSort = key;
            refreshList();
            el('compareHead').querySelector(`[data-sort-by="${key}"]`).focus();
            el('compareStatus').textContent = t('Sortert etter {column}', { column: t(COMPARE_COLUMN[key]).toLowerCase() });
        });
        // «Fjern» takes the school off the list (drawn again by the «savedschools» event); the focus goes to the next
        // school's «Fjern», or to the title when it was the last one
        const remove = event => {
            const button = event.target.closest('[data-remove]');
            if (!button) return;
            const entry = compareEntries.find(e => e.key === button.dataset.remove);
            if (!entry) return;
            const index = compareEntries.indexOf(entry);
            const next = compareEntries[index + 1] || compareEntries[index - 1];
            // Kept for «Angre»: which keys were saved, and the whole order
            const order = [...savedSchools()];
            const removed = entry.keys.filter(isSaved);
            removed.forEach(toggleSaved);
            const again = next && document.querySelector(`#compare [data-remove="${CSS.escape(next.key)}"]:not([hidden] *)`);
            if (again && again.offsetParent) again.focus();
            else {
                el('savedTitle').tabIndex = -1;
                el('savedTitle').focus();
            }
            // Figma I7: the school is gone, with «Angre» first
            UiDialog.confirm({
                title: t('{name} er fjernet fra listen', { name: entry.school.name }),
                actions: [
                    { label: t('Angre'), primary: true, onClick: () => {
                        UiDialog.quietly(() => removed.forEach(key => { if (!isSaved(key)) toggleSaved(key); }));
                        setSavedOrder(order);
                        refreshList();
                        el('compareStatus').textContent = t('{name} er tilbake i listen', { name: entry.school.name });
                    } }
                ]
            });
        };
        el('compareBody').addEventListener('click', remove);
        el('compareCards').addEventListener('click', remove);
        bindMove(el('compareBody'), 'tr[data-key]', ['ArrowUp'], ['ArrowDown']);
        bindMove(el('compareCards'), 'li[data-key]', ['ArrowUp', 'ArrowLeft'], ['ArrowDown', 'ArrowRight']);
    }

    // The order changed by hand, in the list (rows) and on the cards alike: the arrow keys on the handle move a
    // school one place; dragging the handle (mouse, pen or finger) moves it where it is let go
    function bindMove(container, itemSelector, earlierKeys, laterKeys) {
        const items = () => [...container.querySelectorAll(itemSelector)];
        container.addEventListener('keydown', event => {
            const handle = event.target.closest('[data-move]');
            const step = earlierKeys.includes(event.key) ? -1 : laterKeys.includes(event.key) ? 1 : 0;
            if (!handle || !step) return;
            event.preventDefault();
            const from = items().indexOf(handle.closest(itemSelector));
            moveCompare(from, from + step);
        });
        container.addEventListener('pointerdown', event => {
            const handle = event.target.closest('[data-move]');
            if (!handle || event.button !== 0) return;
            event.preventDefault();
            const item = handle.closest(itemSelector);
            const from = items().indexOf(item);
            const end = item.parentElement.querySelector(':scope > :not([data-key])');   // «Legg til en skole» stays last
            item.classList.add('is-dragging');
            // Followed on the document: moving the item would make the handle lose a pointer capture. The item goes
            // before the first other one whose middle is after the pointer (row by row, then left to right)
            const follow = move => {
                if (move.pointerId !== event.pointerId) return;
                const before = items().filter(other => other !== item).find(other => {
                    const box = other.getBoundingClientRect();
                    if (move.clientY < box.top) return true;
                    return move.clientY <= box.bottom && move.clientX < box.left + box.width / 2;
                });
                item.parentElement.insertBefore(item, before || end || null);
            };
            const drop = () => {
                document.removeEventListener('pointermove', follow);
                document.removeEventListener('pointerup', drop);
                document.removeEventListener('pointercancel', drop);
                item.classList.remove('is-dragging');
                moveCompare(from, items().indexOf(item));
            };
            document.addEventListener('pointermove', follow);
            document.addEventListener('pointerup', drop);
            document.addEventListener('pointercancel', drop);
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
            ? (state.shared ? sharedEntries() : bySavedOrder(entries.filter(e => e.keys.some(k => saved.has(k)))))
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
        renderCompare(inView);
        if (state.savedOnly) {
            el('savedTitle').textContent = t(state.shared ? 'Delt liste ({count})' : 'Lagrede skoler ({count})', { count: total });
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
        // Screen readers hear the new count once, after a choice; moving the map does not repeat it
        if (announceList) {
            const own = !el('kretsNote').hidden && el('kretsNote').querySelector('.own-school__name');
            el('listStatus').textContent = [own ? `${t('Skolekrets for adressen')}: ${own.textContent}` : '', el('resultsTitle').textContent].filter(Boolean).join('. ');
            announceList = false;
        }
        el('schoolList').innerHTML = visible.map((e, i) => schoolCard(e, ref, i)).join('');
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
        // The card itself does nothing on a click: its name goes to the school page, the pin shows it on the map
        // (or opens the card on phones) and the bookmark saves it, one clear control each
        el('schoolList').querySelectorAll('.school-card__show').forEach(button => {
            button.addEventListener('click', () => showFromCard(button.closest(ITEM).querySelector(CARD), button.closest(ITEM).querySelector(CARD).dataset.key));
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
        fitListToScreen();
    }

    // Wide screens: the list shows only the cards that fit next to the map, with «Vis flere» right under them,
    // so it is as tall as the map; «Vis flere» then adds ten more and the list scrolls on its own
    const wideLayout = window.matchMedia('(min-width: 961px)');
    let fitting = false;
    function fitListToScreen() {
        // Only next to an open map: with the map closed the list is the page, and the page scrolls
        if (fitting || !mapOpen || !wideLayout.matches || state.savedOnly || state.listExpanded) return;
        const list = document.querySelector('.results-list');
        if (list.scrollHeight <= list.clientHeight + 1) return;
        // Room for «Vis flere» under the last card
        const bottom = list.getBoundingClientRect().bottom - 4 * 16;
        const items = [...el('schoolList').children];
        // At least one card, also when the address's own schools above take the room
        const fit = Math.max(1, items.filter(item => item.getBoundingClientRect().bottom <= bottom).length);
        if (fit >= items.length) return;
        fitting = true;
        state.shown = fit;
        refreshList();
        fitting = false;
    }
    // A new window size: count again
    let fitTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => {
            if (state.listExpanded || state.savedOnly || atStart) return;
            state.shown = PAGE_SIZE;
            refreshList();
        }, 200);
    });

    // «Vis på kartet» as a pin next to the bookmark (desktop: the popup on the big map; phones: the card opens)
    function showButtonHtml(key, name) {
        const label = escapeHtml(t('Vis {name} på kartet', { name }));
        return `<button type="button" class="ds-button school-card__show" data-variant="tertiary" data-size="sm" data-icon="true"
            data-show-key="${escapeHtml(key)}" aria-label="${label}" data-tooltip="${label}">${icon('locationPin')}</button>`;
    }

    function schoolCard(entry, ref, index) {
        const school = entry.school;
        const shown = levelsShown(entry);
        const combined = entry.levels.length > 1;
        // Figma 178:12363: the school type is under the icon on the left, so the line under the name is
        // only the owner, the kommune and the distance
        const meta = [];
        if (school.eierform) {
            meta.push(school.eierform === 'privat' && school.profil && school.profil !== 'annen'
                ? t('Privat, {profile}', { profile: t(PROFILE_LABEL[school.profil]).toLowerCase() })
                : t(OWNER_LABEL[school.eierform]));
        }
        meta.push(escapeHtml(school.kommune));
        if (state.address) meta.push(distanceLabel(school));
        const typeLabel = combined ? '1–10' : escapeHtml(t(school.schoolType === 'barneskole' ? 'Barneskole' : 'Ungdomsskole')).replace('skole', '&shy;skole');
        // The address's krets schools are marked in the list only when the card above them is not shown
        // (the saved schools page); otherwise they would be pointed out twice
        const kretsAbove = state.address && !state.savedOnly && !state.address.postnummer;
        const isOwn = !kretsAbove && entry.levels.some(isKretsSchool);
        // The bookmark shows saved when either level's page was saved
        const saveKey = entry.keys.find(isSaved) || entry.key;
        const kretsTag = isOwn
            ? `<span class="school-card__krets"><span>${t('Skolen for adressen')}</span></span>`
            : '';

        // The name is the link to the school page (the main action, as on Digdir's, Nav's and GOV.UK's lists).
        // Next to the bookmark, a pin shows the school on the map; a click anywhere else on the card does the
        // same, as before. The buttons sit beside the card, not in it (no button or link inside another).
        return `
            <li class="school-list__item">
                <div class="ds-card school-card${isOwn ? ' school-card--own' : ''}" data-variant="${isOwn ? 'tinted' : 'default'}"${isOwn ? ' data-color="brand1"' : ''} data-key="${escapeHtml(entry.key)}">
                    <span class="school-card__type">
                        <span class="school-card__badge${combined ? ' school-card__badge--pair' : ''}" aria-hidden="true">${entry.levels.map(level =>
                            `<span class="school-marker score-${scoreCategory(level.color)}">${schoolTypeIcon(level.schoolType)}</span>`).join('')}</span>
                        <span class="school-card__type-label">${typeLabel}</span>
                    </span>
                    <span class="school-card__body">
                        <a class="ds-link school-card__name" href="${schoolUrl(shown[0] || school)}">${escapeHtml(school.name)}</a>
                        ${kretsTag}
                        <span class="school-card__meta">${meta.join(' · ')}</span>
                        ${combined && shown.length > 1 ? combinedStats(entry) : statsLine(shown[0] || school)}
                    </span>
                </div>
                ${showButtonHtml(entry.key, school.name)}
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

    // «Snitt 54,7 ↑» on a background in the result's colour (Figma 178:12363); «Snitt – ?» with a dashed border
    // when there are no results. The arrow says over or under the national average, also for screen readers.
    const SCORE_BANDS = [[55, 'very-high'], [49.31, 'high'], [45, 'low']];
    const scoreBand = avg => (avg === null || avg === undefined ? 'none' : (SCORE_BANDS.find(([min]) => avg >= min) || [0, 'very-low'])[1]);
    function snittBadge(avg, label = t('Snitt')) {
        const band = scoreBand(avg);
        if (band === 'none') return `<span class="school-card__snitt score-badge--none">${label} <span class="school-card__stat-value">–</span> <span aria-hidden="true">?</span><span class="ds-sr-only">${t('Ingen resultater publisert')}</span></span>`;
        const up = band === 'very-high' || band === 'high';
        return `<span class="school-card__snitt score-badge--${band}">${label} <span class="school-card__stat-value">${numberFormat.format(avg)}</span> <span aria-hidden="true">${up ? '↑' : '↓'}</span><span class="ds-sr-only">${t(up ? 'Over snittet' : 'Under snittet')}</span></span>`;
    }

    // ↑ or ↓ after Trivsel and Mobbing: over or under the national average, compared at the shown precision
    // (one decimal), in the text colour like the arrow on «Snitt».
    // Trivsel has no national value in the list data: 4,1 on both 7. and 10. trinn in 2025-26 (Udir).
    const TRIVSEL_NATIONAL = 4.1;
    function trendArrow(value, national) {
        if (value === null || value === undefined || national === null || national === undefined) return '';
        const diff = Math.round(value * 10) - Math.round(national * 10);
        if (diff === 0) return ` <span class="ds-sr-only">${t('Som snittet')}</span>`;
        return ` <span class="school-card__trend" aria-hidden="true">${diff > 0 ? '↑' : '↓'}</span><span class="ds-sr-only">${t(diff > 0 ? 'Over snittet' : 'Under snittet')}</span>`;
    }

    function statsLine(school) {
        const triv = school.trivsel ? school.trivsel.score : null;
        const mob = school.mobbing ? school.mobbing.share : null;
        return `<span class="school-card__stats">${snittBadge(school.hasData ? school.average : null)}${
            statPair(t('Trivsel'), triv === null ? '–' : numberFormat.format(triv) + trendArrow(triv, TRIVSEL_NATIONAL))}${
            statPair(t('Mobbing'), mob === null ? '–' : formatPercent(mob) + trendArrow(mob, school.mobbing.national))}</span>`;
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
        const mobNational = meanOf(levelsShown(entry).map(l => (l.mobbing ? l.mobbing.national : null)));
        return `<span class="school-card__stats">${snittBadge(avg)}${
            statPair(t('Trivsel'), triv === null ? '–' : fmt(triv) + trendArrow(triv, TRIVSEL_NATIONAL))}${
            statPair(t('Mobbing'), mob === null ? '–' : formatPercent(mob) + trendArrow(mob, mobNational))}</span>${levels}`;
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
        leaveStart();
        map.setView([entry.school.lat, entry.school.lng], 15, { animate: false });
        cluster.zoomToShowLayer(entry.marker, () => entry.marker.openPopup());
    }

    // Zoom to a school (from the list or the name search). If the filters hide it,
    // clear them first so the marker exists on the map.
    function showSchool(key, fromList = false) {
        const entry = entryFor(key);
        if (!entry) return;
        leaveStart();
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
            // On the pin button: the card itself is not a button any more (its name is a link)
            const pin = card.closest(ITEM).querySelector('.school-card__show');
            if (!pin) return;
            pin.setAttribute('aria-expanded', 'false');
            pin.setAttribute('aria-controls', details.id);
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
        item.querySelector('.school-card__show')?.setAttribute('aria-expanded', 'true');
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
            item.querySelector('.school-card__show')?.setAttribute('aria-expanded', 'false');
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
        baseMapLayer().addTo(miniMap);
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
                // The searched address (if any) stays; the school opens on the map
                input.value = state.address ? state.address.label : '';
                input.blur();
                showSchool(result.key);
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
        addMapTools();
    }

    // Wide screens: the list and the map fill the screen from where the results start (styles.css, «Full-height
    // split view»). Where that is changes with what is above (the filter chips, the saved bar, the notices),
    // so it is measured again whenever one of those changes size; the map is told when its own size changes.
    function fitResults() {
        const grid = el('resultsGrid');
        const set = () => document.documentElement.style.setProperty('--results-top',
            `${Math.round(grid.getBoundingClientRect().top + window.scrollY)}px`);
        set();
        if (typeof ResizeObserver === 'undefined') return;
        const above = new ResizeObserver(set);
        for (let node = grid; node && node !== document.body; node = node.parentElement) {
            for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) above.observe(sibling);
        }
        new ResizeObserver(() => map.invalidateSize()).observe(el('resultsMap'));
    }

    // The map's buttons in the lower right corner, the same as on /kart: «Min posisjon» (where the browser
    // can give it) and zoom in and out, Designsystemet buttons with a tooltip
    function addMapTools() {
        const control = L.control({ position: 'bottomright' });
        control.onAdd = () => {
            const box = L.DomUtil.create('div', 'leaflet-control map-tools map-tools--results');
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', t('Kartverktøy'));
            const button = (id, name, label) => `<button type="button" class="ds-button map-tool" data-variant="secondary" data-icon data-tool="${id}"
                aria-label="${escapeHtml(t(label))}" data-tooltip="${escapeHtml(t(label))}" data-placement="left">${icon(name)}</button>`;
            box.innerHTML = (canLocate() ? button('locate', 'target', 'Min posisjon') : '')
                + button('in', 'plus', 'Zoom inn') + button('out', 'minus', 'Zoom ut');
            box.addEventListener('click', event => {
                const tool = event.target.closest('[data-tool]');
                if (!tool) return;
                if (tool.dataset.tool === 'locate') locate();
                else if (tool.dataset.tool === 'in') map.zoomIn();
                else map.zoomOut();
            });
            L.DomEvent.disableClickPropagation(box);
            L.DomEvent.disableScrollPropagation(box);
            return box;
        };
        control.addTo(map);
    }

    // Why "Din posisjon" did not work, as Designsystemet's validation message under the address field:
    // <ds-field> links it to the input and marks the input invalid while it is there
    function showLocateError(text) {
        const field = el('addressField');
        field.querySelectorAll(':scope > [data-field="validation"]').forEach(node => node.remove());
        const old = document.getElementById('locateAlert');
        if (old) old.remove();
        if (!text) return;
        const message = document.createElement('p');
        message.className = 'ds-validation-message';
        message.dataset.field = 'validation';
        message.dataset.size = 'sm';
        message.setAttribute('role', 'status');
        message.textContent = text;
        field.append(message);
    }

    function showLocateDenied() {
        showLocateError(null);
        const alert = document.createElement('div');
        alert.className = 'ds-alert locate-alert';
        alert.id = 'locateAlert';
        alert.dataset.color = 'warning';
        alert.setAttribute('role', 'status');
        alert.innerHTML = `<h2 class="ds-heading" data-size="2xs">${t('Vi fikk ikke bruke posisjonen din')}</h2>
            <p class="ds-paragraph">${t('Nettleseren har blokkert posisjon. Skriv adressen i stedet, eller tillat posisjon i innstillingene og prøv igjen. Vi lagrer aldri posisjonen din.')}</p>
            <p class="ds-paragraph locate-alert__links">
                <button type="button" class="ds-link locate-alert__link" data-locate-help>${t('Slik tillater du posisjon')}</button>
                <button type="button" class="ds-link locate-alert__link" data-locate-retry>${t('Prøv igjen')}</button>
            </p>`;
        document.querySelector('.search-bar').after(alert);
        alert.querySelector('[data-locate-retry]').addEventListener('click', locate);
        alert.querySelector('[data-locate-help]').addEventListener('click', openLocateHelp);
    }

    // «Slik tillater du posisjon» (Figma I19): the steps for a PC and an iPhone
    function openLocateHelp() {
        UiDialog.open({
            title: t('Slik tillater du posisjon'),
            html: `<p class="ui-label">${t('På PC (Chrome, Edge)')}</p>
                <ul class="ds-list">
                    <li>${t('Klikk på ikonet til venstre for nettadressen')}</li>
                    <li>${t('Velg «Posisjon» → «Tillat»')}</li>
                    <li>${t('Last inn siden på nytt')}</li>
                </ul>
                <p class="ui-label">${t('På iPhone (Safari)')}</p>
                <ul class="ds-list"><li>${t('Innstillinger → Personvern og sikkerhet → Stedstjenester → Safari-nettsteder → «Når appen er i bruk»')}</li></ul>`,
            // Only the steps and the close button: «Prøv igjen» and the address are on the page, under the search
        });
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
            // Not allowed (Figma 332:29820): a warning under the search, with the way to allow it and «Prøv igjen»
            if (error.code === error.PERMISSION_DENIED && window.UiDialog) {
                showLocateDenied();
                return;
            }
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

    // The suggestions in fixed groups (Figma 10.1, F1 «Forslag», as on feature/sok-rekkefolge): «Din posisjon», then
    // schools, addresses, and kommuner and postnumre, each group with its own «Ingen treff», and a line on what a
    // school and an address lead to. Addresses and postnumre come from Kartverket a moment later («Søker …» until then).
    function showSearchItems(query, list, local, places = [], failed = false, pending = false) {
        const schools = local.filter(item => item.kind === 'school');
        const addresses = places.filter(item => !item.postnummer).slice(0, schools.length ? 3 : 5);
        const areas = [...local.filter(item => item.kind === 'kommune'), ...places.filter(item => item.postnummer)];
        searchItems = [...schools, ...addresses, ...areas];
        const svg = markup => markup.replace('<svg ', '<svg class="ds-icon" ');
        const row = (i, label, iconHtml, name, sub) => `<u-option value="${i}" label="${escapeHtml(label)}" class="search-option">
            ${iconHtml}<span class="search-option__text"><span class="search-result-name">${name}</span><span class="search-result-kommune">${sub}</span></span></u-option>`;
        const option = (item, i) => {
            if (item.kind === 'school') {
                const levels = schoolsData.filter(s => s.name === item.school.name && s.kommune === item.school.kommune);
                const type = levels.length > 1 ? t('Barne- og ungdomsskole (1.–10. trinn)') : (SCHOOL_TYPE_LABEL[item.school.schoolType] || item.school.schoolType);
                return row(i, `${item.school.name}, ${item.school.kommune}`, svg(HAT_SCHOOL_ICON), highlightMatch(item.school.name, query), `${escapeHtml(item.school.kommune)} · ${type}`);
            }
            if (item.kind === 'kommune') return row(i, item.kommune, icon('buildings3'), highlightMatch(item.kommune, query), t('Kommune'));
            if (item.postnummer) return row(i, item.label, icon('buildings3'), escapeHtml(item.label), `${t('Postnummer')}${item.kommune ? ` · ${escapeHtml(item.kommune)}` : ''}`);
            const cut = item.label.lastIndexOf(', ');
            return row(i, item.label, svg(PIN_ICON), escapeHtml(cut > 0 ? item.label.slice(0, cut) : item.label), escapeHtml(cut > 0 ? item.label.slice(cut + 2) : ''));
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
            + `<p class="search-group__hint" aria-hidden="true">${t('Skole: viser skolen på kartet')} · ${t('Adresse: viser skolekretsen og skolene i nærheten')}</p>`;
        openSuggestions(list, 'addressSearch');
    }

    // A kommune from the search works as the kommune filter: the map shows the whole kommune
    function chooseKommune(kommune) {
        state.kommune = kommune;
        el('kommuneFilter').value = kommune;
        clearAddressSearch();
        applyFilters();
        fitToFiltered();
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
        leaveStart();
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
        fitAddressAndNearest(result);
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

    // The address with the nearest schools in view: in a town zoom 14 holds several, in the countryside the nearest
    // can be 10 km away, and the list (the schools in view) would be empty. The three nearest that pass the
    // filters, up to 50 km, decide the view; never closer than zoom 14.
    function fitAddressAndNearest(result) {
        const here = L.latLng(result.lat, result.lng);
        const nearest = entries
            .filter(entry => entry.school.lat && entry.school.lng && passes(entry))
            .map(entry => ({ entry, metres: here.distanceTo([entry.school.lat, entry.school.lng]) }))
            .filter(hit => hit.metres <= 50000)
            .sort((a, b) => a.metres - b.metres)
            .slice(0, 3);
        if (!nearest.length) {
            map.setView(here, 14);
            return;
        }
        const bounds = L.latLngBounds([here, ...nearest.map(hit => [hit.entry.school.lat, hit.entry.school.lng])]);
        map.fitBounds(bounds, { maxZoom: 14, padding: [40, 40], animate: false });
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
    function loadKretser() {
        if (!kretsData) {
            kretsData = fetch('static/js/skolekretser.json?v=3')
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null);
        }
        return kretsData;
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
        if (kretsLegend) kretsLegend.getContainer().hidden = false;
    }

    function clearKrets() {
        state.krets = null;
        if (kretsLayer) {
            kretsLayer.remove();
            kretsLayer = null;
        }
        if (kretsLegend) {
            kretsLegend.getContainer().hidden = true;
            kretsLegend.setOpen(false);
        }
    }

    // Distance is not the same as skolekrets: say so whenever the list is sorted from an address.
    // Where a kommune publishes open skolekrets data, show the exact krets as a pilot.
    function renderKretsNote() {
        const note = el('kretsNote');
        // Not on the saved schools page, which is only the list and the map. Not for a postnummer either:
        // it spans several kretser, so neither the krets nor the nearest schools from its middle would be right
        note.hidden = !state.address || state.savedOnly || Boolean(state.address.postnummer);
        if (note.hidden) return;
        const kommune = state.address.kommune;
        // Our page on how to find the krets (the link says so; it is not the kommune's own page)
        const check = `<a class="ds-link" href="${I18N.href('om-skolekrets')}">${t('Slik finner du skolekretsen hos kommunen')}</a>`;
        const krets = state.krets;
        const own = krets ? krets.hits
            .map(k => {
                const entry = k.school && entries.find(e => e.levels.some(l => l.name === k.school && sameKommune(l.kommune, k.kommune) && l.schoolType === k.level));
                return { krets: k, entry, level: entry && entry.levels.find(l => l.schoolType === k.level) };
            })
            .filter(hit => hit.entry || hit.krets.school) : [];

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
            const where = `<p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${I18N.href('om-skolekrets')}#kommuner">${t('Se hvilke kommuner vi kan vise skolekretsen for, og hvor dataene kommer fra')}</a></p>`;
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
                    ${cards(nearest)}
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
                    <!-- Short: what the boundaries are worth, this kommune's own note, the source, where to check -->
                    <p class="ds-paragraph" data-size="sm">${t('Grensene er veiledende og kan avvike fra kommunens gjeldende grenser. Det er kommunen som bestemmer skoleplass.')}${krets.info.caveat ? ` ${escapeHtml(t(krets.info.caveat))}` : ''}</p>
                    <p class="ds-paragraph" data-size="sm">${t('Kilde:')} <a class="ds-link" href="${escapeHtml(safeUrl(krets.info.sourceUrl))}" target="_blank" rel="noopener">${escapeHtml(t(krets.info.source))}</a>.
                        <a class="ds-link" href="${I18N.href('om-skolekrets')}#kommuner">${t('Om skolekretsdataene')}</a></p>
                    ${kommune === 'Oslo' ? `<p class="ds-paragraph" data-size="sm">${t('Slå opp skolekretsen hos {kommune} kommune', { kommune: 'Oslo' })}:
                        <a class="ds-link" href="https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-barneskole/" target="_blank" rel="noopener">${t('Finn barneskole')}${icon('externalLink')}</a> ·
                        <a class="ds-link" href="https://www.oslo.kommune.no/skole-og-utdanning/skoleoversikt-og-skolekrets/skolekrets-ungdomsskole/" target="_blank" rel="noopener">${t('Finn ungdomsskole')}${icon('externalLink')}</a></p>` : ''}
                    ${finnHtml(own)}
                </div>
                ${cards(own)}
            </section>`;
        }

        // Housing search on Finn.no for each postnummer in the barneskolekrets (or the krets found): helper
        // information, so it is in the «?» popover with the rest about the krets, not under the cards
        function finnHtml(hits) {
            const krets = (hits.find(h => h.krets.level === 'barneskole') || hits[0] || {}).krets;
            const numbers = (krets && krets.postnummer) || [];
            if (!numbers.length) return '';
            return `<p class="ds-paragraph own-schools__finn" data-size="sm">${t('Boligsøk på Finn.no for postnumrene i skolekretsen:')}
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

        // Barneskole and ungdomsskole for the address in one card, as two rows with a line between them;
        // one school is a card on its own. Each row still shows its school on the map and has its bookmark.
        function cards(hits) {
            const rows = hits.map(card).join('');
            return hits.length > 1
                ? `<div class="ds-card own-schools__group">${rows}</div>`
                : rows;
        }

        // A card for one school: the krets name only when it comes from skolekrets data
        function card({ krets: k, entry, level }, index) {
            // The krets school is not in our data (too small to have published results): name only
            if (!entry) return `
                <div class="own-school-item">
                    <div class="ds-card school-card own-school">
                        <span class="school-card__type">
                            <span class="school-card__badge" aria-hidden="true"><span class="school-marker score-none">${schoolTypeIcon(k.level)}</span></span>
                            <span class="school-card__type-label">${t(k.level === 'barneskole' ? 'Barneskole' : 'Ungdomsskole')}</span>
                        </span>
                        <span class="school-card__body">
                            <span class="school-card__name">${escapeHtml(k.school)}</span>
                            <span class="school-card__meta">${t('({name} skolekrets)', { name: escapeHtml(k.name) }).replace(/^\(|\)$/g, '')}</span>
                            <span class="school-card__meta">${t('Skolen har ingen offentlige resultater og er derfor ikke med i lista.')}</span>
                            ${splitNote(k)}
                        </span>
                    </div>
                </div>`;
            const school = level || entry.school;
            const key = schoolKey(school);
            const meta = [SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType,
                          distanceLabel(school),
                          k.name ? t('({name} skolekrets)', { name: escapeHtml(k.name) }).replace(/^\(|\)$/g, '') : null].filter(Boolean);
            // Grey until picked; the whole card shows the school on the map (like the list cards), the
            // bookmark sits next to it, and the school page is one click further, in the popup
            return `
                <div class="own-school-item">
                    <div class="ds-card school-card own-school" data-show="${escapeHtml(key)}">
                        <span class="school-card__type">
                            <span class="school-card__badge" aria-hidden="true"><span class="school-marker score-${scoreCategory(school.color)}">${schoolTypeIcon(school.schoolType)}</span></span>
                            <span class="school-card__type-label">${escapeHtml(t(school.schoolType === 'barneskole' ? 'Barneskole' : 'Ungdomsskole'))}</span>
                        </span>
                        <span class="school-card__body">
                            <a class="ds-link school-card__name" href="${schoolUrl(school)}">${escapeHtml(school.name)}</a>
                            <span class="school-card__meta">${meta.join(' · ')}</span>
                            ${statsLine(school)}
                        </span>
                    </div>
                    ${showButtonHtml(key, school.name)}
                    ${saveButtonHtml(key, 'own-school__fav')}
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
            // Only the pin acts (the card itself is not clickable, as in the list)
            const pin = event.target.closest('.school-card__show');
            if (!pin) return;
            const card = pin.closest(ITEM).querySelector(CARD);
            showFromCard(card, card.dataset.show);
        });
    }

    // ── The map: closed at first on wide screens, opened by «Vis kart» or a school's pin ──────────────
    // Remembered for this visit (sessionStorage), so going back from a school page keeps it as it was
    const MAP_OPEN_KEY = 'skolekartet.kartApen';
    let mapOpen = false;
    function setMapOpen(open, recount = true) {
        mapOpen = open;
        el('resultsGrid').classList.toggle('is-map-closed', !open);
        try { sessionStorage.setItem(MAP_OPEN_KEY, open ? '1' : '0'); } catch (_) { /* storage blocked */ }
        map.invalidateSize();
        if (recount && !state.listExpanded && !atStart) {
            state.shown = PAGE_SIZE;
            refreshList();
        }
    }

    function bindMapOpen() {
        let stored = null;
        try { stored = sessionStorage.getItem(MAP_OPEN_KEY); } catch (_) { /* storage blocked */ }
        setMapOpen(stored === '1', false);
        el('resultsMapCard').addEventListener('click', event => {
            if (!event.target.closest('[data-open-map]')) return;
            setMapOpen(true);
            el('resultsMap').querySelector('.map-collapse button').focus({ preventScroll: true });
        });
        // › in the map's upper left corner folds it away again
        const control = L.control({ position: 'topleft' });
        control.onAdd = () => {
            const box = L.DomUtil.create('div', 'leaflet-control map-collapse');
            box.innerHTML = `<button type="button" class="ds-button" data-variant="secondary" data-size="sm" aria-controls="resultsMap">${icon('chevronRight')}<span>${t('Skjul kartet')}</span></button>`;
            box.firstElementChild.addEventListener('click', () => {
                setMapOpen(false);
                el('resultsMapCard').querySelector('.results-map-card__open').focus();
            });
            L.DomEvent.disableClickPropagation(box);
            return box;
        };
        control.addTo(map);
    }

    // The pin on a card: phones open the card under itself (with its small map), wider screens show the school on
    // the big map and mark the card as the one shown
    function showFromCard(card, key) {
        if (phoneLayout.matches) {
            toggleCard(card);
            return;
        }
        if (!mapOpen) {
            setMapOpen(true);
            // The list was drawn again for the narrower column: the same card, new element
            card = document.querySelector(`.school-card[data-key="${CSS.escape(key)}"], .own-school[data-show="${CSS.escape(key)}"]`) || card;
        }
        document.querySelectorAll('.own-school[aria-current], .school-card[aria-current]').forEach(c => c.removeAttribute('aria-current'));
        card.setAttribute('aria-current', 'true');
        showSchool(key, true);
    }

    return { init, showSchool };
})();

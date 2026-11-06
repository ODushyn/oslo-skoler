// The map page (kart): a full map with layers and tools, as in the kommunes' own map services.
// Layers: barneskoler and ungdomsskoler (our data), videregående skoler (Udir), skolekretser where a kommune has published them as open data,
// bydeler in Oslo (OpenStreetMap), kommuner and grunnkretser (Kartverket and SSB, open). Tools: my position, draw, measure distance and area,
// remove the drawings, change the background map (OpenFreeMap or Kartverket's topographic map), zoom.
// A searched address shows its bydel (Oslo) and its skolekretser where the kommune has published them.
// The map's place is kept in the address (#lat,lng,zoom), so a link opens the same view.
(async function () {
    const MAX_ZOOM = 19;
    const BASE_MAPS = {
        openfreemap: baseMapLayer,
        // Kartverket's topographic map (CC BY 4.0)
        topo: () => L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png', {
            maxZoom: 18,
            attribution: '<a href="https://www.kartverket.no/" target="_blank" rel="noopener">&copy; Kartverket</a>'
        })
    };
    // Boundaries as images from Geonorge's open map services (Kartverket: kommuner; SSB: grunnkretser)
    const WMS = {
        kommuner: () => L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.adm_enheter2', {
            layers: 'kommuner', format: 'image/png', transparent: true, zIndex: 5,
            attribution: '<a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>'
        }),
        grunnkretser: () => L.tileLayer.wms('https://wms.geonorge.no/skwms1/wms.grunnkretser', {
            layers: 'Grunnkretser', format: 'image/png', transparent: true, zIndex: 6, minZoom: 11,
            attribution: '<a href="https://www.ssb.no/" target="_blank" rel="noopener">SSB</a>'
        })
    };
    const el = id => document.getElementById(id);

    // Icons in the buttons and the layer list (Aksel, as on the rest of the site)
    document.querySelectorAll('[data-aksel]').forEach(node => node.insertAdjacentHTML('afterbegin', icon(node.dataset.aksel)));
    // Videregående skoler have no results here, so they get one colour of their own and the book icon
    const VGS_MARKER = `<span class="school-marker vgs-marker">${icon('openBook', 'vgs-icon')}</span>`;
    document.querySelectorAll('[data-type-icon]').forEach(span => {
        span.innerHTML = span.dataset.typeIcon === 'videregaende' ? VGS_MARKER : `<span class="school-marker score-none">${schoolTypeIcon(span.dataset.typeIcon)}</span>`;
    });

    // ── The map, where the address says, else Oslo ──────────────────────
    const [lat, lng, zoom] = (location.hash.slice(1).split(',').map(Number));
    const start = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : [59.9139, 10.7522];
    const map = L.map('toolMap', { zoomControl: false, maxZoom: MAX_ZOOM, zoomSnap: 0.5 })
        .setView(start, Number.isFinite(zoom) ? zoom : 12);
    map.attributionControl.setPrefix(false);
    let baseName = 'openfreemap';
    let baseLayer = BASE_MAPS[baseName]().addTo(map);
    map.on('moveend', () => {
        const c = map.getCenter();
        history.replaceState(history.state, '', `#${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
    });

    // ── Schools ──────────────────────────────────────────────────────────
    let data;
    try {
        data = await fetch(I18N.url('static/js/school-data.json'), { cache: 'no-cache' }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
    } catch (error) {
        showHint(t('Kunne ikke laste skolene'), t('Sjekk nettforbindelsen og prøv igjen.'), { done: false });
        data = { schools: [] };
    }
    window.SCHOOL_DATA_YEAR = data.metadata && data.metadata.currentYear;

    // Clusters coloured by their schools' results, as on the main map
    const clusterIcon = cluster => {
        const colors = cluster.getAllChildMarkers().map(m => m.options.fillColor).filter(c => c && c !== '#999999');
        const value = { '#d73027': 42, '#fc8d59': 47, '#91cf60': 52, '#1a9850': 57 };
        const avg = colors.length ? colors.reduce((sum, c) => sum + (value[c] || 50), 0) / colors.length : null;
        const color = avg === null ? '#999999' : avg < 45 ? '#d73027' : avg < 50 ? '#fc8d59' : avg < 55 ? '#91cf60' : '#1a9850';
        const count = cluster.getChildCount();
        return L.divIcon({
            html: `<span class="school-cluster score-${scoreCategory(color)}">${count}</span>`,
            className: `school-cluster-icon school-cluster-${count < 10 ? 'small' : count < 100 ? 'medium' : 'large'}`,
            iconSize: new L.Point(40, 40)
        });
    };
    const schoolLayers = {};
    ['barneskole', 'ungdomsskole'].forEach(type => {
        const group = L.markerClusterGroup({ disableClusteringAtZoom: 13, maxClusterRadius: 50, showCoverageOnHover: false, iconCreateFunction: clusterIcon });
        group.addLayers(data.schools.filter(s => s.schoolType === type && s.lat && s.lng).map(schoolMarker));
        schoolLayers[type] = group.addTo(map);
    });

    function schoolMarker(school) {
        const size = school.schoolType === 'ungdomsskole' ? 40 : 30;
        const marker = L.marker([school.lat, school.lng], {
            icon: L.divIcon({
                html: `<span class="school-marker score-${scoreCategory(school.color)}">${schoolTypeIcon(school.schoolType)}</span>`,
                className: 'school-marker-icon', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2]
            }),
            title: `${school.name}, ${SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType}`,
            fillColor: school.color
        });
        return marker.bindPopup(() => schoolPopup(school), { maxWidth: 300 });
    }

    function schoolPopup(school) {
        const facts = [
            `<strong>${t('Snitt')}</strong> ${school.hasData ? formatDecimal(school.average) : '–'}`,
            `<strong>${t('Trivsel')}</strong> ${school.trivsel ? formatDecimal(school.trivsel.score) : '–'}`,
            `<strong>${t('Mobbing')}</strong> ${school.mobbing ? formatPercent(school.mobbing.share) : '–'}`
        ].join(' · ');
        return `<div class="popup-school">
                <h3 class="ds-heading popup-name" data-size="2xs">${escapeHtml(school.name)}</h3>
                <p class="ds-paragraph popup-kommune" data-size="xs">${escapeHtml(school.kommune)} · ${SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType}</p>
                <p class="ds-paragraph popup-stats" data-size="sm">${facts}</p>
                <p class="ds-paragraph popup-more" data-size="sm"><a class="ds-link popup-more__link" href="${schoolUrl(school)}">${t('Les mer om skolen')}${icon('arrowRight')}</a></p>
            </div>`;
    }

    // Data files, each fetched the first time a layer or the address search needs it
    const dataFiles = {};
    const loadData = (file, empty) => dataFiles[file] || (dataFiles[file] = fetch(I18N.url(`static/js/${file}`)).then(r => r.json()).catch(() => empty));
    const loadVgs = () => loadData('videregaende.json', { schools: [] });
    const loadKretser = () => loadData('skolekretser.json', { kommuner: {}, kretser: [] });
    const loadBydeler = () => loadData('bydeler-oslo.json', { bydeler: [] });

    // Videregående skoler from Udir's register (videregaende.py)
    async function vgsLayer() {
        const vgs = await loadVgs();
        const group = L.markerClusterGroup({
            disableClusteringAtZoom: 13, maxClusterRadius: 50, showCoverageOnHover: false,
            iconCreateFunction: cluster => L.divIcon({
                html: `<span class="school-cluster vgs-marker">${cluster.getChildCount()}</span>`,
                className: 'school-cluster-icon school-cluster-small', iconSize: new L.Point(40, 40)
            })
        });
        group.addLayers(vgs.schools.map(s => L.marker([s.lat, s.lng], {
            icon: L.divIcon({ html: VGS_MARKER, className: 'school-marker-icon', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -17] }),
            title: `${s.name}, ${t('Videregående skole')}`
        }).bindPopup(() => vgsPopup(s), { maxWidth: 300 })));
        return group;
    }

    function vgsPopup(school) {
        const website = school.url && /^https?:\/\//.test(school.url)
            ? `<p class="ds-paragraph popup-more" data-size="sm"><a class="ds-link popup-more__link" href="${escapeHtml(school.url)}" target="_blank" rel="noopener">${t('Skolens nettside')}${icon('externalLink')}</a></p>`
            : '';
        return `<div class="popup-school">
                <h3 class="ds-heading popup-name" data-size="2xs">${escapeHtml(school.name)}</h3>
                <p class="ds-paragraph popup-kommune" data-size="xs">${escapeHtml(school.kommune)} · ${t('Videregående skole')} · ${t(OWNER_LABEL[school.owner])}</p>
                ${website}
            </div>`;
    }
    const SCHOOL_DATA = { videregaende: vgsLayer };

    // ── Boundaries ───────────────────────────────────────────────────────
    const boundaryLayers = {};
    async function kretsLayer() {
        const kretser = await loadKretser();
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        return L.layerGroup(kretser.kretser.map(k => L.polygon(
            k.rings.map(ring => ring.map(([x, y]) => [y, x])),
            { color, weight: 2, dashArray: k.level === 'barneskole' ? '6 4' : '2 6', fillOpacity: k.level === 'barneskole' ? 0.06 : 0 }
        ).bindTooltip(`${escapeHtml(k.name || k.school || '')} (${escapeHtml(k.kommune)})`, { sticky: true })));
    }

    // Bydeler in Oslo from OpenStreetMap (bydeler.py). Each name stands at a point bydeler.py chose inside the bydel,
    // on land, since the boundaries reach out into the fjord.
    async function bydelLayer() {
        const data = await loadBydeler();
        return L.layerGroup(data.bydeler.flatMap(b => [
            L.polygon(b.rings.map(ring => ring.map(([x, y]) => [y, x])),
                { color: '#3b4a5a', weight: 2, fill: false, interactive: false }),
            L.tooltip({ permanent: true, direction: 'center', className: 'map-bydel-label' })
                .setLatLng([b.label[1], b.label[0]])
                .setContent(b.bydel ? escapeHtml(b.name) : `${escapeHtml(b.name)} (${t('ikke bydel')})`)
        ]));
    }

    // OpenFreeMap already credits OpenStreetMap; Kartverket's map does not, so the bydeler add the credit there
    const OSM_CREDIT = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>';
    let osmCredited = false;
    function creditOsm() {
        const needed = baseName !== 'openfreemap' && Boolean(boundaryLayers.bydeler) && map.hasLayer(boundaryLayers.bydeler);
        if (needed === osmCredited) return;
        if (needed) map.attributionControl.addAttribution(OSM_CREDIT); else map.attributionControl.removeAttribution(OSM_CREDIT);
        osmCredited = needed;
    }
    // Zoomed far out the bydel names would cover each other, so they show from zoom 10
    const markFar = () => map.getContainer().classList.toggle('map-far', map.getZoom() < 10);
    map.on('zoomend', markFar);
    markFar();

    const BOUNDARY_DATA = { skolekretser: kretsLayer, bydeler: bydelLayer };

    async function setLayer(name, on) {
        if (!schoolLayers[name] && SCHOOL_DATA[name]) schoolLayers[name] = await SCHOOL_DATA[name]();
        if (schoolLayers[name]) {
            if (on) schoolLayers[name].addTo(map); else schoolLayers[name].remove();
            return;
        }
        if (!boundaryLayers[name]) boundaryLayers[name] = BOUNDARY_DATA[name] ? await BOUNDARY_DATA[name]() : WMS[name]();
        if (on) boundaryLayers[name].addTo(map); else boundaryLayers[name].remove();
        creditOsm();
    }

    document.querySelectorAll('[data-layer]').forEach(input => input.addEventListener('change', () => setLayer(input.dataset.layer, input.checked)));

    // The layer panel opens under its button; Esc or the close button closes it
    // The skolekrets layer names the kommuner in skolekretser.json, read when the panel first opens
    let kretsLabelDone = false;
    async function labelKretsLayer() {
        kretsLabelDone = true;
        const kommuner = Object.keys((await loadKretser()).kommuner)
            .sort((a, b) => (b === 'Oslo') - (a === 'Oslo'));
        if (!kommuner.length) return;
        el('kretsLayerLabel').textContent = t('Skolekretser ({kommuner})', { kommuner: kommuner.join(', ') });
        el('kretsOsloNote').hidden = kommuner.includes('Oslo');
    }
    const setLayersPanel = open => {
        if (open && !kretsLabelDone) labelKretsLayer();
        el('layersPanel').hidden = !open;
        el('layersToggle').setAttribute('aria-expanded', String(open));
        if (open) el('layersPanel').querySelector('input').focus();
    };
    el('layersToggle').addEventListener('click', () => setLayersPanel(el('layersPanel').hidden));
    el('layersClose').addEventListener('click', () => { setLayersPanel(false); el('layersToggle').focus(); });
    el('layersPanel').addEventListener('keydown', event => {
        if (event.key === 'Escape') { setLayersPanel(false); el('layersToggle').focus(); }
    });

    // ── Search: like the front page, one field for addresses, schools, kommuner and postnummer ──
    // Schools (ours and the videregående) and kommuner come from our data as soon as two letters are typed;
    // a postnummer and addresses come from Kartverket a moment later. The empty field offers "Din posisjon".
    let searchTimer = null;
    let searchAbort = null;
    let searchMarker = null;
    let postalLayer = null;
    let searchItems = [];
    const input = el('mapSearch');
    const results = el('mapSearchResults');
    const canLocate = () => 'geolocation' in navigator;
    const kind = label => ` <span>${t(label)}</span>`;

    function showResults(items, { failed = false, empty = false } = {}) {
        searchItems = items;
        const message = text => `<li class="map-search__empty">${t(text)}</li>`;
        results.innerHTML = items.map((item, i) => {
            const text = item.kind === 'locate' ? `${TARGET_ICON}${escapeHtml(t('Din posisjon'))}`
                : item.kind === 'kommune' ? `${escapeHtml(item.kommune)}${kind('Kommune')}`
                : `${escapeHtml(item.label)}${item.sub ? ` <span>${escapeHtml(item.sub)}</span>` : item.postnummer ? kind('Postnummer') : ''}`;
            return `<li><button type="button" class="map-search__item" data-i="${i}">${text}</button></li>`;
        }).join('') + (failed ? message('Adressesøket er ikke tilgjengelig akkurat nå') : empty && !items.length ? message('Ingen treff') : '');
        results.hidden = !results.innerHTML;
        input.setAttribute('aria-expanded', String(!results.hidden));
    }

    // Schools by name (a 1–10 skole is one hit), videregående skoler and kommuner, best matches first
    function localMatches(query) {
        const q = query.toLocaleLowerCase('nb');
        const has = name => name.toLocaleLowerCase('nb').includes(q);
        const starts = name => (name.toLocaleLowerCase('nb').startsWith(q) ? 0 : 1);
        const seen = new Set();
        const schools = data.schools.filter(s => s.lat && has(s.name) && !seen.has(`${s.name}|${s.kommune}`) && seen.add(`${s.name}|${s.kommune}`))
            .slice(0, 5)
            .map(s => {
                const both = data.schools.filter(o => o.name === s.name && o.kommune === s.kommune).length > 1;
                const type = both ? t('Barne- og ungdomsskole (1.–10. trinn)') : (SCHOOL_TYPE_LABEL[s.schoolType] || s.schoolType);
                return { kind: 'school', label: s.name, sub: `${s.kommune} · ${type}`, lat: s.lat, lng: s.lng };
            });
        const kommuner = [...new Set(data.schools.map(s => s.kommune))].filter(has)
            .sort((a, b) => starts(a) - starts(b) || a.localeCompare(b, 'nb'))
            .slice(0, 3)
            .map(kommune => ({ kind: 'kommune', kommune }));
        return [...kommuner, ...schools];
    }

    // With a digit in it the query is most likely an address or a postnummer, so those come first
    const ordered = (query, local, places) => (/\d/.test(query) ? [...places, ...local] : [...local, ...places]);

    function clearSearchResult() {
        if (searchMarker) searchMarker.remove();
        searchMarker = null;
        if (postalLayer) postalLayer.remove();
        postalLayer = null;
        addressKretser.clearLayers();
    }

    function placeMarker(lat, lng) {
        searchMarker = L.circleMarker([lat, lng], { radius: 8, color: '#2a2859', weight: 3, fillColor: '#fff', fillOpacity: 1 }).addTo(map);
        return searchMarker;
    }

    async function choose(item) {
        showResults([]);
        if (item.kind === 'locate') {
            input.value = '';
            locate();
            return;
        }
        input.value = item.kind === 'kommune' ? item.kommune : item.label;
        clearSearchResult();
        if (item.kind === 'kommune') {
            // The whole kommune: the map fits its schools
            const points = data.schools.filter(s => s.kommune === item.kommune && s.lat).map(s => [s.lat, s.lng]);
            if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
        } else if (item.kind === 'school') {
            placeMarker(item.lat, item.lng);
            map.setView([item.lat, item.lng], 16);
        } else if (item.postnummer) {
            // A postnummer is an area: its outline (Kartverket), not a skolekrets
            await placePostalArea(item);
            const marker = placeMarker(item.lat, item.lng).bindPopup(`<div class="popup-school">
                <h3 class="ds-heading popup-name" data-size="2xs">${escapeHtml(item.label)}</h3>
                <p class="ds-paragraph popup-kommune" data-size="xs">${t('Postnummer')}</p></div>`, { maxWidth: 300 });
            if (item.area && item.area.length) {
                const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
                postalLayer = L.polygon(item.area.map(polygon => polygon.map(ring => ring.map(([lng, lat]) => [lat, lng]))),
                    { color, weight: 2, fillOpacity: 0.06, interactive: false, attribution: POSTAL_AREA_ATTRIBUTION }).addTo(map);
                map.fitBounds(postalLayer.getBounds(), { padding: [40, 40] });
            } else map.setView([item.lat, item.lng], 14);
            marker.openPopup();
        } else {
            map.setView([item.lat, item.lng], 17);
            showAddress(item, placeMarker(item.lat, item.lng));
        }
    }

    results.addEventListener('click', event => {
        const button = event.target.closest('[data-i]');
        if (button) choose(searchItems[Number(button.dataset.i)]);
    });

    // An empty field lists "Din posisjon", so it is there when the field gets focus
    const offerLocation = () => {
        if (!input.value.trim()) showResults(canLocate() ? [{ kind: 'locate' }] : []);
    };
    input.addEventListener('focus', offerLocation);
    input.addEventListener('pointerdown', offerLocation);

    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        if (searchAbort) searchAbort.abort();
        const query = input.value.trim();
        if (!query) { offerLocation(); return; }
        if (query.length < 2) { showResults([]); return; }
        const local = localMatches(query);
        showResults(local);
        if (query.length < 3) return;
        searchTimer = setTimeout(async () => {
            searchAbort = new AbortController();
            const vgs = (await loadVgs()).schools.filter(s => s.name.toLocaleLowerCase('nb').includes(query.toLocaleLowerCase('nb'))).slice(0, 3)
                .map(s => ({ kind: 'school', label: s.name, sub: `${s.kommune} · ${t('Videregående skole')}`, lat: s.lat, lng: s.lng }));
            const ours = [...local, ...vgs];
            try {
                // Beside schools and kommuner a few addresses are enough
                const places = await searchPlaces(query, { limit: ours.length ? 5 : 8, signal: searchAbort.signal });
                if (input.value.trim() === query) showResults(ordered(query, ours, places), { empty: true });
            } catch (error) {
                if (error.name === 'AbortError') return;
                if (input.value.trim() === query) showResults(ours, { failed: true });
            }
        }, 250);
    });

    // Arrow keys move through the list, Escape closes it
    const buttons = () => [...results.querySelectorAll('.map-search__item')];
    el('mapSearch').closest('.map-search').addEventListener('keydown', event => {
        const list = buttons();
        const at = list.indexOf(document.activeElement);
        if (event.key === 'Escape') {
            showResults([]);
            input.focus();
        } else if (event.key === 'ArrowDown' && list.length) {
            event.preventDefault();
            list[Math.min(at + 1, list.length - 1)].focus();
        } else if (event.key === 'ArrowUp' && at >= 0) {
            event.preventDefault();
            (at === 0 ? input : list[at - 1]).focus();
        }
    });
    document.addEventListener('pointerdown', event => {
        if (!event.target.closest('.map-search')) showResults([]);
    });

    // An address: its bydel in Oslo, and its skolekretser where the kommune has published them as open data
    // (drawn on the map too). Elsewhere a link to where the kommune tells it.
    const addressKretser = L.layerGroup().addTo(map);
    async function showAddress(item, marker) {
        const [kretser, bydeler, vgs] = await Promise.all([loadKretser(), loadBydeler(), loadVgs()]);
        const kommune = Object.keys(kretser.kommuner).find(k => k.toLowerCase() === (item.kommune || '').toLowerCase())
            || titleCase(item.kommune);
        const lines = [];
        const bydel = kommune === 'Oslo' && bydeler.bydeler.find(b => insideRings(item.lng, item.lat, b.rings));
        if (bydel) lines.push(`<strong>${t('Bydel')}</strong> ${escapeHtml(bydel.name)}${bydel.bydel ? '' : ` (${t('ikke bydel')})`}`);

        // The schools for the address: the krets school where the kommune has published its kretser, else the
        // nearest public school of the level (as on the front page), and the nearest public videregående skole
        const here = L.latLng(item.lat, item.lng);
        const nearest = schools => schools.filter(s => s.lat && s.lng && (s.eierform || s.owner) !== 'privat')
            .map(s => ({ school: s, metres: here.distanceTo([s.lat, s.lng]) }))
            .sort((a, b) => a.metres - b.metres)
            .find(hit => hit.metres <= 20000);
        const more = school => `<a class="ds-link popup-more__link" href="${schoolUrl(school)}">${t('Les mer om skolen')}${icon('arrowRight')}</a>`;
        const website = school => (school.url && /^https?:\/\//.test(school.url)
            ? `<a class="ds-link popup-more__link" href="${escapeHtml(school.url)}" target="_blank" rel="noopener">${t('Skolens nettside')}${icon('externalLink')}</a>` : '');
        const schoolLine = (label, name, metres, link) => `<strong>${t(label)}</strong> ${escapeHtml(name)}${
            metres === null ? '' : ` · ${formatDistance(metres)}`}${link ? `<br>${link}` : ''}`;

        const info = kretser.kommuner[kommune];
        const hits = info ? kretser.kretser.filter(k => k.kommune === kommune && insideRings(item.lng, item.lat, k.rings)) : [];
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        // Each level: the school the address belongs to where the kommune has published its kretser; if we do not
        // know it, we say so and show the nearest school instead (labelled as the nearest, not as the krets)
        const unknown = [];
        const nearestLines = [];
        ['barneskole', 'ungdomsskole'].forEach(level => {
            const own = hits.filter(k => k.level === level);
            own.forEach(k => {
                const school = k.school && data.schools.find(s => s.name === k.school && s.kommune === k.kommune && s.schoolType === level);
                lines.push(schoolLine(level === 'barneskole' ? 'Barneskolen adressen hører til' : 'Ungdomsskolen adressen hører til',
                    k.school || k.name, null, school && more(school)));
                addressKretser.addLayer(L.polygon(k.rings.map(ring => ring.map(([x, y]) => [y, x])),
                    { color, weight: 3, dashArray: level === 'barneskole' ? '6 4' : '2 6', fillOpacity: 0.08, interactive: false }));
            });
            if (own.length) return;
            unknown.push(level);
            const hit = nearest(data.schools.filter(s => s.schoolType === level));
            if (hit) nearestLines.push(schoolLine(`Nærmeste ${level}`, hit.school.name, hit.metres, more(hit.school)));
        });
        if (unknown.length) {
            lines.push(t(unknown.length === 2 ? 'Vi har ikke informasjon om hvilken skole adressen hører til.'
                : unknown[0] === 'barneskole' ? 'Vi har ikke informasjon om hvilken barneskole adressen hører til.'
                    : 'Vi har ikke informasjon om hvilken ungdomsskole adressen hører til.'));
        }
        lines.push(...nearestLines);
        // Housing search on Finn.no for each postnummer in the barneskolekrets
        const numbers = ((hits.find(k => k.level === 'barneskole') || hits[0] || {}).postnummer) || [];
        if (numbers.length) {
            lines.push(`${t('Boligsøk på Finn.no for postnumrene i skolekretsen:')} ${numbers.map(n =>
                `<a class="ds-link" href="https://www.finn.no/realestate/homes/search.html?q=${encodeURIComponent(n)}" target="_blank" rel="noopener">${escapeHtml(n)}</a>`).join(' · ')}`);
        }
        const upper = nearest(vgs.schools);
        if (upper) lines.push(schoolLine('Nærmeste videregående skole', upper.school.name, upper.metres, website(upper.school)));
        if (marker !== searchMarker) return;
        marker.bindPopup(`<div class="popup-school">
                <h3 class="ds-heading popup-name" data-size="2xs">${escapeHtml(item.label)}</h3>
                ${lines.map(line => `<p class="ds-paragraph popup-stats" data-size="sm">${line}</p>`).join('')}
            </div>`, { maxWidth: 320 }).openPopup();
    }

    // ── Tools ────────────────────────────────────────────────────────────
    const drawings = L.featureGroup().addTo(map);
    const lineStyle = { color: '#2a2859', weight: 3 };
    let mode = null;       // 'draw', 'distance' or 'area' while one is in use
    let points = [];
    let shape = null;      // the shape being made
    let guide = null;      // the dashed line to the pointer (mouse)
    const MODE_BUTTON = { draw: 'toolDraw', distance: 'toolDistance', area: 'toolArea' };
    const MODE_TEXT = {
        draw: 'Klikk i kartet for å tegne en linje. Trykk Ferdig når du er ferdig.',
        distance: 'Klikk i kartet for hvert punkt på strekningen. Trykk Ferdig når du er ferdig.',
        area: 'Klikk i kartet for hvert hjørne av området. Trykk Ferdig når du er ferdig.'
    };

    function startMode(next) {
        finishMode(true);
        if (next === null) return;
        mode = next;
        points = [];
        el(MODE_BUTTON[mode]).setAttribute('aria-pressed', 'true');
        map.doubleClickZoom.disable();
        map.getContainer().classList.add('is-drawing');
        showHint(t(MODE_TEXT[mode]), '', { done: true });
    }

    // Ends the tool: keeps the shape (with its measurement) or, with `cancel`, drops it
    function finishMode(keep) {
        if (!mode) return;
        if (guide) { guide.remove(); guide = null; }
        const enough = mode === 'area' ? points.length >= 3 : points.length >= 2;
        if (shape) {
            shape.remove();
            if (keep && enough) {
                const done = mode === 'area' ? L.polygon(points, { ...lineStyle, fillOpacity: 0.15 }) : L.polyline(points, lineStyle);
                if (mode !== 'draw') done.bindTooltip(measureText(), { permanent: true, direction: 'center', className: 'map-measure' });
                drawings.addLayer(done);
            }
            shape = null;
        }
        el(MODE_BUTTON[mode]).setAttribute('aria-pressed', 'false');
        map.doubleClickZoom.enable();
        map.getContainer().classList.remove('is-drawing');
        mode = null;
        points = [];
        el('mapHint').hidden = true;
    }

    function redraw() {
        if (shape) shape.remove();
        shape = mode === 'area' && points.length >= 3 ? L.polygon(points, { ...lineStyle, fillOpacity: 0.15 }) : L.polyline(points, lineStyle);
        shape.addTo(map);
        el('mapHintResult').textContent = mode === 'draw' ? '' : measureText();
        el('hintUndo').disabled = points.length === 0;
    }

    map.on('click', event => {
        if (!mode) return;
        points.push(event.latlng);
        redraw();
    });
    map.on('mousemove', event => {
        if (!mode || !points.length) return;
        if (guide) guide.setLatLngs([points[points.length - 1], event.latlng]);
        else guide = L.polyline([points[points.length - 1], event.latlng], { ...lineStyle, dashArray: '4 6', interactive: false }).addTo(map);
    });

    function measureText() {
        if (mode === 'area' || (shape && shape instanceof L.Polygon)) {
            return points.length >= 3 ? formatArea(geodesicArea(points)) : '';
        }
        let metres = 0;
        for (let i = 1; i < points.length; i++) metres += points[i - 1].distanceTo(points[i]);
        return points.length >= 2 ? formatLength(metres) : '';
    }

    // Area on the earth's surface (the formula Leaflet.draw uses), in square metres
    function geodesicArea(latlngs) {
        const R = 6378137, rad = Math.PI / 180;
        let area = 0;
        latlngs.forEach((p1, i) => {
            const p2 = latlngs[(i + 1) % latlngs.length];
            area += (p2.lng - p1.lng) * rad * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
        });
        return Math.abs(area * R * R / 2);
    }

    const number = (value, digits) => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: digits }).format(value);
    const formatLength = m => (m < 1000 ? `${number(m, 0)} m` : `${number(m / 1000, 2)} km`);
    const formatArea = m2 => (m2 < 100000 ? `${number(m2, 0)} m²` : `${number(m2 / 1e6, 2)} km²`);

    function showHint(text, result, { done }) {
        el('mapHintText').textContent = text;
        el('mapHintResult').textContent = result;
        el('hintDone').hidden = !done;
        el('hintUndo').hidden = !done;
        el('hintUndo').disabled = true;
        el('mapHint').hidden = false;
    }

    el('hintDone').addEventListener('click', () => finishMode(true));
    el('hintCancel').addEventListener('click', () => { if (mode) finishMode(false); else el('mapHint').hidden = true; });
    el('hintUndo').addEventListener('click', () => { points.pop(); redraw(); if (guide) { guide.remove(); guide = null; } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && mode) finishMode(false); });

    Object.entries(MODE_BUTTON).forEach(([name, id]) => el(id).addEventListener('click', () => startMode(mode === name ? null : name)));
    el('toolErase').addEventListener('click', () => { finishMode(false); drawings.clearLayers(); });
    el('toolZoomIn').addEventListener('click', () => map.zoomIn());
    el('toolZoomOut').addEventListener('click', () => map.zoomOut());

    // The background map: OpenFreeMap or Kartverket's topographic map
    el('toolBase').addEventListener('click', () => {
        baseLayer.remove();
        baseName = baseName === 'openfreemap' ? 'topo' : 'openfreemap';
        baseLayer = BASE_MAPS[baseName]().addTo(map);
        creditOsm();
        el('toolBase').setAttribute('aria-label', t(baseName === 'topo' ? 'Bytt til vanlig kart' : 'Bytt bakgrunnskart'));
    });

    // "Din posisjon", from the search field or the tool button (as on the front page): asked only when chosen,
    // used like a searched address and not stored or sent anywhere. The kommune for the skolekretser and the
    // bydel is found from their own polygons.
    function locate() {
        if (!canLocate()) {
            showHint(t('Nettleseren kan ikke finne posisjonen din.'), '', { done: false });
            return;
        }
        navigator.geolocation.getCurrentPosition(async position => {
            const item = { label: t('Din posisjon'), lat: position.coords.latitude, lng: position.coords.longitude };
            const [kretser, bydeler] = await Promise.all([loadKretser(), loadBydeler()]);
            const krets = kretser.kretser.find(k => insideRings(item.lng, item.lat, k.rings));
            item.kommune = krets ? krets.kommune : bydeler.bydeler.some(b => insideRings(item.lng, item.lat, b.rings)) ? 'Oslo' : '';
            clearSearchResult();
            map.setView([item.lat, item.lng], 16);
            showAddress(item, placeMarker(item.lat, item.lng));
        }, () => showHint(t('Fikk ikke tilgang til posisjonen din. Sjekk at nettleseren har lov til å bruke den.'), '', { done: false }),
        { enableHighAccuracy: true, timeout: 10000 });
    }
    el('toolLocate').addEventListener('click', locate);
})();

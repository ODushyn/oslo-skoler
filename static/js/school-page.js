// School page: everything we know about one school. Two addresses: the page under skoler/<kommune>/ that
// site_pages.py builds for search engines (the school's key in <body data-school-id>; this script draws over
// its static text), and skole.html?id=<name|kommune|type> for old links and the other level of a 1–10 school.
// Results, Trivsel and photo come from school-data.json. Register data (address, pupils,
// relations ...) is read live from Udir's Nasjonalt skoleregister (NSR, NLOD), the same
// source as nsr.udir.no. A small map shows where the school is.

(async function () {
    const NSR_URL = 'https://data-nsr.udir.no/v4/enhet/';
    const NSR_PAGE = 'https://nsr.udir.no/enheter/';
    let schoolMap = null;
    let kretsBounds = null;   // the school's skolekrets, where the kommune publishes it as open data
    let walkLayer = null;
    let walkRequest = 0;
    const ELEVUNDERSOKELSEN_URL = 'https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/resultater-fra-elevundersokelsen/';
    // Oslo facts in the icon blocks were checked on oslo.kommune.no on this date
    const OSLO_CHECKED = '2026-11-02';
    const AKS_PAGE = 'https://www.oslo.kommune.no/skole-og-utdanning/aktivitetsskolen-aks/hva-er-aktivitetsskolen/';
    const outLink = (href, label) => `<a class="ds-link" href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener">${label}${icon('externalLink')}</a>`;
    const root = document.getElementById('schoolPage');
    const id = new URLSearchParams(location.search).get('id') || document.body.dataset.schoolId;
    const staticPage = Boolean(document.body.dataset.schoolId);

    // The data could not be loaded: a message with "Prøv igjen", in place of the loading placeholder. On the
    // pages under skoler/ the static text about the school comes back under it.
    function showLoadError() {
        const message = `<div class="ds-alert load-error" data-color="danger" role="alert">
                <h2 class="ds-heading" data-size="xs">${t('Kunne ikke laste skolen')}</h2>
                <p class="ds-paragraph">${t('Sjekk nettforbindelsen og prøv igjen.')}</p>
                <button type="button" class="ds-button" data-variant="secondary" data-size="sm" id="retryLoad">${t('Prøv igjen')}</button>
            </div>`;
        root.removeAttribute('aria-busy');
        if (staticPage) {
            root.classList.add('is-fallback');
            root.insertAdjacentHTML('afterbegin', message);
        } else {
            root.innerHTML = message;
        }
        document.getElementById('retryLoad').addEventListener('click', () => location.reload());
    }

    const PROFILE_LABEL = {
        montessori: 'Montessori', steiner: 'Steiner', kristen: 'Kristen',
        internasjonal: 'Internasjonal', toppidrett: 'Toppidrett', realfag: 'Realfag'
    };
    const LOCATION_SOURCE = {
        'geonorge-grunnskoler': 'Geonorge, Grunnskoler (Udir)',
        'nsr': 'Nasjonalt skoleregister (Udir)',
        'kartverket-adresse': 'Kartverket, adresse fra skoleregisteret',
        'osm-nominatim': 'OpenStreetMap'
    };
    const score = v => (v === null || v === undefined ? '*' : v);
    const average = values => {
        const valid = values.filter(v => v !== null && v !== undefined);
        return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const date = iso => (iso ? new Date(iso).toLocaleDateString(I18N.locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null);
    const titleCase = text => (text || '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase());
    const address = a => (a && a.Adresse ? `${escapeHtml(a.Adresse)}, ${escapeHtml(a.Postnummer || '')} ${escapeHtml(titleCase(a.Poststed))}` : null);

    let data;
    // National averages on the national tests (no "out of": the scale has no maximum)
    const nationalRequest = fetch(I18N.url('static/js/landssnitt.json'), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    // Kommune averages on the national tests, newest year (same Udir files, rows for the whole kommune)
    const kommuneRequest = fetch(I18N.url('static/js/kommunesnitt.json'), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    try {
        data = await fetch(I18N.url('static/js/school-data.json'), { cache: 'no-cache' }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
    } catch (error) {
        showLoadError();
        return;
    }

    const school = data.schools.find(s => schoolKey(s) === id);
    if (!school) {
        root.removeAttribute('aria-busy');
        root.innerHTML = `
            <h1 class="ds-heading" data-size="md">Fant ikke skolen</h1>
            <p class="ds-paragraph">${t('Lenken peker ikke til en skole vi har data for.')} <a class="ds-link" href="${I18N.href('./')}">${t('Gå til kartet')}</a>.</p>`;
        return;
    }

    const year = (data.metadata && data.metadata.currentYear) || '';
    const typeLabel = SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType;
    const nationalByYear = (await nationalRequest)[school.schoolType] || {};
    const nationalNow = (nationalByYear[year] || {}).snitt;
    const kommuneAverages = await kommuneRequest;
    const kommuneNow = kommuneAverages.year === year ? (kommuneAverages[school.schoolType] || {})[school.kommune] : null;
    const otherLevel = data.schools.find(s => s.name === school.name && s.kommune === school.kommune
        && s.schoolType !== school.schoolType);
    const hasBarnetrinn = school.schoolType === 'barneskole' || (otherLevel && otherLevel.schoolType === 'barneskole');
    const isOslo = school.kommune === 'Oslo';
    const isPublic = school.eierform !== 'privat';
    // Pupil Survey results shown for this level, and when "N svar" is worth saying
    const trinnShown = school.schoolType === 'barneskole' ? '7' : '10';
    const FEW_ANSWERS = 30;
    // The static page keeps its own (Norwegian) title for search engines, except in another language.
    // On skole.html?id= the canonical address is the school's static page, so search engines count the two as one.
    if (!staticPage || I18N.translated) document.title = `${school.name} – Skolekartet`;
    if (!staticPage) {
        if (school.page) {
            const canonical = document.createElement('link');
            canonical.rel = 'canonical';
            canonical.href = new URL(I18N.url(school.page), location.origin).href;
            document.head.appendChild(canonical);
        }
    }

    // Detail file (photos, links, AKS, hjertesone) and the register entry load in parallel
    const detailsRequest = school.orgnr
        ? fetch(I18N.url(`static/data/skoler/${encodeURIComponent(school.orgnr)}.json`), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
        : Promise.resolve({});
    // The register is Udir's own server: after 6 seconds the page shows without it (and says so) rather than wait
    const unitRequest = school.orgnr
        ? Promise.race([
            fetch(NSR_URL + encodeURIComponent(school.orgnr)).then(r => (r.ok ? r.json() : null)).catch(() => null),
            new Promise(resolve => setTimeout(() => resolve(null), 6000))
        ])
        : Promise.resolve(null);

    const tags = [];
    if (school.eierform) tags.push(school.eierform === 'privat' ? 'Privat' : 'Offentlig');
    if (school.profil && PROFILE_LABEL[school.profil]) tags.push(t(PROFILE_LABEL[school.profil]));

    const resultCard = school.hasData
        ? `<span class="school-stat__value"><span class="color-dot score-${scoreCategory(school.color)}" aria-hidden="true"></span>${formatDecimal(school.average)}${nationalNow ? ` <span>${t('landet {value}', { value: formatDecimal(nationalNow) })}</span>` : ''}</span>
           <span class="school-stat__text">${t('Snitt av skalapoeng i engelsk, lesing og regning ({count} fag). Skalaen har ingen makspoeng, derfor vises landsgjennomsnittet.', { count: school.validScoresCount })}</span>
           <span class="school-stat__source">${t('Nasjonale prøver, {type}, {year}', { type: typeLabel.toLowerCase(), year })}</span>`
        : `<span class="school-stat__value">–</span>
           <span class="school-stat__text">Udir har ikke publisert resultater for skolen, ofte fordi gruppen er liten.</span>`;

    const trivselCard = school.trivsel
        ? `<span class="school-stat__value">${formatDecimal(school.trivsel.score)} <span>av 5</span></span>
           <span class="school-stat__text">Elevenes gjennomsnittlige svar på en skala fra 1 til 5.</span>
           <span class="school-stat__compare" id="compare-trivsel"></span>
           <span class="school-stat__source">${t('Trivsel, {trinn}. trinn, Elevundersøkelsen {year}', { trinn: school.trivsel.trinn, year: school.trivsel.year })}</span>`
        : `<span class="school-stat__value">–</span>
           <span class="school-stat__text">Ikke publisert for skolen, ofte fordi for få elever svarte.</span>`;

    const mobbingCard = school.mobbing
        ? `<span class="school-stat__value">${formatDecimal(school.mobbing.share)} <span>%</span></span>
           <span class="school-stat__text">${t('Andel elever som er blitt mobbet to eller tre ganger i måneden eller oftere.')}</span>
           <span class="school-stat__compare" id="compare-mobbing">${school.mobbing.national !== null && school.mobbing.national !== undefined
               ? `<span>${t('Hele landet: {value}', { value: formatPercent(school.mobbing.national) })}</span>` : ''}</span>
           <span class="school-stat__source">${t('Mobbing på skolen, {trinn}. trinn, Elevundersøkelsen {year}', { trinn: school.mobbing.trinn, year: school.mobbing.year })}</span>`
        : `<span class="school-stat__value">–</span>
           <span class="school-stat__text">Ikke publisert for skolen, ofte fordi for få elever svarte.</span>`;

    const rows = [{ year, engelsk: school.engelsk, lesing: school.lesing, regning: school.regning }]
        .concat([...(school.history || [])].reverse())
        .map(r => {
            const avg = average([r.engelsk, r.lesing, r.regning]);
            const national = (nationalByYear[r.year] || {}).snitt;
            return `<tr><td>${escapeHtml(r.year)}</td><td class="num">${score(r.engelsk)}</td><td class="num">${score(r.lesing)}</td>
                    <td class="num">${score(r.regning)}</td><td class="num"><strong>${avg === null ? '*' : formatDecimal(avg)}</strong></td>
                    <td class="num">${national === undefined || national === null ? '–' : formatDecimal(national)}</td></tr>`;
        }).join('');

    // Shortcuts to each part of the page, as in the Røde Kors "snarveier" block
    const careLabel = isOslo ? 'AKS' : 'SFO';
    // Only what is about this school: AKS links from the school's website (Oslo) and the school's
    // groups for newcomers (Oslo). The general texts are on skolefritid.html and ny-i-norge.html.
    const showCare = hasBarnetrinn && isPublic && isOslo;
    const showNew = isPublic && isOslo;
    const shortcuts = [
        ['om-skolen', 'Om skolen'],
        ['resultater', 'Resultater'],
        ['kart', 'Kart'],
        ['aktiviteter', 'Anlegg'],
        ['mat', 'Mat'],
        showCare ? ['etter-skoletid', careLabel] : null,
        showNew ? ['ny-i-norge', 'Ny i Norge'] : null
    ].filter(Boolean);

    // Everything the top of the page needs is loaded first, and the page is drawn once, so the banner does not
    // grow when the address and links arrive (the loading placeholder holds the place until then)
    const [details, unit] = await Promise.all([detailsRequest, unitRequest]);
    root.removeAttribute('aria-busy');
    root.innerHTML = `
        <section class="school-banner" aria-labelledby="schoolName">
            ${saveButtonHtml(schoolKey(school), 'school-banner__save')}
            <div class="school-banner__media" id="schoolMedia">${mediaPlaceholder()}</div>
            <div class="school-banner__body">
                <p class="school-banner__kicker">${escapeHtml(otherLevel ? t('Barne- og ungdomsskole (1.–10. trinn)') : typeLabel)} · <a class="ds-link" href="${I18N.href(`./?kommune=${encodeURIComponent(school.kommune)}`)}">${t('{kommune} kommune', { kommune: escapeHtml(school.kommune) })}</a></p>
                <h1 class="ds-heading" data-size="lg" id="schoolName">${escapeHtml(school.name)}</h1>
                <ul class="school-banner__tags" id="schoolTags" aria-label="${t('Kjennetegn')}">
                    ${tags.map(tag => `<li><span class="ds-tag" data-color="neutral" data-size="sm">${tag}</span></li>`).join('')}
                </ul>
                <div class="school-banner__info">
                    <!-- Contact (address, email, phone, each with a small button to act on it) on the left;
                         website and "Følg skolen" under each other on the right -->
                    <dl class="school-banner__facts">
                        <div>
                            <dt class="ds-sr-only">${t('Kontakt')}</dt>
                            <dd><ul class="school-contact" id="bannerContactList">
                                <li><span id="bannerAddress">${t('Henter adresse…')}</span></li>
                            </ul></dd>
                        </div>
                        <div id="bannerContact" hidden>
                            <dt>Nettside</dt>
                            <dd id="bannerContactLinks"></dd>
                        </div>
                        <div id="bannerFollow" hidden>
                            <dt>Følg skolen</dt>
                            <dd><ul class="school-banner__links" id="bannerFollowLinks"></ul></dd>
                        </div>
                    </dl>
                    <!-- Share and Google Maps, at the bottom right -->
                    <div class="school-banner__actions">
                        <button type="button" class="ds-button" data-variant="tertiary" data-size="sm" id="bannerShare">${icon('link')}<span>${t('Del')}</span></button>
                        <a class="ds-button" data-variant="tertiary" data-size="sm" id="bannerGoogle" target="_blank" rel="noopener"
                           href="${googleMapsUrl(`${school.name}, ${school.kommune}`)}">${icon('externalLink')}<span>Google Maps</span></a>
                    </div>
                </div>
            </div>
        </section>

        <nav class="snarveier" aria-labelledby="snarveierLabel">
            <h2 class="ds-sr-only" id="snarveierLabel">Snarveier</h2>
            <ul class="snarveier__list">
                ${shortcuts.map(([id, label]) => `<li><a class="ds-link" href="#${id}">${icon('arrowDown')}${t(label)}</a></li>`).join('')}
            </ul>
        </nav>

        <div class="school-page__body">
            <section id="om-skolen" class="key-figures" aria-labelledby="omHeading">
                <h2 class="ds-heading" data-size="sm" id="omHeading">Om skolen</h2>
                <p class="ds-paragraph key-figures__lead">Nøkkeltall fra Nasjonalt skoleregister (Udir).</p>
                <div id="schoolSummary"><p class="ds-paragraph" data-size="sm">Henter opplysninger fra Nasjonalt skoleregister…</p></div>
            </section>

            <section id="resultater" aria-labelledby="resultaterHeading">
                <h2 class="ds-heading" data-size="sm" id="resultaterHeading">Resultater, trivsel og mobbing</h2>
                <p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde: {np} og {eu}, Utdanningsdirektoratet (NLOD).', {
                    np: `<a class="ds-link" href="${school.schoolType === 'barneskole'
                        ? 'https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/nasjonale-prover-5.-trinn/'
                        : 'https://www.udir.no/tall-og-forskning/statistikk/statistikk-grunnskole/nasjonale-prover-8.-og-9.-trinn/'}" target="_blank" rel="noopener">${t('Nasjonale prøver')}</a>`,
                    eu: `<a class="ds-link" href="${ELEVUNDERSOKELSEN_URL}" target="_blank" rel="noopener">Elevundersøkelsen</a>` })}</p>
                ${otherLevel ? levelSwitchHtml() : ''}
                <p class="ds-paragraph school-stats__hint" data-size="sm">Velg et kort for å se utviklingen over tid.</p>
                <div class="school-stats" role="tablist" aria-label="Velg hva du vil se over tid">
                    ${statTab('np', 'Nasjonale prøver', resultCard, true)}
                    ${statTab('trivsel', 'Trivsel', trivselCard, false)}
                    ${statTab('mobbing', 'Mobbing', mobbingCard, false)}
                </div>
                <div class="stat-panel" role="tabpanel" id="panel-np" aria-labelledby="tab-np" tabindex="0">
                    ${npDotPlotHtml()}
                    <h3 class="ds-heading" data-size="xs">Nasjonale prøver over tid</h3>
                    <div class="table-scroll">
                        <table class="ds-table school-history" data-size="sm" data-border>
                            <thead><tr><th>År</th><th class="num">Engelsk</th><th class="num">Lesing</th><th class="num">Regning</th><th class="num">Snitt</th><th class="num">Hele landet</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                    <p class="ds-paragraph table-caption" data-size="xs">${t('Skalapoeng, {type}. Landsgjennomsnittet var 50 i 2022. * betyr at resultatet ikke er publisert. Resultater for 2026–27 kommer når Udir publiserer dem.', { type: typeLabel.toLowerCase() })}</p>
                </div>
                <div class="stat-panel" role="tabpanel" id="panel-trivsel" aria-labelledby="tab-trivsel" tabindex="0" hidden>
                    <p class="ds-paragraph">Henter tall…</p>
                </div>
                <div class="stat-panel" role="tabpanel" id="panel-mobbing" aria-labelledby="tab-mobbing" tabindex="0" hidden>
                    <p class="ds-paragraph">Henter tall…</p>
                </div>
                <div id="surveyAll"></div>
            </section>

            <!-- One map for the school and the walking time: the map card shows only the time,
                 the address field and the details sit under the map -->
            <section id="kart" class="walk" aria-labelledby="kartHeading">
                <h2 class="ds-heading" data-size="sm" id="kartHeading" tabindex="-1">Kart og gangtid</h2>
                <p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Posisjon: {source}.', { source: t(LOCATION_SOURCE[school.locationSource] || 'åpne kilder') })}</p>
                ${isOslo && hasBarnetrinn ? `<div id="skolevei" data-source-scope>${skoleveiHtml({})}</div>` : ''}
                <div class="school-map-wrap" id="gangtid">
                    <div class="school-map" id="schoolMap" role="img" aria-label="${t('Kart som viser hvor {name} ligger', { name: escapeHtml(school.name) })}"></div>
                    <div class="map-walk" id="mapWalk" aria-live="polite" hidden></div>
                </div>
                <p class="ds-paragraph map-caption" data-size="xs" id="kretsCaption" hidden></p>
                <div class="walk-below" id="walkContent"></div>
            </section>

            <section id="naerheten" aria-labelledby="nearbyHeading">
                <h2 class="ds-heading" data-size="sm" id="nearbyHeading">Andre skoler i nærheten</h2>
                ${nearbyHtml()}
            </section>

            <section id="aktiviteter" class="icon-block" aria-labelledby="aktiviteterHeading">
                <h2 class="ds-heading" data-size="sm" id="aktiviteterHeading">Aktiviteter og anlegg</h2>
                <div id="aktiviteterContent"><p class="ds-paragraph" data-size="sm">${t('Henter…')}</p></div>
            </section>

            <section id="mat" class="icon-block" aria-labelledby="matHeading">
                <h2 class="ds-heading" data-size="sm" id="matHeading">Mat</h2>
                <div id="matContent"><p class="ds-paragraph" data-size="sm">${t('Henter…')}</p></div>
            </section>

            ${showCare ? `<section id="etter-skoletid" aria-labelledby="careHeading">
                <h2 class="ds-heading" data-size="sm" id="careHeading">${isOslo ? 'Aktivitetsskolen (AKS)' : 'Skolefritidsordning (SFO)'}</h2>
                <div id="careContent">${careHtml({})}</div>
            </section>` : ''}

            ${showNew ? `<section id="ny-i-norge" aria-labelledby="newHeading">
                <h2 class="ds-heading" data-size="sm" id="newHeading">Ny i Norge</h2>
                <div id="newContent"><p class="ds-paragraph" data-size="sm">${t('Henter…')}</p></div>
            </section>` : ''}


            <!-- Where the pupils go after this school (or come from): last, with the last shortcut -->
            <section id="videre" aria-labelledby="videreHeading" hidden>
                <h2 class="ds-heading" data-size="sm" id="videreHeading"></h2>
                <div class="next-school" id="videreContent"></div>
            </section>

            <section id="registeret" aria-labelledby="registerHeading">
                <h2 class="ds-heading" data-size="sm" id="registerHeading">Mer fra skoleregisteret</h2>
                <div id="registerSections"></div>
            </section>
        </div>`;

    showMap(school);
    renderWalk(rememberedAddress());
    bindStatTabs();
    root.querySelector('.school-banner__save').addEventListener('click', event => {
        updateSaveButton(event.currentTarget, toggleSaved(schoolKey(school)));
    });
    document.getElementById('bannerShare').addEventListener('click', event => shareSchoolPage(school, event.currentTarget));
    showSurveyHistory(details.survey || {});
    showComparisons(details.elevundersokelsen);
    document.getElementById('surveyAll').innerHTML = surveyTableHtml(details.elevundersokelsen);
    showMedia(details.gallery || []);
    showLinks(details, unit);
    if (showCare) document.getElementById('careContent').innerHTML = careHtml(details);
    if (showNew) document.getElementById('newContent').innerHTML = nyINorgeHtml(details);
    if (isOslo && hasBarnetrinn) document.getElementById('skolevei').innerHTML = skoleveiHtml(details);
    drawKrets(details.skolekrets);
    if (details.hjertesone) {
        // The tag explains itself on hover/focus and leads to the "Trygg skolevei" text
        document.getElementById('schoolTags').insertAdjacentHTML('beforeend',
            `<li><a class="ds-tag school-banner__zone" data-color="success" data-size="sm" href="#skolevei"
                data-tooltip="Hjertesone betyr en bilfri sone rundt skolen. Foreldre blir bedt om ikke å kjøre barna helt fram, slik at skoleveien blir tryggere."
                aria-describedby="zoneHint">Hjertesone: bilfri sone ved skolen</a>
             <span class="ds-sr-only" id="zoneHint">Les mer under Trygg skolevei</span></li>`);
    }
    showRegister(school, unit, details);
    renderNextSchool(details);
    document.getElementById('aktiviteterContent').innerHTML = aktiviteterHtml(details);
    document.getElementById('matContent').innerHTML = matHtml(details);

    // Small icon link to where the figures come from

    // ── Statistics: the cards choose which table and chart show ──────────
    // Wider screens: tabs, the chosen card's details below the row of cards. Phones: each card opens its details
    // right under itself (an arrow shows open or closed); tapping it again closes them, tapping another card
    // opens that one and closes the first.
    function statTab(id, title, content, selected) {
        return `<button type="button" class="ds-card school-stat" data-variant="tinted" data-color="${selected ? 'brand1' : 'neutral'}" role="tab" id="tab-${id}"
                    aria-selected="${selected}" aria-controls="panel-${id}" tabindex="${selected ? 0 : -1}">
                    <span class="school-stat__title">${title}</span>
                    ${content}
                    <span class="school-stat__chevron" aria-hidden="true">${icon('chevronDown')}</span>
                </button>`;
    }

    function bindStatTabs() {
        const list = document.querySelector('.school-stats');
        const tabs = [...list.querySelectorAll('.school-stat')];
        const panelOf = tab => document.getElementById(tab.getAttribute('aria-controls'));
        const phone = window.matchMedia('(max-width: 640px)');
        const show = (tab, on) => {
            tab.dataset.color = on ? 'brand1' : 'neutral';
            panelOf(tab).hidden = !on;
            if (phone.matches) {
                tab.setAttribute('aria-expanded', String(on));
            } else {
                tab.setAttribute('aria-selected', String(on));
                tab.tabIndex = on ? 0 : -1;
            }
        };
        const select = tab => tabs.forEach(other => show(other, other === tab));

        // Tabs with the details after the row of cards, or (phones) each card with its details under it
        const layout = () => {
            const open = tabs.find(tab => !panelOf(tab).hidden) || (phone.matches ? null : tabs[0]);
            if (phone.matches) {
                list.removeAttribute('role');
                tabs.forEach(tab => {
                    const panel = panelOf(tab);
                    tab.after(panel);
                    tab.removeAttribute('role');
                    tab.removeAttribute('aria-selected');
                    tab.tabIndex = 0;
                    panel.setAttribute('role', 'region');
                });
            } else {
                list.setAttribute('role', 'tablist');
                let after = list;
                tabs.forEach(tab => {
                    const panel = panelOf(tab);
                    after.after(panel);
                    after = panel;
                    tab.setAttribute('role', 'tab');
                    tab.removeAttribute('aria-expanded');
                    panel.setAttribute('role', 'tabpanel');
                });
            }
            tabs.forEach(tab => show(tab, tab === open));
        };
        layout();
        phone.addEventListener('change', layout);

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => {
                if (phone.matches && !panelOf(tab).hidden) {
                    show(tab, false);
                    return;
                }
                const before = tab.getBoundingClientRect().top;
                select(tab);
                // Phones: the tapped card keeps its place when the details of a card above it close
                if (phone.matches) window.scrollBy(0, tab.getBoundingClientRect().top - before);
            });
            // Arrow keys move between the cards, as in a tab list (wider screens)
            tab.addEventListener('keydown', event => {
                if (phone.matches) return;
                const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
                if (next === undefined) return;
                event.preventDefault();
                const target = tabs[(next + tabs.length) % tabs.length];
                target.focus();
                select(target);
            });
        });
    }

    // Trivsel and Mobbing for every school year, with the national level beside it
    function showSurveyHistory(survey) {
        const trinn = school.schoolType === 'barneskole' ? '7' : '10';
        const table = (name, label, unit, better) => {
            const rows = ((survey[name] || {})[trinn] || []).slice().reverse();
            if (!rows.length) {
                return `<p class="ds-paragraph">${t('Udir har ikke publisert {label} for skolen noen år, ofte fordi for få elever svarte.', { label: t(label.toLowerCase()) })}</p>`;
            }
            const fmt = v => (v === null || v === undefined ? '*' : `${formatDecimal(v)}${unit}`);
            const compare = (v, n) => {
                if (n === null || n === undefined || v === n) return '<span class="stat-compare">Som landet</span>';
                const good = better === 'higher' ? v > n : v < n;
                return `<span class="stat-compare" data-good="${good}">${v > n ? 'Over' : 'Under'} landet</span>`;
            };
            return `
                <div class="table-scroll">
                    <table class="ds-table school-history" data-size="sm" data-border>
                        <thead><tr><th>År</th><th class="num">Skolen</th><th class="num">Hele landet</th><th>Sammenlignet</th></tr></thead>
                        <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.year)}</td><td class="num"><strong>${fmt(r.value)}</strong></td>
                            <td class="num">${fmt(r.national)}</td><td>${compare(r.value, r.national)}</td></tr>`).join('')}</tbody>
                    </table>
                </div>`;
        };
        document.getElementById('panel-trivsel').innerHTML = `
            <h3 class="ds-heading" data-size="xs">Trivsel over tid</h3>
            ${table('trivsel', 'Trivsel', '', 'higher')}
            <p class="ds-paragraph table-caption" data-size="xs">${t('Gjennomsnittlig svar på «Trives du på skolen?» på en skala fra 1 til 5, {trinn}. trinn. År som mangler, er ikke publisert av Udir.', { trinn })}</p>`;
        document.getElementById('panel-mobbing').innerHTML = `
            <h3 class="ds-heading" data-size="xs">Mobbing over tid</h3>
            ${table('mobbing', 'Mobbing', I18N.isEnglish ? '%' : '&nbsp;%', 'lower')}
            <p class="ds-paragraph table-caption" data-size="xs">${t('Andel elever på {trinn}. trinn som er blitt mobbet to eller tre ganger i måneden eller oftere. År som mangler, er ikke publisert av Udir, ofte fordi for få svarte. Landsgjennomsnittet steg mye fra 2022–23 til 2023–24, og fra 2023–24 publiserer Udir tall for langt flere skoler. Sammenlign derfor helst år fra 2023–24 og senere.', { trinn })}</p>`;
    }

    // ── Banner: photos, address and links ──────────────────────────────
    function mediaPlaceholder() {
        return `<div class="school-banner__placeholder">${icon('image')}<span>Foto ikke funnet</span></div>`;
    }

    function credit(photo) {
        const license = photo.licenseUrl
            ? `<a href="${escapeHtml(safeUrl(photo.licenseUrl))}" target="_blank" rel="noopener">${escapeHtml(photo.license)}</a>`
            : escapeHtml(photo.license);
        return `${t('Foto:')} ${escapeHtml(photo.author)} · ${license} · <a href="${escapeHtml(safeUrl(photo.page))}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    }

    function showMedia(gallery) {
        const target = document.getElementById('schoolMedia');
        if (!gallery.length) return;
        const slides = gallery.map((photo, i) => `
            <figure class="carousel__slide" ${i ? 'hidden' : ''} aria-roledescription="bilde" aria-label="${t('{current} av {total}', { current: i + 1, total: gallery.length })}">
                <img src="${escapeHtml(safeUrl(photo.thumb))}" alt="${t('Foto av {name}', { name: escapeHtml(school.name) })}${photo.title ? `: ${escapeHtml(photo.title)}` : ''}" ${i ? 'loading="lazy"' : ''} decoding="async">
                <figcaption>${credit(photo)}</figcaption>
            </figure>`).join('');
        target.innerHTML = gallery.length === 1 ? `<div class="carousel">${slides}</div>` : `
            <div class="carousel" role="group" aria-roledescription="karusell" aria-label="${t('Bilder av {name}', { name: escapeHtml(school.name) })}" tabindex="0">
                ${slides}
                <div class="carousel__nav">
                    <button type="button" class="ds-button carousel__arrow" data-variant="secondary" data-size="sm" data-icon="true" data-step="-1" aria-label="Forrige bilde">${icon('chevronLeft')}</button>
                    <button type="button" class="ds-button carousel__arrow" data-variant="secondary" data-size="sm" data-icon="true" data-step="1" aria-label="Neste bilde">${icon('chevronRight')}</button>
                    <span class="carousel__count" aria-live="polite">${t('{current} av {total}', { current: 1, total: gallery.length })}</span>
                </div>
            </div>`;
        if (gallery.length === 1) return;

        const carousel = target.querySelector('.carousel');
        const figures = [...carousel.querySelectorAll('.carousel__slide')];
        let current = 0;
        const go = step => {
            figures[current].hidden = true;
            current = (current + step + figures.length) % figures.length;
            figures[current].hidden = false;
            carousel.querySelector('.carousel__count').textContent = t('{current} av {total}', { current: current + 1, total: figures.length });
        };
        carousel.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.step))));
        carousel.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') { go(-1); event.preventDefault(); }
            if (event.key === 'ArrowRight') { go(1); event.preventDefault(); }
        });
    }

    function showLinks(details, unit) {
        const addressText = unit && unit.Beliggenhetsadresse && unit.Beliggenhetsadresse.Adresse
            ? `${unit.Beliggenhetsadresse.Adresse}, ${unit.Beliggenhetsadresse.Postnummer || ''} ${titleCase(unit.Beliggenhetsadresse.Poststed)}`.trim()
            : null;
        document.getElementById('bannerAddress').textContent = addressText || t('Ikke registrert i skoleregisteret');

        // Address, email and phone, each with a small button: Google Maps, write an email, call
        // The address itself, so Google shows the right place (a name search can find another school)
        const google = googleMapsUrl(addressText || `${school.name}, ${school.kommune}`);
        document.getElementById('bannerGoogle').href = google;
        const action = (href, label, iconName, external) => `<a class="ds-button school-contact__action" data-variant="tertiary" data-size="sm" data-icon="true"
                href="${escapeHtml(safeUrl(href))}" aria-label="${label}" data-tooltip="${label}"${external ? ' target="_blank" rel="noopener"' : ''}>${icon(iconName)}</a>`;
        const list = document.getElementById('bannerContactList');
        if (addressText) {
            list.firstElementChild.insertAdjacentHTML('beforeend', action(google, t('Åpne i Google Maps'), 'externalLink', true));
        }
        const reach = details.contact || {};
        if (reach.email) {
            list.insertAdjacentHTML('beforeend', `<li><span class="school-contact__text">${escapeHtml(reach.email).replace('@', '@<wbr>')}</span>${action(`mailto:${reach.email}`, t('Send e-post til skolen'), 'envelopeClosed')}</li>`);
        }
        if (reach.phone) {
            const spaced = reach.phone.replace(/^(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
            list.insertAdjacentHTML('beforeend', `<li><span>${escapeHtml(spaced)}</span>${action(`tel:+47${reach.phone}`, t('Ring skolen'), 'phone')}</li>`);
        }

        const website = details.websiteBroken ? null : (details.website || (unit && unit.Internettadresse
            ? (/^https?:\/\//i.test(unit.Internettadresse) ? unit.Internettadresse : `https://${unit.Internettadresse}`)
            : null));

        // The website once, as its address; a registered website that does not answer is named, but not linked
        const contact = website
            ? `<a class="ds-link" href="${escapeHtml(safeUrl(website))}" target="_blank" rel="noopener">${escapeHtml(website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}${icon('externalLink')}</a>`
            : details.websiteBroken ? `<span class="school-banner__muted">${t('Nettsiden svarer ikke')}</span>` : '';
        if (contact) {
            document.getElementById('bannerContactLinks').innerHTML = contact;
            document.getElementById('bannerContact').hidden = false;
        }

        // Always show Facebook and Instagram, one without an official page as unavailable;
        // Wikipedia only when there is an article
        const social = (url, name, missing) => url
            ? `<li><a class="social-link" href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noopener"
                   aria-label="${name}: ${escapeHtml(school.name)}" data-tooltip="${name}">${icon(name.toLowerCase(), 'social-link__icon')}</a></li>`
            // Focusable, so keyboard users also reach the tooltip that says why the icon is greyed out
            : `<li><span class="social-link" tabindex="0" aria-disabled="true" role="img" aria-label="${t('{name}: fant ingen offisiell side', { name })}"
                   data-tooltip="${missing || t('Fant ingen offisiell {name}-side for skolen', { name })}">${icon(name.toLowerCase(), 'social-link__icon')}</span></li>`;
        document.getElementById('bannerFollowLinks').innerHTML = social(details.facebook, 'Facebook') + social(details.instagram, 'Instagram')
            + (details.wikipedia ? social(details.wikipedia, 'Wikipedia') : '');
        document.getElementById('bannerFollowLinks').classList.add('social-links');
        document.getElementById('bannerFollow').hidden = false;
    }

    // ── Before and after school: AKS in Oslo, SFO elsewhere ─────────────
    function careHtml(details) {
        const website = details.website;
        const out = (href, label) => `<a class="ds-link" href="${escapeHtml(safeUrl(href))}" target="_blank" rel="noopener">${escapeHtml(label)}${icon('externalLink')}</a>`;
        const general = `<p class="ds-paragraph"><a class="ds-link" href="${I18N.href('skolefritid.html#aks')}">${t('Om AKS i Oslo: søknad, plass og pris')}</a></p>`;
        const aks = details.aks;
        // Long link lists fold away (Designsystemet Details) and open when needed
        const schoolLinks = aks && aks.links.length
            ? `<details class="ds-details link-details" data-variant="default">
                   <summary>${t('Fra skolens nettside ({count} lenker)', { count: aks.links.length })}</summary>
                   <div><ul class="ds-list link-list">${aks.links.map(l => `<li>${out(l.url, l.title)}</li>`).join('')}</ul>
                   <p class="ds-paragraph" data-size="sm">${out(aks.url, 'Alt om AKS på skolens nettside')}</p></div>
               </details>`
            : (website ? `<p class="ds-paragraph">Aktiviteter, kurs og åpningstid for AKS på skolen finner du på ${out(website, 'skolens nettside')}.</p>` : '');
        return `${schoolLinks}
            ${general}
            ${aks ? `<p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde:')} ${t('lenker fra skolens nettside, hentet {date}', { date: date(details.updated) })}.</p>` : ''}`;
    }

    // ── New in Norway: language support, groups for newcomers, interpreter, info in other languages ──
    function nyINorgeHtml(details) {
        const welcome = details.velkomst;
        const groupName = { mottaksgruppe: 'Mottaksgruppe', alfabetiseringsgruppe: 'Alfabetiseringsgruppe' };
        const level = { barnetrinn: 'barnetrinnet', ungdomstrinn: 'ungdomstrinnet' };
        const groups = welcome
            ? `<p class="ds-paragraph"><strong>Denne skolen har:</strong></p>
               <ul class="ds-list">${welcome.groups.map(g => `<li>${t('{group} for {level}', { group: escapeHtml(t(groupName[g.type] || g.type)), level: escapeHtml(t(level[g.trinn] || g.trinn)) })}${g.plasser ? t(' ({count} plasser totalt)', { count: Number(g.plasser) }) : ''}</li>`).join('')}</ul>
               <p class="ds-paragraph" data-size="sm">Antall plasser er totalt, ikke ledige plasser.</p>`
            : `<p class="ds-paragraph">Skolen står ikke på Oslo kommunes liste over skoler med mottaksgruppe eller alfabetiseringsgruppe. Eleven kan likevel få særskilt språkopplæring på skolen.</p>`;
        return `${groups}
            <p class="ds-paragraph"><a class="ds-link" href="${I18N.href('ny-i-norge.html')}">${t('Om språkopplæring, tolk og informasjon på ditt språk')}</a></p>
            ${welcome ? `<p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde: {sources}, hentet {date}.', { sources: 'Oslo kommune', date: date(welcome.fetched) })}</p>` : ''}`;
    }

    // ── Comparisons and charts (inline SVG, colours from Designsystemet tokens) ──
    // The school's row for an indicator in the same school year as the card
    function surveyEntry(survey, key, wantedYear) {
        const rows = ((survey && survey.rows[key]) || {})[trinnShown] || [];
        return rows.find(r => r.year === wantedYear) || null;
    }

    // "Oslo: 4,2 · Hele landet: 4,1" under the Trivsel and Mobbing cards
    function showComparisons(survey) {
        const kommuneName = (survey && survey.kommune) || school.kommune;
        const line = (id, key, info, format) => {
            const target = document.getElementById(id);
            if (!target || !info) return;
            const entry = surveyEntry(survey, key, info.year);
            const parts = [];
            if (entry && entry.kommune !== null && entry.kommune !== undefined) parts.push(`${escapeHtml(kommuneName)}: ${format(entry.kommune)}`);
            const national = entry && entry.national !== null && entry.national !== undefined ? entry.national : info.national;
            if (national !== null && national !== undefined) parts.push(t('Hele landet: {value}', { value: format(national) }));
            // Number of answers comes from the Trivsel table (the bullying table counts bullied pupils)
            const answered = surveyEntry(survey, 'trivsel', info.year);
            const answers = (answered && answered.answers) || (school.trivsel && school.trivsel.year === info.year ? school.trivsel.answers : null);
            if (answers && answers < FEW_ANSWERS) parts.push(t('{count} svar', { count: answers }));
            target.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
        };
        line('compare-trivsel', 'trivsel', school.trivsel, formatDecimal);
        line('compare-mobbing', 'mobbing', school.mobbing, formatPercent);
    }

    // National tests: one row per subject, the school as a dot, the country and the kommune as lines
    function npDotPlotHtml() {
        if (!school.hasData) return '';
        const national = nationalByYear[year] || {};
        const subjects = [['engelsk', 'Engelsk'], ['lesing', 'Lesing'], ['regning', 'Regning']].map(([key, label]) => ({
            label, school: school[key], national: national[key], kommune: kommuneNow ? kommuneNow[key] : null
        }));
        const values = subjects.flatMap(s => [s.school, s.national, s.kommune]).filter(v => v !== null && v !== undefined);
        if (!values.length) return '';
        const low = Math.floor((Math.min(...values) - 3) / 5) * 5;
        const high = Math.ceil((Math.max(...values) + 3) / 5) * 5;
        const x = v => `${((v - low) / (high - low) * 100).toFixed(1)}%`;
        const formatScale = v => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: 1 }).format(v);
        const has = v => v !== null && v !== undefined;
        const kommuneLabel = escapeHtml(school.kommune);
        const cell = v => (has(v) ? v : '*');
        // The values are read out per row; the drawing itself is hidden from screen readers
        const rowsHtml = subjects.map(s => `
            <div class="dot-plot__row">
                <span class="dot-plot__label">${t(s.label)}<span class="ds-sr-only">: ${t('Skolen')} ${cell(s.school)}${kommuneNow ? `, ${kommuneLabel} ${cell(s.kommune)}` : ''}, ${t('Hele landet')} ${cell(s.national)}</span></span>
                <svg class="dot-plot__track" width="100%" height="28" aria-hidden="true" focusable="false">
                    <line class="dot-plot__axis" x1="0" x2="100%" y1="14" y2="14"/>
                    ${has(s.kommune) ? `<line class="dot-plot__kommune" x1="${x(s.kommune)}" x2="${x(s.kommune)}" y1="3" y2="25"/>` : ''}
                    ${has(s.national) ? `<line class="dot-plot__national" x1="${x(s.national)}" x2="${x(s.national)}" y1="3" y2="25"/>` : ''}
                    ${has(s.school) ? `<circle class="dot-plot__school" cx="${x(s.school)}" cy="14" r="7"/>` : ''}
                </svg>
                <span class="dot-plot__value" aria-hidden="true">${cell(s.school)}</span>
            </div>`).join('');
        return `
            <h3 class="ds-heading" data-size="xs">${t('Resultat per fag, {year}', { year: escapeHtml(year) })}</h3>
            <div class="dot-plot">
                <ul class="dot-plot__legend" aria-hidden="true">
                    <li><span class="dot-plot__key dot-plot__key--school"></span>${t('Skolen')}</li>
                    <li><span class="dot-plot__key dot-plot__key--national"></span>${t('Hele landet')}</li>
                    ${kommuneNow ? `<li><span class="dot-plot__key dot-plot__key--kommune"></span>${kommuneLabel}</li>` : ''}
                </ul>
                ${rowsHtml}
                <div class="dot-plot__row dot-plot__scale" aria-hidden="true"><span></span><span class="dot-plot__ticks"><span>${low}</span><span>${formatScale((low + high) / 2)}</span><span>${high}</span></span><span></span></div>
            </div>
            <p class="ds-paragraph table-caption" data-size="xs">${t('Prøveresultater sier noe om svarene på én prøve, ikke om hele skolen.')}</p>`;
    }

    // Small trend line for one indicator over the years shown (no axis; the numbers are in the table)
    function sparkline(values) {
        const points = values.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined);
        if (points.length < 2) return '';
        const w = 64, h = 20, pad = 3;
        const min = Math.min(...points.map(p => p[1]));
        const max = Math.max(...points.map(p => p[1]));
        const px = i => pad + i * (w - 2 * pad) / Math.max(1, values.length - 1);
        const py = v => (max === min ? h / 2 : h - pad - (v - min) / (max - min) * (h - 2 * pad));
        const coords = points.map(([i, v]) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
        return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">
            <polyline points="${coords.join(' ')}"/>
            ${points.map(([i, v]) => `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="2"/>`).join('')}</svg>`;
    }

    // Every indicator of the Pupil Survey: indicator × school year, trend, kommune and country
    function surveyTableHtml(survey) {
        if (!survey || !Object.keys(survey.rows).length) return '';
        const years = survey.years;
        const latest = years[years.length - 1];
        const kommuneName = escapeHtml(survey.kommune || school.kommune);
        const fmt = (key, v) => (v === null || v === undefined ? '*' : key === 'mobbing' ? formatPercent(v) : formatDecimal(v));
        const rows = Object.keys(survey.labels).map(key => {
            const entries = ((survey.rows[key] || {})[trinnShown]) || [];
            if (!entries.length) return '';
            const byYear = Object.fromEntries(entries.map(e => [e.year, e]));
            const last = byYear[latest] || entries[entries.length - 1];
            return `<tr>
                <th scope="row">${t(survey.labels[key])}</th>
                ${years.map(y => `<td class="num">${y in byYear ? fmt(key, byYear[y].value) : '–'}</td>`).join('')}
                <td>${sparkline(years.map(y => (byYear[y] ? byYear[y].value : null)))}</td>
                <td class="num">${fmt(key, last.kommune)}</td>
                <td class="num">${fmt(key, last.national)}</td>
            </tr>`;
        }).join('');
        if (!rows) return '';
        return `
            <div class="survey-all">
                <h3 class="ds-heading" data-size="xs">${t('Elevundersøkelsen, {trinn}. trinn', { trinn: trinnShown })}</h3>
                <p class="ds-paragraph" data-size="sm">${t('Skala fra 1 til 5, der høyere er bedre. Mobbing er andel elever i prosent, der lavere er bedre.')}</p>
                <div class="table-scroll">
                    <table class="ds-table school-history survey-table" data-size="sm" data-border>
                        <thead><tr><th>${t('Indikator')}</th>${years.map(y => `<th class="num">${escapeHtml(y)}</th>`).join('')}
                            <th>${t('Utvikling')}</th><th class="num">${kommuneName} ${escapeHtml(latest)}</th><th class="num">${t('Hele landet')} ${escapeHtml(latest)}</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <p class="ds-paragraph table-caption" data-size="xs">${t('* betyr at Udir har skjult tallet, ofte fordi for få elever svarte. – betyr at skolen ikke har tall det året.')}</p>
            </div>`;
    }

    // The nearest schools of the same level, straight-line distance from this school
    function nearbyHtml() {
        const nearby = data.schools
            .filter(s => s.schoolType === school.schoolType && s !== school && s.lat && s.lng && school.lat && school.lng)
            .map(s => ({ s, km: airDistanceKm(school.lat, school.lng, s.lat, s.lng) }))
            .filter(n => n.km <= 3 && n.km > 0.01)
            .sort((a, b) => a.km - b.km)
            .slice(0, 6);
        const km = v => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
        const list = nearby.length
            ? `<ul class="nearby">${nearby.map(({ s, km: d }) => `
                <li class="nearby__item">
                    <a class="ds-link" href="${schoolUrl(s)}">${escapeHtml(s.name)}</a>
                    <span class="nearby__meta">${t('{km} km i luftlinje', { km: km(d) })}${s.kommune !== school.kommune ? ` · ${escapeHtml(s.kommune)}` : ''}${s.eierform === 'privat' ? ` · ${t('Privat')}` : ''}</span>
                </li>`).join('')}</ul>`
            : `<p class="ds-paragraph">${t('Ingen andre skoler av samme type innen 3 km.')}</p>`;
        return `
            <p class="ds-paragraph" data-size="sm">${t('De nærmeste skolene med samme trinn, innen 3 km. Det er kommunen som bestemmer hvilken skole eleven hører til.')}</p>
            ${list}
            <p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde: skolenes posisjon fra Geonorge og Utdanningsdirektoratet. Avstanden er målt i luftlinje.')}</p>`;
    }

    // ── Icon blocks (Figma "ikonblokk"): a tile only where a source names this school ──
    function tilesHtml(tiles) {
        return `<ul class="icon-block__grid">${tiles.map(tile => {
            const inner = `<span class="icon-tile__icon" aria-hidden="true">${tile.icon}</span>
                <span class="icon-tile__label">${tile.label}</span>
                ${tile.text ? `<span class="icon-tile__text">${tile.text}</span>` : ''}`;
            return `<li>${tile.href
                ? `<a class="icon-tile" href="${escapeHtml(safeUrl(tile.href))}" target="_blank" rel="noopener">${inner}</a>`
                : `<div class="icon-tile">${inner}</div>`}</li>`;
        }).join('')}</ul>`;
    }

    // The block's own text, "Les mer" on the right and the source line
    function iconBlockHtml(tiles, empty, notes, more, sources) {
        return `
            ${tiles.length ? tilesHtml(tiles) : `<p class="ds-paragraph">${empty}</p>`}
            ${notes.map(note => `<p class="ds-paragraph" data-size="sm">${note}</p>`).join('')}
            ${more ? `<p class="icon-block__more"><a class="ds-link" href="${escapeHtml(safeUrl(more))}" target="_blank" rel="noopener">${t('Les mer')}${icon('chevronRight')}</a></p>` : ''}
            <p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde:')} ${sources.join('; ')}.</p>`;
    }

    // First AKS menu link whose title matches, e.g. "Leksehjelp" or "Ferier på AKS"
    function aksLink(details, pattern) {
        return ((details.aks && details.aks.links) || []).find(l => pattern.test(l.title));
    }

    // "Mandag, tirsdag og fredag"
    function dayList(days) {
        const names = days.map(d => t(d));
        const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} ${t('og')} ${names[names.length - 1]}` : names[0];
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function distanceText(metres) {
        return metres < 1000 ? `${metres} m` : `${formatDecimal(Math.round(metres / 100) / 10)} km`;
    }

    function aktiviteterHtml(details) {
        const tiles = [];
        const sources = [];
        const sport = details.anlegg;
        if (sport) {
            const pool = sport.pool;
            if (pool) {
                tiles.push(pool.distance <= 150
                    ? { icon: materialIcon('pool'), label: t('Svømmebasseng ved skolen'), href: pool.osm }
                    : { icon: materialIcon('pool'), href: pool.osm,
                        label: t(pool.indoor ? 'Nærmeste svømmehall: {name}' : 'Nærmeste svømmebasseng: {name}', { name: escapeHtml(pool.name) }),
                        text: t('{distance} i luftlinje fra skolen', { distance: distanceText(pool.distance) }) });
            }
            if (sport.football) tiles.push({ icon: materialIcon('sportsSoccer'), label: t('Fotballbane ved skolen') });
            if (sport.hall) tiles.push({ icon: materialIcon('sportsGymnastics'), label: t('Gymsal eller idrettshall ved skolen') });
            sources.push(t('OpenStreetMap (ODbL), kartdata fra {date}', { date: date(sport.fetched) }));
        }
        const aks = [
            [/\blekse/i, 'Leksehjelp på AKS', 'openBook'],
            [/\bkurs|aktivitetstilbud/i, 'Kurs og aktiviteter på AKS', 'palette'],
            [/\bferie/i, 'Ferietilbud på AKS', 'sun']
        ].map(([pattern, label, name]) => {
            const link = isOslo && aksLink(details, pattern);
            return link && { icon: icon(name), label: t(label), href: link.url };
        }).filter(Boolean);
        tiles.push(...aks);
        const device = details.devices && details.devices.links[0];
        if (device) tiles.push({ icon: icon('tablet'), label: t('Læringsbrett – les mer på skolens nettside'), href: device.url });
        if (aks.length || device) sources.push(t('lenker fra skolens nettside, hentet {date}', { date: date((device && details.devices.fetched) || details.updated) }));

        // What applies to all Oslo schools (skolehage, nettfilter, fritid) is on skolehverdag.html
        const notes = isOslo && isPublic
            ? [`<a class="ds-link" href="${I18N.href('skolehverdag.html#aktiviteter')}">${t('Om skolehage, fritidsaktiviteter og nettfilter i Osloskolen')}</a>`]
            : [];
        const website = details.websiteBroken ? null : details.website;
        const empty = t('Vi har ikke funnet idrettsanlegg ved skolen i OpenStreetMap eller sider om aktiviteter på skolens nettside.')
            + (website ? ` ${outLink(website, t('Gå til skolens nettside'))}` : '');
        if (!sources.length) sources.push(t('Nasjonalt skoleregister (skolens nettside)'));
        return iconBlockHtml(tiles, empty, notes, (isOslo && details.aks && details.aks.url) || website, sources);
    }

    function matHtml(details) {
        const tiles = [];
        const sources = [];
        const notes = [];
        if (isOslo && showCare) {
            tiles.push({ icon: icon('trayFood'), label: t('Mat på AKS'), href: AKS_PAGE,
                         text: t('Et mellommåltid etter skolelunsjen. Matpengene er med i prisen.') });
            // Facts read from the school's own AKS pages; without them, a link to the menu
            const food = details.aksMat;
            const facts = (food && food.facts) || {};
            if (facts.perWeek) {
                tiles.push({ icon: icon('calendar'), href: food.url,
                             label: facts.perWeek === 5 ? t('Mat hver dag') : facts.perWeek === 1 ? t('Mat én dag i uken') : t('Mat {count} dager i uken', { count: facts.perWeek }),
                             text: facts.days && facts.perWeek < 5 ? dayList(facts.days) : '' });
            }
            if (facts.warm) {
                tiles.push({ icon: materialIcon('soupKitchen'), href: food.url, label: t('Varm mat'),
                             text: facts.warmPerWeek === 5 ? t('Hver dag') : facts.warmPerWeek === 1 ? t('Én gang i uken') : facts.warmPerWeek ? t('{count} ganger i uken', { count: facts.warmPerWeek }) : '' });
            }
            if (facts.packedDays) {
                tiles.push({ icon: icon('backpack'), href: food.url, label: t('Ta med ekstra matpakke'), text: dayList(facts.packedDays) });
            }
            const menu = aksLink(details, /\bmat|\bmeny/i);
            if (menu && !Object.keys(facts).length) tiles.push({ icon: icon('plate'), label: t('Se menyen'), href: menu.url });
            const milk = aksLink(details, /skolemelk/i);
            if (milk) tiles.push({ icon: materialIcon('waterFull'), label: t('Skolemelk'), href: milk.url });
        }
        // Skolemat in Oslo and the allergy advice apply to all schools: skolehverdag.html
        if (isOslo && showCare) sources.push(t('Oslo kommune, hentet {date}', { date: date(OSLO_CHECKED) }));
        if (isOslo) notes.push(`<a class="ds-link" href="${I18N.href('skolehverdag.html#mat')}">${t('Om skolemat i Oslo, allergier og spesialkost')}</a>`);
        if (details.aksMat) sources.push(t('AKS-sidene på skolens nettside, lest {date}', { date: date(details.aksMat.fetched) }));
        else if (tiles.length > 1) sources.push(t('lenker fra skolens nettside, hentet {date}', { date: date(details.updated) }));
        const website = details.websiteBroken ? null : details.website;
        const empty = t('Vi har ikke opplysninger om mat ved denne skolen.') + (website ? ` ${outLink(website, t('Gå til skolens nettside'))}` : '');
        if (!sources.length) sources.push(t('Nasjonalt skoleregister (skolens nettside)'));
        return iconBlockHtml(tiles, empty, notes, (isOslo && details.aks && details.aks.url) || website, sources);
    }

    // ── Way to school: Oslo kommune's hjertesone programme ──────────────
    function skoleveiHtml(details) {
        const zone = details.hjertesone;
        const source = zone || { source: 'https://www.oslo.kommune.no/prosjekter/hjertesone-tryggere-skolevei/' };
        const status = zone
            ? t('{name} er en hjertesoneskole. Rundt skolen er det en sone der foreldre blir bedt om ikke å kjøre barna helt fram, slik at det blir tryggere for dem som går og sykler.', { name: escapeHtml(school.name) })
            : t('{name} står ikke på Oslo kommunes liste over hjertesoneskoler. Spør gjerne skolen eller FAU om hvordan de jobber med trygg skolevei.', { name: escapeHtml(school.name) });
        return `
            <h3 class="ds-heading" data-size="xs">Trygg skolevei</h3>
            <p class="ds-paragraph">${status}</p>
            <p class="ds-paragraph" data-size="sm">Hjertesone er et samarbeid mellom skolen, FAU, Bymiljøetaten og Trygg Trafikk.
               <a class="ds-link" href="${escapeHtml(safeUrl(source.source))}" target="_blank" rel="noopener">Les om hjertesoner${icon('externalLink')}</a></p>
            ${zone ? `<p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde: Oslo kommune, liste over hjertesoneskoler, hentet {date}.', { date: date(zone.fetched) })}</p>` : ''}`;
    }

    // Every "Kilde" line sits right under the heading of its section (or sub-block with
    // data-source-scope), so "Les mer" and other links can end the block. Content is rendered in
    // several steps, so this runs after each change; a line from an earlier render is replaced.
    function liftSources() {
        root.querySelectorAll('.section-source').forEach(line => {
            const scope = line.parentElement.closest('[data-source-scope]');
            const heading = scope ? scope.querySelector(':scope > h3')
                : line.closest('section') && line.closest('section').querySelector(':scope > h2');
            if (!heading || heading.nextElementSibling === line) return;
            const old = heading.nextElementSibling;
            if (old && old.classList.contains('section-source')) old.remove();
            heading.after(line);
        });
    }
    new MutationObserver(() => requestAnimationFrame(liftSources)).observe(root, { childList: true, subtree: true });
    liftSources();

    // ── Oslo: which ungdomsskole the barneskole leads to, and the other way round ──
    // "Videre" (barneskole) or "Elevene kommer fra" (ungdomsskole): a short last shortcut, and the
    // section near the end of the page with the sentence, links and source
    function showNext(heading, html) {
        document.getElementById('videreHeading').textContent = t(heading);
        document.getElementById('videreContent').innerHTML = html;
        document.getElementById('videre').hidden = false;
        const list = document.querySelector('.snarveier__list');
        const old = list.querySelector('a[href="#videre"]');
        if (old) old.parentElement.remove();
        list.insertAdjacentHTML('beforeend', `<li><a class="ds-link" href="#videre">${icon('arrowDown')}${t(heading)}</a></li>`);
    }


    function renderNextSchool(details) {
        const pageFor = name => data.schools.find(s => s.name === name && s.kommune === school.kommune && s.schoolType === 'ungdomsskole');
        const barnePageFor = name => data.schools.find(s => s.name === name && s.kommune === school.kommune && s.schoolType === 'barneskole');
        const link = (entry, name) => entry
            ? `<a class="ds-link" href="${schoolUrl(entry)}">${escapeHtml(name)}</a>`
            : escapeHtml(name);
        const source = info => `<p class="ds-paragraph school-page__sources section-source" data-size="xs">${t('Kilde: Oslo kommune, Skolekrets ungdomsskole, hentet {date}.', { date: date(info.fetched) })}
            <a class="source-link" href="${escapeHtml(safeUrl(info.source))}" target="_blank" rel="noopener" aria-label="${t('Kilde:')} Oslo kommune" data-tooltip="Oslo kommune">${icon('externalLink')}</a></p>`;

        const next = details.nextSchool;
        if (school.schoolType === 'barneskole' && next && !(otherLevel && next.same)) {
            const schools = next.next.map(n => link(pageFor(n.name), n.name));
            const sentence = next.same
                ? t('Etter 7. trinn fortsetter elevene på samme skole: {school}.', { school: schools[0] })
                : schools.length > 1
                    ? t('Etter 7. trinn går elevene videre til {first} eller {second}. Det avhenger av hvor eleven bor.', { first: schools.slice(0, -1).join(', '), second: schools[schools.length - 1] })
                    : t('Etter 7. trinn går elevene videre til {school}.', { school: schools[0] });
            showNext('Videre', `<p class="ds-paragraph">${sentence}</p>
                ${next.boundaryMap ? `<p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${escapeHtml(safeUrl(next.boundaryMap))}" target="_blank" rel="noopener">${t('Se grensekartet')}${icon('externalLink')}</a></p>` : ''}
                ${source(next)}`);
            return;
        }
        const from = details.fromSchools;
        if (school.schoolType === 'ungdomsskole' && from) {
            showNext('Elevene kommer fra', `<p class="ds-paragraph">${t('Elever fra disse barneskolene går videre hit:')} ${from.schools.map(s => link(barnePageFor(s.name), s.name)).join(', ')}.</p>
                ${source(from)}`);
            return;
        }
    }

    // A school with 1.–10. trinn has results for each level (national tests on 5. trinn and on
    // ungdomstrinnet, the survey on 7. and 10. trinn). Each level has its page; this switch moves
    // between them, so it reads as one school with two sets of results.
    function levelSwitchHtml() {
        const levels = [school, otherLevel].sort((a, b) => (a.schoolType === 'barneskole' ? -1 : 1) - (b.schoolType === 'barneskole' ? -1 : 1));
        return `<p class="ds-paragraph" data-size="sm">${t('Skolen har 1.–10. trinn og egne resultater for barnetrinnet og ungdomstrinnet.')}</p>
            <nav class="level-switch" aria-label="${t('Resultater for')}">
                ${levels.map(level => level === school
                    ? `<span class="ds-button level-switch__item" data-variant="primary" data-size="sm" aria-current="page">${t(level.schoolType === 'barneskole' ? 'Barnetrinnet (5. trinn)' : 'Ungdomstrinnet')}</span>`
                    : `<a class="ds-button level-switch__item" data-variant="secondary" data-size="sm" href="${I18N.href(`skole.html?id=${encodeURIComponent(schoolKey(level))}#resultater`)}">${t(level.schoolType === 'barneskole' ? 'Barnetrinnet (5. trinn)' : 'Ungdomstrinnet')}</a>`).join('')}
            </nav>`;
    }

    // ── Walking time from an address (estimate from open data, no routing service) ──
    function renderWalk(home) {
        const target = document.getElementById('walkContent');
        if (!home) {
            drawWalk(null);
            // The address field opens in the middle of the map; the privacy note goes under it
            const overlay = document.getElementById('mapWalk');
            overlay.className = 'map-walk map-walk--search';
            overlay.innerHTML = `
                <div class="map-walk__body">
                    <ds-field class="ds-field walk__field">
                        <label class="ds-label ds-sr-only" for="walkAddress">${t('Adresse for å se gangtid til skolen')}</label>
                        <ds-suggestion class="ds-suggestion" id="walkSuggestion">
                            <input class="ds-input" type="search" id="walkAddress" placeholder="${t('Skriv inn en adresse')}" autocomplete="off">
                            <del aria-label="${t('Tøm adressesøk')}"></del>
                            <u-datalist id="walkResults" data-nofilter></u-datalist>
                        </ds-suggestion>
                    </ds-field>
                </div>`;
            overlay.hidden = !schoolMap;
            target.innerHTML = `<p class="ds-paragraph school-page__sources" data-size="xs">${t('Adressen sendes til Kartverkets adresse-API for å finne posisjonen. Den lagres bare i denne fanen og legges ikke i lenken.')}</p>`;
            bindWalkSearch();
            return;
        }

        // Show the estimate at once, then the real walking route from Entur when it arrives.
        // Far too long to walk: no route is asked for, the estimate is enough to say so.
        const estimate = walkEstimate(home, school);
        const request = ++walkRequest;
        if (estimate.minutes > WALK_MAX_MINUTES) {
            showWalk(home, estimate, 'far');
            return;
        }
        showWalk(home, estimate, 'loading');
        walkRoute(home, school)
            .then(route => { if (request === walkRequest) showWalk(home, { ...route, air: estimate.air }, 'route'); })
            .catch(() => { if (request === walkRequest) showWalk(home, estimate, 'estimate'); });
    }

    // kind: 'loading' (estimate while the route is fetched), 'route' (Entur) or 'estimate' (route failed)
    function showWalk(home, walk, kind) {
        const target = document.getElementById('walkContent');
        drawWalk(home, walk, kind === 'route' ? walk.points : null);
        const law = 'https://lovdata.no/lov/2023-06-09-30/§4-1';
        const skyss = walk.road > 4
            ? t('Skoleveien er anslått til over 4 km. Elever i grunnskolen har rett til gratis skyss når de bor mer enn 4 km fra skolen, og elever på 1. trinn når de bor mer enn 2 km unna.')
            : walk.road > 2
                ? t('Skoleveien er anslått til over 2 km. Elever på 1. trinn har rett til gratis skyss når de bor mer enn 2 km fra skolen.')
                : '';
        const osmRoute = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${home.lat}%2C${home.lng}%3B${school.lat}%2C${school.lng}`;

        const status = kind === 'loading'
            ? `<p class="ds-paragraph walk__status" data-size="sm">${t('Beregner gangrute…')}</p>`
            : kind === 'estimate'
                ? `<p class="ds-paragraph walk__status" data-size="sm">${t('Entur fant ingen gangrute akkurat nå, så gangtiden er et anslag ut fra luftlinjen.')}</p>`
                : '';
        const how = kind === 'route'
            ? t('Vi finner korteste gangvei langs veier og stier med Enturs reiseplanlegger, som bruker kartdata fra OpenStreetMap. Gangtiden bygger på 4,5 km/t, et tempo som passer for barn. Ruten sier ikke noe om trafikksikkerhet eller kryssinger, og kommunen måler selv skoleveien når den vurderer skyss.')
            : t('Vi måler luftlinjen mellom adressen og skolen og ganger med 1,3 for å anslå avstanden langs vei. Gangtiden bygger på 4,5 km/t. Dette er ikke en beregnet rute og sier ikke noe om trafikksikkerhet, kryssinger eller terreng.');
        // Minutes, distance, address and its buttons are on the map card; under the map: notes and links
        target.innerHTML = `
            ${status}
            ${skyss && kind !== 'loading' ? `<div class="ds-alert walk__skyss" data-color="info" data-size="sm"><p class="ds-paragraph" data-size="sm">${skyss}
                ${t('Kommunen måler den faktiske skoleveien, og retten gjelder også når veien er særlig farlig eller vanskelig.')}
                <a class="ds-link" href="${law}" target="_blank" rel="noopener">${t('Opplæringslova § 4-1')}${icon('externalLink')}</a></p></div>` : ''}
            <details class="ds-details walk__how" data-variant="default">
                <summary>${t('Slik regner vi')}</summary>
                <div><p class="ds-paragraph" data-size="sm">${how}</p></div>
            </details>
            <p class="ds-paragraph" data-size="sm"><a class="ds-link" href="${osmRoute}" target="_blank" rel="noopener">${t('Se gangrute på OpenStreetMap')}${icon('externalLink')}</a></p>`;
    }

    // Address search with Kartverket (same as on the map page)
    function bindWalkSearch() {
        const input = document.getElementById('walkAddress');
        const list = document.getElementById('walkResults');
        const suggestion = document.getElementById('walkSuggestion');
        let results = [];
        let timer = null;
        let controller = null;
        input.addEventListener('input', event => {
            if (!event.isTrusted) return;
            clearTimeout(timer);
            const query = input.value.trim();
            if (query.length < 3) {
                list.innerHTML = '';
                return;
            }
            timer = setTimeout(async () => {
                if (controller) controller.abort();
                controller = new AbortController();
                try {
                    const params = new URLSearchParams({ sok: query, fuzzy: 'true', treffPerSide: '8', utkoordsys: '4258' });
                    const data = await fetch(`https://ws.geonorge.no/adresser/v1/sok?${params}`, { signal: controller.signal }).then(r => r.json());
                    results = (data.adresser || []).filter(a => a.representasjonspunkt).map(a => ({
                        label: `${a.adressetekst}, ${a.postnummer} ${titleCase(a.poststed)}`,
                        lat: a.representasjonspunkt.lat,
                        lng: a.representasjonspunkt.lon,
                        kommune: titleCase(a.kommunenavn)
                    }));
                    list.innerHTML = results.length
                        ? results.map((a, i) => `<u-option value="${i}" label="${escapeHtml(a.label)}">${escapeHtml(a.label)}</u-option>`).join('')
                        : `<u-option data-empty value="">${t('Ingen adresser funnet')}</u-option>`;
                    if (list.hidden && document.activeElement === input) input.click();
                } catch (error) {
                    if (error.name !== 'AbortError') list.innerHTML = `<u-option data-empty value="">${t('Adressesøket er ikke tilgjengelig akkurat nå')}</u-option>`;
                }
            }, 250);
        });
        suggestion.addEventListener('comboboxbeforeselect', event => {
            event.preventDefault();
            const item = event.detail;
            if (!item || !/^\d+$/.test(item.value)) return;
            const result = results[Number(item.value)];
            if (!result) return;
            rememberAddress(result);
            renderWalk(result);
            document.getElementById('kartHeading').focus({ preventScroll: true });
        });
    }

    // Address, school and the walking route (or a dashed straight line) on the school map
    function drawWalk(home, walk, points) {
        if (!schoolMap) return;
        if (walkLayer) {
            walkLayer.remove();
            walkLayer = null;
        }
        const overlay = document.getElementById('mapWalk');
        if (!home) {
            // The address field sits at the top of the map; the school stays a little below the middle,
            // or the whole skolekrets is in view where we have it
            if (kretsBounds) {
                schoolMap.fitBounds(kretsBounds, { paddingTopLeft: [20, 80], paddingBottomRight: [20, 20], animate: false });
            } else {
                schoolMap.setView([school.lat, school.lng], 15, { animate: false });
                schoolMap.panBy([0, -30], { animate: false });
            }
            return;
        }
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        const line = points && points.length
            ? L.polyline(points, { color, weight: 5, opacity: 0.85, interactive: false })
            : L.polyline([[home.lat, home.lng], [school.lat, school.lng]], { color, weight: 3, dashArray: '8 8', interactive: false });
        walkLayer = L.layerGroup([
            line,
            L.circleMarker([home.lat, home.lng], { radius: 7, color, weight: 3, fillColor: '#fff', fillOpacity: 1 })
                .bindTooltip(escapeHtml(home.label), { permanent: true, direction: 'right', offset: [8, 0] })
        ]).addTo(schoolMap);
        // Leave room at the bottom for the card on the map
        schoolMap.fitBounds(line.getBounds().extend([school.lat, school.lng]),
            { paddingTopLeft: [40, 40], paddingBottomRight: [40, 200], maxZoom: 16 });

        // Card on the map (as in the Figma map block): walking time, from where, and the address buttons
        const km = v => new Intl.NumberFormat(I18N.locale, { maximumFractionDigits: 1 }).format(v);
        const distance = points && points.length
            ? t('Omtrent {road} km langs gangveien ({air} km i luftlinje).', { road: km(walk.road), air: km(walk.air) })
            : t('Luftlinje omtrent {air} km, omtrent {road} km langs vei.', { air: km(walk.air), road: km(walk.road) });
        overlay.className = 'map-walk';
        overlay.innerHTML = `
            <span class="map-walk__icon" aria-hidden="true">${walkIcon()}</span>
            <div class="map-walk__body">
                <p class="map-walk__time">${walk.minutes > WALK_MAX_MINUTES ? t('For langt å gå')
                    : `${t('omtrent')} <strong>${walk.minutes}</strong> ${t('min å gå')}`}</p>
                <p class="map-walk__from">${t('fra {address}', { address: escapeHtml(home.label) })}</p>
                <p class="map-walk__from">${distance}</p>
                <div class="walk__actions">
                    <button type="button" class="ds-button" data-variant="secondary" data-size="sm" id="walkChange">${t('Bytt adresse')}</button>
                    <button type="button" class="ds-button" data-variant="tertiary" data-size="sm" id="walkRemove">${t('Fjern adressen')}</button>
                </div>
            </div>`;
        overlay.hidden = false;
        document.getElementById('walkChange').addEventListener('click', () => {
            walkRequest++;
            renderWalk(null);
            document.getElementById('walkAddress').focus();
        });
        document.getElementById('walkRemove').addEventListener('click', () => {
            walkRequest++;
            rememberAddress(null);
            renderWalk(null);
        });
    }

    // The school's skolekrets on the map, from kommuner that publish it as open data (pilot)
    function drawKrets(info) {
        const own = info && info.kretser.filter(k => k.level === school.schoolType);
        if (!schoolMap || !own || !own.length) return;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--ds-color-brand1-base-default').trim() || '#0d7a5f';
        const layer = L.featureGroup(own.map(k => L.polygon(
            k.rings.map(ring => ring.map(([lng, lat]) => [lat, lng])),
            { color, weight: 2, dashArray: '6 4', fillOpacity: 0.06, interactive: false }
        ))).addTo(schoolMap);
        kretsBounds = layer.getBounds();
        if (!walkLayer) drawWalk(null);
        const caption = document.getElementById('kretsCaption');
        caption.innerHTML = `${t('Den stiplede linjen viser skolekretsen ({name}). Pilot på åpne data, kan avvike fra kommunens gjeldende grenser.', { name: escapeHtml(own[0].name) })}
            ${t('Kilde:')} <a class="ds-link" href="${escapeHtml(safeUrl(info.sourceUrl))}" target="_blank" rel="noopener">${escapeHtml(t(info.source))}</a>.
            <a class="ds-link" href="${I18N.href('om-skolekrets.html')}#pilot">${t('Om skolekretsdataene')}</a>`;
        caption.hidden = false;
    }

    // ── Small map with the school (same map style as the main map) ─────
    function showMap(s) {
        const map = L.map('schoolMap', { center: [s.lat, s.lng], zoom: 15, scrollWheelZoom: false, zoomControl: true });
        schoolMap = map;
        L.maplibreGL({
            style: typeof THEME !== 'undefined' ? THEME.mapStyle() : 'https://tiles.openfreemap.org/styles/liberty',
            attributionControl: {
                customAttribution: MAP_ATTRIBUTION
            }
        }).addTo(map);
        map.attributionControl.setPrefix(false);
        const size = s.schoolType === 'ungdomsskole' ? 40 : 30;
        L.marker([s.lat, s.lng], {
            icon: L.divIcon({
                html: `<span class="school-marker score-${scoreCategory(s.color)}">${schoolTypeIcon(s.schoolType)}</span>`,
                className: 'school-marker-icon',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            }),
            title: s.name,
            keyboard: false
        }).addTo(map);
    }

    // ── Everything the school register has about the school ────────────
    function showRegister(s, unit, details) {
        const target = document.getElementById('registerSections');
        const summary = document.getElementById('schoolSummary');
        if (!s.orgnr || !unit) {
            const message = !s.orgnr
                ? 'Fant ikke skolen i Nasjonalt skoleregister.'
                : 'Kunne ikke hente opplysninger fra Nasjonalt skoleregister akkurat nå.';
            summary.innerHTML = `<p class="ds-paragraph" data-size="sm">${message}</p>`;
            document.getElementById('registeret').hidden = true;
            return;
        }

        const link = (orgnr, name) => `<a class="ds-link" href="${NSR_PAGE}${encodeURIComponent(orgnr)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;

        const trinn = [];
        if (unit.SkoletrinnGSFra && unit.SkoletrinnGSTil) trinn.push(`Grunnskole ${unit.SkoletrinnGSFra}.–${unit.SkoletrinnGSTil}. trinn`);
        if (unit.SkoletrinnVGSFra && unit.SkoletrinnVGSTil) trinn.push(`Videregående ${unit.SkoletrinnVGSFra}.–${unit.SkoletrinnVGSTil}. trinn`);
        const kommune = unit.Kommune
            ? `${escapeHtml(unit.Kommune.Navn)} (${escapeHtml(unit.Kommune.Kommunenummer)})${unit.Kommune.Kostragruppe ? `, ${escapeHtml(unit.Kommune.Kostragruppe.Navn)}` : ''}`
            : null;
        const godkjenning = unit.PrivatskoleGodkjenning
            ? t('Godkjent etter {law}, status: {status}', { law: escapeHtml(unit.PrivatskoleGodkjenning.Godkjenningslov), status: escapeHtml(unit.PrivatskoleGodkjenning.GodkjentStatusTekst || unit.PrivatskoleGodkjenning.GodkjentStatus) })
            : null;
        const status = unit.ErAktiv
            ? t('Aktiv')
            : `${t('Ikke aktiv')}${unit.Utgaattype && unit.Utgaattype.Id !== 'A' ? ` (${escapeHtml(unit.Utgaattype.Navn)})` : ''}${unit.UtgaattDato ? `, ${date(unit.UtgaattDato)}` : ''}`;

        // The rest of the register folds away (Designsystemet Details), closed by default
        const section = (title, items) => {
            const filled = items.filter(([, value]) => value !== null && value !== undefined && value !== '');
            if (!filled.length) return '';
            return `
                <details class="ds-details register-details" data-variant="default">
                    <summary>${title}</summary>
                    <div><dl class="school-facts">${filled.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('')}</dl></div>
                </details>`;
        };

        const relations = (unit.ForeldreRelasjoner || []).map(r => [escapeHtml(r.Relasjonstype.Navn), link(r.Enhet.Organisasjonsnummer, r.Enhet.Navn)])
            .concat((unit.BarnRelasjoner || []).map(r => [`${escapeHtml(r.Relasjonstype.Navn)} ${t('(underenhet)')}`, link(r.Enhet.Organisasjonsnummer, r.Enhet.Navn)]));

        // "Om skolen": key figures in columns (label and big number), as in the Røde Kors "nøkkeltall" block,
        // built with Designsystemet type and spacing. The label says what the number is, so there is no line
        // under it repeating that; the register's categories ("Grunnskole, Offentlig skole …") repeat the tags
        // and are in "Mer fra skoleregisteret".
        const grades = [unit.SkoletrinnGSFra && `${unit.SkoletrinnGSFra}.–${unit.SkoletrinnGSTil}.`,
                        unit.SkoletrinnVGSFra && `VGS ${unit.SkoletrinnVGSFra}.–${unit.SkoletrinnVGSTil}.`]
            .filter(Boolean);
        const figures = [
            grades.length ? { label: 'Trinn', value: grades.join(', ') } : null,
            unit.Elevtall ? { label: 'Elever', value: new Intl.NumberFormat(I18N.locale).format(unit.Elevtall) } : null,
            unit.AntallAnsatte ? { label: 'Ansatte', value: new Intl.NumberFormat(I18N.locale).format(unit.AntallAnsatte) } : null,
            unit.Maalform ? { label: 'Målform', value: escapeHtml(unit.Maalform.Navn) } : null
        ].filter(Boolean);
        const extra = [
            unit.ErSpesialskole ? t('Spesialskole') : null,
            godkjenning,
            unit.Karakteristikk ? escapeHtml(unit.Karakteristikk) : null
        ].filter(Boolean);
        summary.innerHTML = `
            <dl class="key-figures__grid">${figures.map(f => `
                <div class="key-figures__item">
                    <dt class="key-figures__label">${t(f.label)}</dt>
                    <dd class="key-figures__value">${f.value}</dd>
                </div>`).join('')}
            </dl>
            ${extra.length ? `<p class="ds-paragraph key-figures__extra" data-size="sm">${extra.join(' · ')}</p>` : ''}
            <p class="key-figures__more"><a class="ds-link" href="#registeret">${t('Mer fra skoleregisteret')}${icon('chevronRight')}</a></p>`;

        target.innerHTML =
            // Visiting address and website are in the banner, so they are not repeated here
            section('Postadresse og beliggenhet', [
                ['Postadresse', address(unit.Postadresse)],
                ['Kommune', kommune],
                ['Fylke', unit.Fylke ? escapeHtml(unit.Fylke.Navn) : null]
            ])
            + section('Registeropplysninger', [
                ['Navn i registeret', escapeHtml(unit.FulltNavn || unit.Navn)],
                ['Organisasjonsnummer', escapeHtml(unit.Organisasjonsnummer)],
                ['Organisasjonsform', unit.Organisasjonsform ? escapeHtml(unit.Organisasjonsform.Navn) : null],
                ['Næringskode', (unit.Naeringskoder || []).map(n => `${escapeHtml(n.Kode)} ${escapeHtml(n.Navn)}`).join('<br>') || null],
                ['Status', status],
                ['Oppstart', date(unit.OppstartsEllerStiftelsesdato)],
                ['Sist endret i registeret', date(unit.DatoEndret)]
            ])
            + section('Tilknytning', relations)
            // Under the list on the left, with room above it
            + `<p class="ds-paragraph register-link"><a class="ds-link" href="${NSR_PAGE}${encodeURIComponent(unit.Organisasjonsnummer)}" target="_blank" rel="noopener">${t('Se skolen i Nasjonalt skoleregister')}${icon('externalLink')}</a></p>`;
    }
})();

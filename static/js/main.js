// Main application script
// Initializes the map and loads all school markers

// Global variables for search functionality
let schoolsData = [];
let schoolMarkers = new Map(); // Map of school unique key (name + kommune) -> marker

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing map application...');

    // Initialize the map
    const { map, markerCluster } = initMap();

    // Load school data from JSON and add markers
    loadSchoolData(map, markerCluster);
});

// Load school data from JSON file and create markers
function loadSchoolData(map, markerCluster) {
    fetch('static/js/school-data.json', { cache: 'no-cache' })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log(`Loaded data for ${data.schools.length} schools`);

            // Store the current year globally so popups can display it
            if (data.metadata && data.metadata.currentYear) {
                window.SCHOOL_DATA_YEAR = data.metadata.currentYear;
            }
            if (data.metadata) setDataTooltips(data.metadata);

            // Store schools data globally for search
            schoolsData = data.schools;

            // Update map center and zoom from loaded data
            if (data.mapConfig) {
                map.setView(data.mapConfig.center, data.mapConfig.zoom);
            }

            // Create markers for each school; Finder adds the ones that pass the filters
            const entries = createSchoolMarkers(data.schools);

            // Add the marker cluster to the map
            markerCluster.addTo(map);

            // Filters, address search and the school list
            Finder.init(map, markerCluster, entries);

            // School name search
            initializeSearch(map, markerCluster);

            console.log('✓ Map initialized successfully!');
        })
        .catch(error => {
            console.error('Error loading school data:', error);
            alert('Failed to load school data. Please ensure school-data.json exists.');
        });
}

// Create markers for all schools (not added to the map here).
// A school with both levels (1.–10. trinn) is in the data twice, once per level, with the same name,
// kommune and place. It becomes ONE entry and one marker: the barneskole record is the main one,
// `levels` has both, and `keys` both page keys (each level keeps its own school page).
function createSchoolMarkers(schools) {
    const byPlace = new Map();
    schools.forEach(school => {
        const place = `${school.name}|${school.kommune}`;
        if (!byPlace.has(place)) byPlace.set(place, []);
        byPlace.get(place).push(school);
    });

    return [...byPlace.values()].map(group => {
        const levels = group.slice().sort((a, b) => (a.schoolType === 'barneskole' ? -1 : 1) - (b.schoolType === 'barneskole' ? -1 : 1));
        const school = levels[0];
        const marker = levels.length > 1 ? createCombinedMarker(levels) : createSchoolMarker(school);
        const keys = levels.map(schoolKey);
        const entry = { key: keys[0], keys, school, levels, marker };
        keys.forEach(key => schoolMarkers.set(key, { marker, school }));
        return entry;
    });
}

// Create a single school marker
// Icon design: a round badge in the score colour with an Aksel icon:
// a backpack for barneskole and a school hat for ungdomsskole.
// - Barneskole (5th grade): 30x30 pixels
// - Ungdomsskole (secondary): 40x40 pixels
function createSchoolMarker(school) {
    const isUngdomsskole = school.schoolType === 'ungdomsskole';
    const size = isUngdomsskole ? 40 : 30;
    const half = size / 2;

    const schoolIcon = L.divIcon({
        html: `<span class="school-marker score-${scoreCategory(school.color)}">${schoolTypeIcon(school.schoolType)}</span>`,
        className: `school-marker-icon ${isUngdomsskole ? 'ungdomsskole-icon' : 'barnaskole-icon'}`,
        iconSize: [size, size],
        iconAnchor: [half, half],
        popupAnchor: [0, -half]
    });
    return bindSchoolPopup(L.marker([school.lat, school.lng], {
        icon: schoolIcon,
        title: `${school.name}, ${SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType}`
    }), [school]);
}

// A school with 1.–10. trinn: one marker, the backpack and the hat side by side, each in the colour
// of that level's result, so it is clear the school is both and how each level does
function createCombinedMarker(levels) {
    const [barne, ungdom] = levels;
    const icon = L.divIcon({
        html: `<span class="school-marker-pair">
                   <span class="school-marker score-${scoreCategory(barne.color)}">${schoolTypeIcon('barneskole')}</span>
                   <span class="school-marker score-${scoreCategory(ungdom.color)}">${schoolTypeIcon('ungdomsskole')}</span>
               </span>`,
        className: 'school-marker-icon combined-icon',
        iconSize: [74, 40],
        iconAnchor: [37, 20],
        popupAnchor: [0, -20]
    });
    return bindSchoolPopup(L.marker([barne.lat, barne.lng], {
        icon,
        title: `${barne.name}, ${t('Barne- og ungdomsskole (1.–10. trinn)')}`
    }), levels);
}

function bindSchoolPopup(marker, levels) {
    const school = levels[0];
    marker.bindPopup(() => {
        // Build the popup once, on first open, and keep the same element: Leaflet's
        // update() would otherwise re-insert the HTML and collapse an opened Historikk.
        if (!marker._popupElement) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = createPopupContent(levels).trim();
            marker._popupElement = wrapper.firstElementChild;
        }
        return marker._popupElement;
    }, {
        maxWidth: 320
    });

    // Add school data to marker for later retrieval
    marker.schoolData = school;
    marker.schoolLevels = levels;
    // Store color for cluster calculations
    marker.options.fillColor = school.color;
    return marker;
}

// Popup content for a school (Designsystemet heading, tag, paragraphs); a school with both levels
// gets one block per level, as the national tests are taken on 5. trinn and on ungdomstrinnet
function createPopupContent(levels) {
    const school = levels[0];
    const combined = levels.length > 1;
    const formatScore = (score) => (score === null || score === undefined) ? '*' : score;
    const typeLabel = combined ? t('Barne- og ungdomsskole (1.–10. trinn)') : (SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType);

    const levelHtml = level => {
        const subjects = level.hasData
            ? t('Engelsk {engelsk} · Lesing {lesing} · Regning {regning}', { engelsk: formatScore(level.engelsk), lesing: formatScore(level.lesing), regning: formatScore(level.regning) })
            : 'Ingen resultater publisert';
        // Snitt and Trivsel on one row; a missing value is a dash
        const snitt = level.hasData
            ? `<strong>Snitt</strong> ${formatDecimal(level.average)} <small>${t('({count} fag)', { count: level.validScoresCount })}</small>`
            : '<strong>Snitt</strong> –';
        const trivsel = level.trivsel
            ? `<strong>Trivsel</strong> ${formatDecimal(level.trivsel.score)} <small>${t('({trinn}. trinn)', { trinn: level.trivsel.trinn })}</small>`
            : '<strong>Trivsel</strong> –';
        const mobbing = level.mobbing
            ? `<strong>Mobbing</strong> ${formatPercent(level.mobbing.share)} <small>${t('(landet {value})', { value: formatPercent(level.mobbing.national) })}</small>`
            : '<strong>Mobbing</strong> –';
        return `${combined ? `<p class="ds-paragraph popup-level" data-size="xs"><span class="school-marker score-${scoreCategory(level.color)}" aria-hidden="true">${schoolTypeIcon(level.schoolType)}</span>${t(level.schoolType === 'barneskole' ? '5. trinn' : 'Ungdomstrinnet')}</p>` : ''}
            <p class="ds-paragraph popup-subjects" data-size="sm">${subjects}</p>
            <p class="ds-paragraph popup-stats" data-size="sm">${snitt} · ${trivsel}<br>${mobbing}</p>`;
    };

    const yearTag = window.SCHOOL_DATA_YEAR
        ? `<span class="ds-tag" data-color="neutral" data-size="sm">${window.SCHOOL_DATA_YEAR}</span>`
        : '';

    return `
        <div class="popup-school">
            <div class="popup-header">
                <h3 class="ds-heading popup-name" data-size="2xs">${escapeHtml(school.name)}</h3>
                ${yearTag}
            </div>
            <p class="ds-paragraph popup-kommune" data-size="xs">${escapeHtml(school.kommune)} · ${typeLabel}${school.eierform === 'privat' ? ` · ${t('Privat')}` : ''}</p>
            ${levels.map(levelHtml).join('')}
            ${schoolPhotoHtml(school, 'popup-photo')}
            <p class="ds-paragraph popup-more" data-size="sm">
                <a class="ds-link popup-more__link" href="${schoolUrl(school)}">Les mer om skolen${icon('arrowRight')}</a>
            </p>
        </div>`;
}

// Initialize search functionality (Designsystemet Suggestion / u-combobox)
const MAX_SEARCH_RESULTS = 10;

function initializeSearch(map, markerCluster) {
    const suggestion = document.getElementById('schoolSuggestion');
    const searchInput = document.getElementById('schoolSearch');
    const searchResults = document.getElementById('searchResults');

    if (!suggestion || !searchInput || !searchResults) {
        console.warn('Search elements not found, retrying in 100ms...');
        setTimeout(() => initializeSearch(map, markerCluster), 100);
        return;
    }

    // Render matching schools as options while the user types
    searchInput.addEventListener('input', function(event) {
        if (!event.isTrusted) return; // ignore the combobox clearing the field
        renderSearchResults(this.value.trim(), searchResults);
    });

    // An option was picked (click or keyboard). Prevent the combobox from
    // keeping it as a selected value, and go to the school instead.
    suggestion.addEventListener('comboboxbeforeselect', function(event) {
        event.preventDefault();
        const option = event.detail;
        const key = option && option.value;
        if (!key || !schoolMarkers.has(key)) return;

        Finder.showSchool(key);

        searchInput.value = '';
        searchResults.innerHTML = '';
        searchInput.blur();
    });
}

// Find schools whose name (or kommune) matches the query, best matches first:
// name starts with query, name contains query, then kommune matches.
function findSchools(query) {
    const q = query.toLocaleLowerCase('nb');
    const rank = school => {
        const name = school.name.toLocaleLowerCase('nb');
        if (name.startsWith(q)) return 0;
        if (name.includes(q)) return 1;
        if (school.kommune.toLocaleLowerCase('nb').includes(q)) return 2;
        return -1;
    };

    return schoolsData
        .map(school => ({ school, rank: rank(school) }))
        .filter(item => item.rank >= 0)
        .sort((a, b) => a.rank - b.rank
            || a.school.name.localeCompare(b.school.name, 'nb')
            || a.school.schoolType.localeCompare(b.school.schoolType))
        .map(item => item.school);
}

// Fill the suggestion list with options for the query
function renderSearchResults(query, resultsContainer) {
    // Search only when the query has at least 2 characters
    if (query.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    // A school with both levels is one hit (its barneskole record comes first)
    const seen = new Set();
    const matchingSchools = findSchools(query).filter(school => {
        const place = `${school.name}|${school.kommune}`;
        if (seen.has(place)) return false;
        seen.add(place);
        return true;
    });
    const options = matchingSchools.slice(0, MAX_SEARCH_RESULTS).map(school => {
        const levels = schoolsData.filter(s => s.name === school.name && s.kommune === school.kommune);
        const type = levels.length > 1 ? t('Barne- og ungdomsskole (1.–10. trinn)') : (SCHOOL_TYPE_LABEL[school.schoolType] || school.schoolType);
        return `
            <u-option value="${escapeHtml(schoolKey(school))}" label="${escapeHtml(`${school.name}, ${school.kommune}, ${type}`)}">
                <span class="search-result-name">${highlightMatch(school.name, query)}</span>
                <span class="search-result-kommune">${highlightMatch(school.kommune, query)} · ${type}</span>
            </u-option>`;
    }).join('');

    let more = '';
    if (matchingSchools.length > MAX_SEARCH_RESULTS) {
        more = `<p class="ds-paragraph search-more" data-size="xs" aria-hidden="true">${t('Viser {shown} av {total} treff. Skriv mer for å snevre inn.', { shown: MAX_SEARCH_RESULTS, total: matchingSchools.length })}</p>`;
    }

    resultsContainer.innerHTML = options
        ? options + more
        : '<u-option data-empty value="">Ingen skoler funnet</u-option>';
    openSuggestions(resultsContainer, 'schoolSearch');
}

// The list opens on key presses; text that is pasted (or typed by an input
// method without key events) would otherwise leave it closed.
function openSuggestions(list, inputId) {
    const input = document.getElementById(inputId);
    if (list.hidden && document.activeElement === input) {
        input.click(); // the combobox opens its list when the input is clicked
    }
}

// Highlight matching text
function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="search-result-highlight">$1</mark>');
}

// Zoom to a school marker and open its popup
function zoomToMarker(targetMarker, map, markerCluster) {
    const school = targetMarker.schoolData;

    map.setView([school.lat, school.lng], 15, {
        animate: true,
        duration: 0.8
    });

    // Wait for zoom animation, then open popup
    setTimeout(function() {
        if (!map.hasLayer(targetMarker)) {
            // Marker is still clustered, use zoomToShowLayer
            markerCluster.zoomToShowLayer(targetMarker, function() {
                targetMarker.openPopup();
            });
        } else {
            targetMarker.openPopup();
        }
    }, 1000);
}

// The year and the national averages in the filter tooltips come from the data, so they stay right
// when the daily refresh (update_data.py) loads new numbers
function setDataTooltips(metadata) {
    const year = value => String(value).replace('-', '–');
    const snitt = document.getElementById('snittHelp');
    if (snitt && metadata.currentYear) {
        snitt.dataset.tooltip = t('Snittet er gjennomsnittet av skolens skalapoeng i engelsk, lesing og regning på nasjonale prøver {year}. Fag uten publisert resultat telles ikke med. Skalaen er satt slik at landsgjennomsnittet var 50 i 2022.',
            { year: year(metadata.currentYear) });
    }
    const mobbing = document.getElementById('mobbingHelp');
    if (mobbing && metadata.mobbing) {
        const percent = value => formatPercent(value).replace('&nbsp;', '\u00a0');
        mobbing.dataset.tooltip = t('Andelen elever som svarer at de er blitt mobbet to eller tre ganger i måneden eller oftere, av andre elever, digitalt eller av voksne på skolen. Elevundersøkelsen {year}, 7. trinn for barneskoler og 10. trinn for ungdomsskoler. Landsgjennomsnittet er {barne} på 7. trinn og {ungdom} på 10. trinn. Små grupper er skjult av Udir.',
            { year: year(metadata.mobbing.year), barne: percent(metadata.mobbing.national['7']), ungdom: percent(metadata.mobbing.national['10']) });
    }
}

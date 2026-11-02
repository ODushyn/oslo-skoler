// Main application script
// Initializes the map and loads all school markers

// Global variables for search functionality
let schoolsData = [];
let schoolMarkers = new Map(); // Map of school unique key (name + kommune) -> marker

// Dialogs and the info popover are opened and closed by Designsystemet
// (native <dialog>, popover and command/commandfor), so no helpers are needed here.

// ── Feedback form handler ─────────────────────────────────────────────────────
async function handleFeedbackSubmit(event) {
    event.preventDefault();
    const form = document.getElementById('feedbackForm');
    const btn = document.getElementById('feedbackSubmitBtn');
    const status = document.getElementById('feedbackStatus');

    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Sender...';
    status.hidden = true;

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            status.dataset.color = 'success';
            status.textContent = 'Takk! Meldingen din er sendt.';
            status.hidden = false;
            form.reset();
            btn.removeAttribute('aria-busy');
            btn.textContent = 'Sendt!';
        } else {
            throw new Error('server error');
        }
    } catch (_) {
        status.dataset.color = 'danger';
        status.textContent = 'Noe gikk galt. Prøv igjen eller send e-post direkte.';
        status.hidden = false;
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = 'Send melding';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing map application...');

    // Load UI components (info modal and legend)
    loadUIComponents();

    // Initialize the map
    const { map, markerCluster } = initMap();

    // Load school data from JSON and add markers
    loadSchoolData(map, markerCluster);
});

// Load UI components from external HTML
function loadUIComponents() {
    fetch('static/templates/info-modal.html', { cache: 'no-cache' })
        .then(response => response.text())
        .then(html => {
            document.getElementById('ui-components').innerHTML = html;
            // Legend shows the same badge as the map markers
            document.querySelectorAll('[data-legend-icon]').forEach(el => { el.innerHTML = HAT_SCHOOL_ICON; });
        })
        .catch(error => {
            console.error('Error loading UI components:', error);
        });
}

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

            // Store schools data globally for search
            schoolsData = data.schools;

            // Update map center and zoom from loaded data
            if (data.mapConfig) {
                map.setView(data.mapConfig.center, data.mapConfig.zoom);
            }

            // Create markers for each school
            createSchoolMarkers(data.schools, markerCluster);

            // Add the marker cluster to the map
            markerCluster.addTo(map);

            // Initialize search functionality
            initializeSearch(map, markerCluster);

            console.log('✓ Map initialized successfully!');
        })
        .catch(error => {
            console.error('Error loading school data:', error);
            alert('Failed to load school data. Please ensure school-data.json exists.');
        });
}

// Create markers for all schools
function createSchoolMarkers(schools, markerCluster) {
    schools.forEach(school => {
        const marker = createSchoolMarker(school);
        marker.addTo(markerCluster);

        // Store marker reference for search using unique key (name + kommune)
        const uniqueKey = `${school.name}|${school.kommune}`;
        schoolMarkers.set(uniqueKey, { marker: marker, school: school });
    });
}

// Create a single school marker
// Icon design: a round badge in the score colour with the Aksel "HatSchool" icon.
// - Barneskole (5th grade): 30x30 pixels
// - Ungdomsskole (secondary): 40x40 pixels
function createSchoolMarker(school) {
    const popupContent = createPopupContent(school);

    // Determine icon size based on school type
    const isUngdomsskole = school.schoolType === 'ungdomsskole';
    const iconSize = isUngdomsskole ? 40 : 30;
    const iconAnchor = iconSize / 2;

    const schoolIcon = L.divIcon({
        html: `<span class="school-marker score-${scoreCategory(school.color)}">${HAT_SCHOOL_ICON}</span>`,
        className: `school-marker-icon ${isUngdomsskole ? 'ungdomsskole-icon' : 'barnaskole-icon'}`,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconAnchor, iconAnchor],
        popupAnchor: [0, -iconAnchor]
    });

    const marker = L.marker(
        [school.lat, school.lng],
        {
            icon: schoolIcon
        }
    ).bindPopup(popupContent, {
        maxWidth: 320
    });

    // Add school data to marker for later retrieval
    marker.schoolData = school;
    // Store color for cluster calculations
    marker.options.fillColor = school.color;

    return marker;
}

// Create popup content for a school (Designsystemet heading, tag, paragraph and table)
function createPopupContent(school) {
    const formatScore = (score) => (score === null || score === undefined) ? '*' : score;

    const currentScores = school.hasData
        ? `<p class="ds-paragraph" data-size="sm">
               <strong>Engelsk:</strong> ${formatScore(school.engelsk)}&nbsp;&nbsp;
               <strong>Lesing:</strong> ${formatScore(school.lesing)}&nbsp;&nbsp;
               <strong>Regning:</strong> ${formatScore(school.regning)}<br>
               <strong>Snitt:</strong> ${school.average.toFixed(1)} <small>(${school.validScoresCount} fag)</small>
           </p>`
        : `<p class="ds-paragraph" data-size="sm">
               <strong>Engelsk:</strong> *&nbsp;&nbsp;<strong>Lesing:</strong> *&nbsp;&nbsp;<strong>Regning:</strong> *<br>
               <em class="popup-muted">Ingen data tilgjengelig</em>
           </p>`;

    let historyHtml = '';
    if (school.history && school.history.length > 0) {
        const rows = [...school.history].reverse().map(h => {
            const scores = [h.engelsk, h.lesing, h.regning].filter(s => s !== null && s !== undefined);
            const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '*';
            return `<tr>
                <td>${h.year}</td>
                <td>${formatScore(h.engelsk)}</td>
                <td>${formatScore(h.lesing)}</td>
                <td>${formatScore(h.regning)}</td>
                <td>${avg}</td>
            </tr>`;
        }).join('');

        historyHtml = `
            <div class="popup-history">
                <h4 class="ds-heading" data-size="2xs">Historikk</h4>
                <table class="ds-table popup-history-table" data-size="sm" data-border>
                    <thead>
                        <tr><th>År</th><th>Eng</th><th>Les</th><th>Reg</th><th>Snitt</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    const yearTag = window.SCHOOL_DATA_YEAR
        ? `<span class="ds-tag" data-color="neutral" data-size="sm">${window.SCHOOL_DATA_YEAR}</span>`
        : '';

    return `
        <div class="popup-school">
            <div class="popup-header">
                <h3 class="ds-heading popup-name" data-size="2xs">${school.name}</h3>
                ${yearTag}
            </div>
            <p class="ds-paragraph popup-kommune" data-size="xs">${school.kommune}</p>
            <div class="popup-current">${currentScores}</div>
            ${historyHtml}
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

    // Render matching schools as options while typing
    searchInput.addEventListener('input', function() {
        renderSearchResults(this.value.trim(), searchResults);
    });

    // An option was picked (click or keyboard). Prevent the combobox from
    // keeping it as a selected value, and zoom to the school instead.
    suggestion.addEventListener('comboboxbeforeselect', function(event) {
        event.preventDefault();
        const option = event.detail;
        const key = option && option.value;
        if (!key || !schoolMarkers.has(key)) return;

        const { school } = schoolMarkers.get(key);
        zoomToSchool(school.name, school.kommune, map, markerCluster);

        searchInput.value = '';
        renderSearchResults('', searchResults);
        searchInput.blur();
    });
}

// Find schools matching the query, best matches first
function findSchools(query) {
    const queryLower = query.toLowerCase();

    const matchingSchools = schoolsData.filter(school =>
        school.name.toLowerCase().includes(queryLower)
    );

    // Sort by relevance (starts with query first, then contains)
    matchingSchools.sort((a, b) => {
        const aStartsWith = a.name.toLowerCase().startsWith(queryLower);
        const bStartsWith = b.name.toLowerCase().startsWith(queryLower);

        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;
        return a.name.localeCompare(b.name);
    });

    return matchingSchools;
}

// Fill the suggestion list with options for the query
function renderSearchResults(query, resultsContainer) {
    const empty = '<u-option data-empty>Ingen skoler funnet</u-option>';

    // Search only when the query has at least 2 characters
    if (query.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    const matchingSchools = findSchools(query);
    const options = matchingSchools.slice(0, MAX_SEARCH_RESULTS).map(school => {
        const key = `${school.name}|${school.kommune}`;
        return `
            <u-option value="${escapeHtml(key)}" label="${escapeHtml(school.name)}">
                <span class="search-result-name">${highlightMatch(school.name, query)}</span>
                <span class="search-result-kommune">${escapeHtml(school.kommune)}</span>
            </u-option>`;
    }).join('');

    let more = '';
    if (matchingSchools.length > MAX_SEARCH_RESULTS) {
        more = `<p class="ds-paragraph search-more" data-size="xs" aria-hidden="true">Viser ${MAX_SEARCH_RESULTS} av ${matchingSchools.length} resultater</p>`;
    }

    resultsContainer.innerHTML = options + more + empty;
}

// Highlight matching text in school name
function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="search-result-highlight">$1</mark>');
}

// Escape HTML special characters
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Escape special regex characters
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Zoom to a specific school on the map
function zoomToSchool(schoolName, schoolKommune, map, markerCluster) {
    // Find the marker in the cluster by school name AND kommune
    let targetMarker = null;
    const allMarkers = markerCluster.getLayers();

    for (let i = 0; i < allMarkers.length; i++) {
        const marker = allMarkers[i];
        if (marker.schoolData &&
            marker.schoolData.name === schoolName &&
            marker.schoolData.kommune === schoolKommune) {
            targetMarker = marker;
            break;
        }
    }

    if (!targetMarker) {
        console.error('Marker not found for school:', schoolName, 'in kommune:', schoolKommune);
        return;
    }

    const school = targetMarker.schoolData;

    // Zoom to school location
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
            // Marker is visible, open popup directly
            targetMarker.openPopup();
        }
    }, 1000);
}

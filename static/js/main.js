// Main application script
// Initializes the map and loads all school markers

// Global variables for search functionality
let schoolsData = [];
let schoolMarkers = new Map(); // Map of school unique key (name + kommune) -> marker

// ── Legend & modal helpers (must be global for inline onclick handlers) ───────
function legendOpen() {
    const panel = document.getElementById('legendExpanded');
    const btn = document.getElementById('legendCollapsed');
    if (panel.style.display === 'block') {
        legendClose();
        return;
    }
    panel.style.display = 'block';
    btn.style.backgroundColor = '#357ae8';

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', _legendOutsideHandler);
    }, 0);
}
function legendClose() {
    const panel = document.getElementById('legendExpanded');
    const btn = document.getElementById('legendCollapsed');
    panel.style.display = 'none';
    btn.style.backgroundColor = '#4285f4';
    document.removeEventListener('click', _legendOutsideHandler);
}
function _legendOutsideHandler(e) {
    const box = document.getElementById('legendBox');
    if (box && !box.contains(e.target)) {
        legendClose();
    }
}
function openModal(id) {
    document.getElementById(id).classList.add('is-open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('is-open');
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
    fetch('static/templates/info-modal.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('ui-components').innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading UI components:', error);
        });
}

// Load school data from JSON file and create markers
function loadSchoolData(map, markerCluster) {
    fetch('static/js/school-data.json')
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
// Icon design:
// - Barnaskole (5th grade): Small building with flag (30x30 pixels)
// - Ungdomskole (secondary): Larger/taller building icon (40x40 pixels)
function createSchoolMarker(school) {
    const popupContent = createPopupContent(school);

    // Determine icon size based on school type
    const isUngdomsskole = school.schoolType === 'ungdomsskole';
    const iconSize = isUngdomsskole ? 40 : 30;
    const iconAnchor = iconSize / 2;

    // Create custom school icon with SVG
    const schoolIcon = L.divIcon({
        html: `
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <!-- School building with flag -->
                <g>
                    <!-- Building -->
                    <rect x="4" y="10" width="16" height="12" fill="${school.color}" stroke="#fff" stroke-width="1.2"/>
                    <!-- Roof -->
                    <path d="M2 10 L12 4 L22 10 Z" fill="${school.color}" stroke="#fff" stroke-width="1.2"/>
                    <!-- Door -->
                    <rect x="10" y="16" width="4" height="6" fill="#fff" opacity="0.4"/>
                    <!-- Windows -->
                    <rect x="6" y="12" width="2.5" height="2.5" fill="#fff" opacity="0.5"/>
                    <rect x="15.5" y="12" width="2.5" height="2.5" fill="#fff" opacity="0.5"/>
                    <!-- Flag pole -->
                    <line x1="12" y1="4" x2="12" y2="1" stroke="#fff" stroke-width="0.8"/>
                    <!-- Flag -->
                    <path d="M12 1 L16 2.5 L12 4 Z" fill="#fff" opacity="0.7"/>
                </g>
            </svg>
        `,
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

// Create popup content for a school
function createPopupContent(school) {
    const formatScore = (score) => (score === null || score === undefined) ? '*' : score;

    const currentScores = school.hasData
        ? `<b>Engelsk:</b> ${formatScore(school.engelsk)}&nbsp;&nbsp;
           <b>Lesing:</b> ${formatScore(school.lesing)}&nbsp;&nbsp;
           <b>Regning:</b> ${formatScore(school.regning)}<br>
           <b>Snitt:</b> ${school.average.toFixed(1)} <small>(${school.validScoresCount} fag)</small>`
        : `<b>Engelsk:</b> *&nbsp;&nbsp;<b>Lesing:</b> *&nbsp;&nbsp;<b>Regning:</b> *<br>
           <i style="color:#888">Ingen data tilgjengelig</i>`;

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
                <b>Historikk</b>
                <table class="popup-history-table">
                    <thead>
                        <tr><th>År</th><th>Eng</th><th>Les</th><th>Reg</th><th>Snitt</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    }

    return `
        <div class="popup-school">
            <div class="popup-header">
                <span class="popup-name">${school.name}</span>
                <span class="popup-year">${window.SCHOOL_DATA_YEAR || ''}</span>
            </div>
            <div class="popup-kommune">${school.kommune}</div>
            <div class="popup-current">${currentScores}</div>
            ${historyHtml}
        </div>`;
}

// Initialize search functionality
function initializeSearch(map, markerCluster) {
    const searchInput = document.getElementById('schoolSearch');
    const searchResults = document.getElementById('searchResults');
    const clearButton = document.getElementById('clearSearch');

    if (!searchInput || !searchResults || !clearButton) {
        console.warn('Search elements not found, retrying in 100ms...');
        setTimeout(() => initializeSearch(map, markerCluster), 100);
        return;
    }

    // Handle input changes
    searchInput.addEventListener('input', function() {
        const query = this.value.trim();

        // Show/hide clear button
        if (query.length > 0) {
            clearButton.classList.add('visible');
        } else {
            clearButton.classList.remove('visible');
        }

        // Perform search if query has at least 2 characters
        if (query.length >= 2) {
            performSearch(query, searchResults, map, markerCluster);
        } else {
            searchResults.classList.remove('visible');
            searchResults.innerHTML = '';
        }
    });

    // Handle clear button click
    clearButton.addEventListener('click', function() {
        searchInput.value = '';
        clearButton.classList.remove('visible');
        searchResults.classList.remove('visible');
        searchResults.innerHTML = '';
        searchInput.focus();
    });

    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.remove('visible');
        }
    });

    // Show results when clicking on search input if there's a query
    searchInput.addEventListener('click', function() {
        if (this.value.trim().length >= 2) {
            searchResults.classList.add('visible');
        }
    });
}

// Perform search and display results
function performSearch(query, resultsContainer, map, markerCluster) {
    const queryLower = query.toLowerCase();

    // Filter schools that match the query
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

    // Display results
    if (matchingSchools.length > 0) {
        const maxResults = 10;
        const resultsToShow = matchingSchools.slice(0, maxResults);

        resultsContainer.innerHTML = resultsToShow.map(school => {
            const highlightedName = highlightMatch(school.name, query);
            return `
                <div class="search-result-item" data-school-name="${escapeHtml(school.name)}" data-school-kommune="${escapeHtml(school.kommune)}">
                    <div class="search-result-name">${highlightedName}</div>
                    <div class="search-result-kommune">${escapeHtml(school.kommune)}</div>
                </div>
            `;
        }).join('');

        // Add more results indicator if needed
        if (matchingSchools.length > maxResults) {
            resultsContainer.innerHTML += `
                <div class="no-results" style="font-style: normal; font-size: 12px;">
                    Viser ${maxResults} av ${matchingSchools.length} resultater
                </div>
            `;
        }

        // Add click handlers to result items
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', function() {
                const schoolName = this.getAttribute('data-school-name');
                const schoolKommune = this.getAttribute('data-school-kommune');
                zoomToSchool(schoolName, schoolKommune, map, markerCluster);
                resultsContainer.classList.remove('visible');

                // Optionally clear the search input
                const searchInput = document.getElementById('schoolSearch');
                const clearButton = document.getElementById('clearSearch');
                if (searchInput) {
                    searchInput.value = '';
                    clearButton.classList.remove('visible');
                }
            });
        });

        resultsContainer.classList.add('visible');
    } else {
        resultsContainer.innerHTML = '<div class="no-results">Ingen skoler funnet</div>';
        resultsContainer.classList.add('visible');
    }
}

// Highlight matching text in school name
function highlightMatch(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="search-result-highlight">$1</span>');
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

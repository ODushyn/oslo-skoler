// Main application script
// Initializes the map and loads all school markers

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

            // Update map center and zoom from loaded data
            if (data.mapConfig) {
                map.setView(data.mapConfig.center, data.mapConfig.zoom);
            }

            // Create markers for each school
            createSchoolMarkers(data.schools, markerCluster);

            // Add the marker cluster to the map
            markerCluster.addTo(map);

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
    });
}

// Create a single school marker
function createSchoolMarker(school) {
    const popupContent = createPopupContent(school);

    return L.circleMarker(
        [school.lat, school.lng],
        {
            radius: 8,
            color: school.color,
            fillColor: school.color,
            fillOpacity: 0.7,
            weight: 2
        }
    ).bindPopup(popupContent, {
        maxWidth: 250,
        lazy: true
    });
}

// Create popup content for a school
function createPopupContent(school) {
    const formatScore = (score) => score === null ? '*' : score;

    if (school.hasData) {
        return `
            <b>${school.name}</b><br>
            <b>Kommune:</b> ${school.kommune}<br>
            <br>
            <b>Engelsk:</b> ${formatScore(school.engelsk)}<br>
            <b>Lesing:</b> ${formatScore(school.lesing)}<br>
            <b>Regning:</b> ${formatScore(school.regning)}<br>
            <b>Gjennomsnitt:</b> ${school.average.toFixed(1)} (basert på ${school.validScoresCount} fag)
        `;
    } else {
        return `
            <b>${school.name}</b><br>
            <b>Kommune:</b> ${school.kommune}<br>
            <br>
            <b>Engelsk:</b> *<br>
            <b>Lesing:</b> *<br>
            <b>Regning:</b> *<br>
            <b>Status:</b> <i>Ingen data tilgjengelig</i>
        `;
    }
}


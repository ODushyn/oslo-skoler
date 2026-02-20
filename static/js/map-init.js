// Map initialization configuration
function initMap() {
    // Initialize map
    var map_a50579ea0c01426b15ce2ac53c4f579f = L.map(
        "map_a50579ea0c01426b15ce2ac53c4f579f",
        {
            center: [61.624746195799126, 10.01940767020763],
            crs: L.CRS.EPSG3857,
            zoom: 5,
            zoomControl: true,
            preferCanvas: true
        }
    );

    // Add tile layer
    var tile_layer_4d247cb440c4f464ef03b772875f5d7a = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            minZoom: 0,
            maxZoom: 19,
            maxNativeZoom: 19,
            noWrap: false,
            attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
            subdomains: "abc",
            detectRetina: false,
            tms: false,
            opacity: 1
        }
    );

    tile_layer_4d247cb440c4f464ef03b772875f5d7a.addTo(map_a50579ea0c01426b15ce2ac53c4f579f);

    // Initialize marker cluster
    var marker_cluster_66d9cb3de4e330e0d20b4c240f24f016 = L.markerClusterGroup({
        disableClusteringAtZoom: 13,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });

    // Custom cluster icon function
    marker_cluster_66d9cb3de4e330e0d20b4c240f24f016.options.iconCreateFunction = function(cluster) {
        var markers = cluster.getAllChildMarkers();
        var sum = 0;
        var count = 0;

        // Calculate average from all markers in cluster by reading their color
        // Exclude gray markers (no data) from calculations
        markers.forEach(function(marker) {
            if (marker.options && marker.options.fillColor) {
                var color = marker.options.fillColor;
                var avg = 0;

                // Reverse engineer average from color
                // Skip gray markers (#999999) - they have no data
                if (color === '#d73027') avg = 42;      // red: <45
                else if (color === '#fc8d59') avg = 47; // orange: 45-50
                else if (color === '#91cf60') avg = 52; // light green: 50-55
                else if (color === '#1a9850') avg = 57; // dark green: >55
                else if (color === '#999999') avg = -1; // gray: no data (skip)
                else avg = 50; // default

                // Only include markers with actual data (not gray)
                if (avg !== -1) {
                    sum += avg;
                    count++;
                }
            }
        });

        var average = count > 0 ? sum / count : 0;
        var color = '#999999'; // default gray

        // Color based on average (same logic as individual markers)
        // If no valid data markers, keep gray
        if (count > 0) {
            if (average < 45) {
                color = '#d73027'; // red
            } else if (average >= 45 && average < 50) {
                color = '#fc8d59'; // orange
            } else if (average >= 50 && average < 55) {
                color = '#91cf60'; // light green
            } else if (average >= 55) {
                color = '#1a9850'; // dark green
            }
        }

        var childCount = markers.length;
        var size = childCount < 10 ? 'small' : (childCount < 100 ? 'medium' : 'large');

        return L.divIcon({
            html: '<div style="background-color: ' + color + '; width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><span style="color: white; font-weight: bold;">' + childCount + '</span></div>',
            className: 'marker-cluster marker-cluster-' + size,
            iconSize: new L.Point(40, 40)
        });
    };

    return {
        map: map_a50579ea0c01426b15ce2ac53c4f579f,
        markerCluster: marker_cluster_66d9cb3de4e330e0d20b4c240f24f016
    };
}


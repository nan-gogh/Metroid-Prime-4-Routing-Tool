// Custom Markers layer
// User-placed markers with "cm" prefix UIDs
LAYERS.customMarkers = {
    name: "Custom Marker",
    icon: "📍",
    color: "#ff6b6b",
    markers: []
};

// Load custom markers from localStorage if available
(function() {
    try {
        const saved = localStorage.getItem('mp4_customMarkers');
        if (saved) {
            const data = JSON.parse(saved);
            if (Array.isArray(data)) {
                LAYERS.customMarkers.markers = data;
            }
        }
    } catch (e) {
        console.warn('Failed to load custom markers from localStorage:', e);
    }
})();

// Convenience export
const CUSTOM_MARKERS = LAYERS.customMarkers.markers;

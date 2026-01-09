// Central configuration and constants for MP4 Routing Tool
// Loaded before `map.js` via <script src="data/config.js"></script>

const MP4Config = {
    MAP_SIZE: 8192,
    TILE_RESOLUTIONS: [256, 512, 1024, 2048, 4096, 8192],

    HEATMAP: {
        BLOB_RADIUS: 65,
        OVERLAY_OPACITY: 0.7,
        MAX_CRYSTAL_COUNT: 16,
        HUE_RANGE: { MIN: 90, MAX: 130 }
    },

    GRID: {
        ROWS: 8,
        COLS: 8
    },

    LAYERS: {
        GREEN_CRYSTAL: ['geCrystallization1', 'geCrystallization2', 'geCrystallization3', 'geCrystalStorage', 'gibardaumRock']
    },

    STORAGE_KEYS: {
        CUSTOM_MARKERS: 'mp4_customMarkers',
        ROUTE: 'mp4_route',
        SETTINGS: 'mp4_settings'
    }
};

// Convenience top-level constant used by map.js for quick access
const GREEN_CRYSTAL_LAYERS = MP4Config.LAYERS.GREEN_CRYSTAL;

// Central configuration and constants for MP4 Routing Tool
// Loaded before `map.js` via <script src="data/config.js"></script>

const MP4Config = {
    MAP_SIZE: 8192,
    TILE_RESOLUTIONS: [256, 512, 1024, 2048, 4096, 8192],

    ZOOM: {
        DEFAULT_MIN: 0.05,
        MAX: 4
    },

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

    CUSTOM_MARKERS: {
        MAX_COUNT: 50
    },

    STORAGE_KEYS: {
        CUSTOM_MARKERS: 'mp4_customMarkers',
        ROUTE: 'mp4_route',
        ROUTE_LOOPING_FLAG: 'mp4_route_looping_flag',
        SETTINGS: 'mp4_settings'
    },

    ROUTE: {
        // Animation
        ANIMATION_SPEED: 100, // pixels per second
        DASH_OFFSET_WRAP: 1000000, // prevent floating point precision issues

        // Rendering
        LINE_WIDTH: 20, // default base stroke width
        NODE_SIZE_MULTIPLIER: 1.0, // route node size scaling
        NODE_MIN_SIZE: 2, // minimum route node size
        NODE_MAX_SIZE: 80, // maximum route node size

        // Interaction
        SEGMENT_DETECTION_THRESHOLD: 10, // pixels for route segment hover detection
        MOVE_THRESHOLD: 8, // pixels for drag detection

        // Computation
        EXPAND_PROXIMITY_THRESHOLD: 160, // pixels for nearby marker inclusion
        DP_MAX_INTERMEDIATES: 14, // 2^14 = 16k states for TSP solver
        MAX_INTERMEDIATES_PER_BUCKET: 14, // limit intermediates per segment bucket
        TSP_GREEDY_LIMIT: 14 // switch to greedy solver above this count
    }
};

// Convenience top-level constant used by map.js for quick access
const GREEN_CRYSTAL_LAYERS = MP4Config.LAYERS.GREEN_CRYSTAL;

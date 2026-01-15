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
        // Core data
        CUSTOM_MARKERS: 'mp4_customMarkers',
        ROUTE: 'mp4_route',
        ROUTE_LOOPING_FLAG: 'mp4_route_looping_flag',
        SETTINGS: 'mp4_settings',
        MARKER_SCALING: 'mp4_markerScaling',

        // UI state
        TILESET: 'mp4_tileset',
        TILESET_GRAYSCALE: 'mp4_tileset_grayscale',
        GRID_VISIBLE: 'mp4_grid_visible',
        GRID_HEATMAP: 'mp4_grid_heatmap',
        LAYER_VISIBILITY: 'mp4_layerVisibility',
        HIGHLIGHT_MULTIPLIER: 'mp4_highlightMultiplier',

        // Map view
        MAP_VIEW: 'mp4_map_view',

        // State persistence
        ROUTE_STATE: 'mp4_route_state',
        SELECTION_STATE: 'mp4_selection_state',
        LAYER_STATE: 'mp4_layer_state',

        // Consent
        STORAGE_CONSENT: 'mp4_storage_consent'
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
    },

    MARKER_SCALING: {
        // Base size for all markers (fixed default)
        baseSize: 4,
        
        // User scale multiplier (stored locally with consent, default 1.0)
        userScaleMultiplier: 1.0,
        
        // Highlight multiplier (stored locally with consent, ranges from 1.5x to 2.5x)
        highlightMultiplier: 2.0,
        
        // Selection bonus multiplier
        selectionMultiplier: 1.3,
        
        // Zoom level where markers start shrinking instead of growing (default 1.0)
        zoomShrinkThreshold: 0.5,
        
        // How much markers shrink beyond the threshold (0 = no shrinking, 1 = maximum shrinking)
        zoomShrinkRate: 0.75,
        
        // Size bounds (higher max to accommodate highlights)
        // COMMENTED OUT: Size limits removed for unlimited scaling
        /*
        minSize: 2,
        maxSize: 50
        */
    },

    TOUCH_PADDING: 4
};

// Convenience top-level constant used by map.js for quick access
const GREEN_CRYSTAL_LAYERS = MP4Config.LAYERS.GREEN_CRYSTAL;

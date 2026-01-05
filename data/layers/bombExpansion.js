// Bomb Expansion layer
// Requires data/init.js to be loaded first
LAYERS.bombExpansion = {
    name: "Bomb Expansion",
    icon: "💣",
    color: "#edaa00ff",
    prefix: "be",
    markers: [
        {"uid": "be_3748ff50", "x": 0.2137172009954225, "y": 0.4233460991445133},
        {"uid": "be_70c222f7", "x": 0.837407352222202, "y": 0.5457904196921349}
    ]
};

// Convenience export for backward compatibility
const BOMB_EXPANSION = LAYERS.bombExpansion.markers;


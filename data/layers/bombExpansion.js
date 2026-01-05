// Bomb Expansion layer
// Requires data/init.js to be loaded first
LAYERS.bombExpansion = {
    name: "Bomb Expansion",
    icon: "💣",
    //color: "#c3c325ff",
    color: "#edaa00ff",
    prefix: "be",
    markers: [
        {"uid": "be_3748ff50", "x": 0.2137172009954225, "y": 0.4233460991445133},
        {"uid": "be_01f21934", "x": 0.8354587652114908, "y": 0.5509864744212048}
    ]
};

// Convenience export for backward compatibility
const BOMB_EXPANSION = LAYERS.bombExpansion.markers;


// Dungeon layer
// Requires data/init.js to be loaded first
LAYERS.entrance = {
    name: "Entrance",
    icon: "🏛️",
    color: "#1d61c6ff",
    prefix: "du",
    markers: [
        {"uid": "du_2835f9e2", "x": 0.1391926561402145, "y": 0.1586829367741811},
        {"uid": "du_5c511c8f", "x": 0.7873489111301732, "y": 0.1985043978579713},
        {"uid": "du_122f9bbd", "x": 0.1276831276248759, "y": 0.4991049520492241},
        {"uid": "du_1486ce67", "x": 0.4926057006752457, "y": 0.5053875093769432},
        {"uid": "du_6f185985", "x": 0.8661302056328725, "y": 0.8855633272333889},
        {"uid": "du_083a2aa5", "x": 0.0862930801024742, "y": 0.9048130741435421}
    ]
};

// Convenience export for backward compatibility
const ENTRANCE = LAYERS.entrance.markers;


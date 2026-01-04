// Dungeon layer
// Requires data/init.js to be loaded first
LAYERS.dungeon = {
    name: "Dungeon",
    icon: "🏰",
    color: "#1c5bb9ff",
    prefix: "du",
    markers: [
        {"uid": "du_2835f9e2", "x": 0.1391926561, "y": 0.1586829367},
        {"uid": "du_5c511c8f", "x": 0.7873489111, "y": 0.1985043978},
        {"uid": "du_122f9bbd", "x": 0.12768312762487594, "y": 0.49910495204922406},
        {"uid": "du_1486ce67", "x": 0.4926057006, "y": 0.5053875093},
        {"uid": "du_6f185985", "x": 0.8661302056, "y": 0.8855633272},
        {"uid": "du_083a2aa5", "x": 0.0862930801, "y": 0.9048130741}
    ]
};

// Convenience export for backward compatibility
const DUNGEON = LAYERS.dungeon.markers;


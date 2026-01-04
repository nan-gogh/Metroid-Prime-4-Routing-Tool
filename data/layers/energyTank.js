// Energy Tank layer
// Requires data/init.js to be loaded first
LAYERS.energyTank = {
    name: "Energy Tank",
    icon: "🔋",
    color: "#10b981",
    prefix: "et",
    markers: [
        {"uid": "et_7f3b172d", "x": 0.1983682714, "y": 0.3624833894},
        {"uid": "et_7161ceb1", "x": 0.5977351633, "y": 0.7133422078},
        {"uid": "et_65023da8", "x": 0.1316696435, "y": 0.8828841505}
    ]
};

// Convenience export for backward compatibility
const ENERGY_TANK = LAYERS.energyTank.markers;


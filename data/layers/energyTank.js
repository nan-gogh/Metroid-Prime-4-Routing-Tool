// Energy Tank layer
// Requires data/init.js to be loaded first
LAYERS.energyTank = {
    name: "Energy Tank",
    icon: "🔋",
    color: "#432fd7ff",
    prefix: "et",
    markers: [
        {"uid": "et_7f3b172d", "x": 0.1983682714250445, "y": 0.3624833894793142},
        {"uid": "et_7161ceb1", "x": 0.5977351633595708, "y": 0.7133422078310982},
        {"uid": "et_65023da8", "x": 0.1316696435015012, "y": 0.8828841505423201}
    ]
};

// Convenience export for backward compatibility
const ENERGY_TANK = LAYERS.energyTank.markers;


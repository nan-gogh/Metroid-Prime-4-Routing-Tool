// Energy Tank layer
// Requires data/init.js to be loaded first
LAYERS.energyTank = {
    name: "Energy Tank",
    icon: "🔋",
    color: "#432fd7ff",
    prefix: "et",
    markers: [
        {"uid": "et_7fa44772", "x": 0.5959126921538064, "y": 0.7037266405666568},
        {"uid": "et_275349e7", "x": 0.1264199312907212, "y": 0.8679251912576799},
        {"uid": "et_7e754c3e", "x": 0.18832543915050232, "y": 0.3560465145753382}
    ]
};

// Convenience export for backward compatibility
const ENERGY_TANK = LAYERS.energyTank.markers;


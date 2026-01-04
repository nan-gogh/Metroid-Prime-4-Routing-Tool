// Boost Tank layer
// Requires data/init.js to be loaded first
LAYERS.boostTank = {
    name: "Boost Tank",
    icon: "⬆️",
    color: "#9b2ddbff",
    prefix: "bt",
    markers: [
        {"uid": "bt_89dd2c04", "x": 0.8492538992, "y": 0.3976579433},
        {"uid": "bt_c37e0235", "x": 0.4475350154, "y": 0.5468866307},
        {"uid": "bt_eacfde4e", "x": 0.1176854391, "y": 0.6981646032}
    ]
};

// Convenience export for backward compatibility
const BOOST_TANK = LAYERS.boostTank.markers;


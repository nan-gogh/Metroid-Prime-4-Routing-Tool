// Mech Part layer
// Requires data/init.js to be loaded first
LAYERS.mechPart = {
    name: "Mech Part",
    icon: "⚙️",
    color: "#adadadff",
    prefix: "mp",
    markers: [
        {"uid": "mp_2d9a7912", "x": 0.1416219631, "y": 0.1813568717},
        {"uid": "mp_53e632ef", "x": 0.8204956486, "y": 0.5538336564},
        {"uid": "mp_e838dd7a", "x": 0.6672620355, "y": 0.5719809063},
        {"uid": "mp_afd58f84", "x": 0.2475264222, "y": 0.6029333023},
        {"uid": "ac_e89db89e", "x": 0.5315926221, "y": 0.179959593},
        {"uid": "mp_7f9fe12c", "x": 0.5468942178, "y": 0.838606087}
    ]
};

// Convenience export for backward compatibility
const MECH_PART = LAYERS.mechPart.markers;


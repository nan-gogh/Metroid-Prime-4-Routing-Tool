// GF Debris layer
// Requires data/init.js to be loaded first
LAYERS.gfDebris = {
    name: "GF Debris",
    icon: "🧱",
    color: "#7c3aed",
    prefix: "gfd",
    markers: [
        {"uid": "gfd_cab8678c", "x": 0.5256181484, "y": 0.1783615194},
        {"uid": "gfd_ac700177", "x": 0.8291637232, "y": 0.5505534138},
        {"uid": "gfd_64d6acff", "x": 0.2521473176, "y": 0.6054670953},
        {"uid": "gfd_d4821efb", "x": 0.5349303852, "y": 0.8364399085}
    ]
};

// Convenience export for backward compatibility
const GF_DEBRIS = LAYERS.gfDebris.markers;


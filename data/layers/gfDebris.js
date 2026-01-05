// GF Debris layer
// Requires data/init.js to be loaded first
LAYERS.gfDebris = {
    name: "GF Debris",
    icon: "🏢",
    color: "#3d4e54ff",
    prefix: "gfd",
    markers: [
        {"uid": "gfd_cab8678c", "x": 0.5256181484000000, "y": 0.1783615194000000},
        {"uid": "gfd_ac700177", "x": 0.8291637232000000, "y": 0.5505534138000000},
        {"uid": "gfd_64d6acff", "x": 0.2521473176000000, "y": 0.6054670953000000},
        {"uid": "gfd_d4821efb", "x": 0.5349303852000000, "y": 0.8364399085000000}
    ]
};

// Convenience export for backward compatibility
const GF_DEBRIS = LAYERS.gfDebris.markers;


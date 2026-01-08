// Missile Expansion layer
// Requires data/init.js to be loaded first
LAYERS.missileExpansion = {
    name: "Missile Expansion",
    icon: "🚀",
    //color: "#f97316",
    color: "#ef4444",
    prefix: "me",
    markers: [
        {"uid": "me_fd44f17c", "x": 0.5173225917201398, "y": 0.1794044836751141},
        {"uid": "me_de2fdb86", "x": 0.1435358773957038, "y": 0.1969467871104144},
        {"uid": "me_286b6470", "x": 0.2762096931982723, "y": 0.2554224611090350},
        {"uid": "me_cdaf2c0e", "x": 0.6072728874359640, "y": 0.3453433541301012},
        {"uid": "me_38a70462", "x": 0.2446636840084224, "y": 0.6057513627149708},
        {"uid": "me_8d16ea2e", "x": 0.1318123233884205, "y": 0.7224547552524291},
        {"uid": "me_426a0f31", "x": 0.3412020074289498, "y": 0.7553828857181212},
        {"uid": "me_3e111b0b", "x": 0.8553603789499966, "y": 0.7495034412655158},
        {"uid": "me_937b34ba", "x": 0.5266562439384933, "y": 0.8403605788084352},
        {"uid": "me_4f17bd08", "x": 0.4113942524113359, "y": 0.9004700039595241}
    ]
};

// Convenience export for backward compatibility
const MISSILE_EXPANSION = LAYERS.missileExpansion.markers;


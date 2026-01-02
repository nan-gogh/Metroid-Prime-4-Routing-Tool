// Route layer metadata
// Declared as a data file so the app can read route color/icon at load time
// Keep this file minimal; the route layer is virtual and does not store markers here.
if (typeof LAYERS === 'undefined') LAYERS = {};
LAYERS.route = {
    name: "Route",
    icon: "🧭",
    color: "#00ffb7ff"
};

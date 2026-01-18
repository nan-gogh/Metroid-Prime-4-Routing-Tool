// index.js
// Main entry point - centralized exports for the entire application

(function (global) {
  // Export all major module groups
  global.MP4Modules = {
    // State management
    StateManagers: global.StateManagers,

    // Rendering system
    Renderers: global.Renderers,

    // Input handling
    InputHandlers: global.InputHandlers,

    // Data management
    DataManagers: global.DataManagers,

    // Utilities
    Utils: global.Utils,

    // Tools
    Tools: global.Tools
  };

  // Export convenience accessors for commonly used modules
  global.MP4 = {
    // Core state managers
    get MapState() { return global.MapState; },
    get SelectionState() { return global.SelectionState; },
    get LayerState() { return global.LayerState; },

    // Core renderers
    get RenderPipeline() { return global.RenderPipeline; },
    get MarkerRenderer() { return global.MarkerRenderer; },
    get RouteRenderer() { return global.RouteRenderer; },

    // Core data managers
    get RouteManager() { return global.RouteManager; },
    get MarkerManager() { return global.MarkerManager; },

    // Core utilities
    get EventUtils() { return global.EventUtils; },
    get EventTypes() { return global.EventTypes; },
    get ErrorHandler() { return global.ErrorHandler; }
  };

})(typeof window !== 'undefined' ? window : global);
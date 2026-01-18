// utils/index.js
// Centralized exports for all utility modules

(function (global) {
  // Export all utilities for easier importing
  global.Utils = {
    EventUtils: global.EventUtils,
    ErrorHandler: global.ErrorHandler,
    EventTypes: global.EventTypes,
    ColorUtils: global.ColorUtils,
    RouteUtils: global.RouteUtils,
    MarkerUtils: global.MarkerUtils
  };

  // Export individual utilities for direct access
  if (global.EventUtils) global.EventUtils;
  if (global.ErrorHandler) global.ErrorHandler;
  if (global.EventTypes) global.EventTypes;
  if (global.ColorUtils) global.ColorUtils;
  if (global.RouteUtils) global.RouteUtils;
  if (global.MarkerUtils) global.MarkerUtils;

})(typeof window !== 'undefined' ? window : global);
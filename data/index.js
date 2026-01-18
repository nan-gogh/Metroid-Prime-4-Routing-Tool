// data/index.js
// Centralized exports for all data managers

(function (global) {
  // Export all data managers for easier importing
  global.DataManagers = {
    RouteManager: global.RouteManager,
    MarkerManager: global.MarkerManager,
    RouteComputation: global.RouteComputation,
    RouteUtils: global.RouteUtils,
    MarkerUtils: global.MarkerUtils,
    RouteUtilsCore: global.RouteUtilsCore,
    StorageUtils: global.StorageUtils
  };

  // Export individual managers for direct access
  if (global.RouteManager) global.RouteManager;
  if (global.MarkerManager) global.MarkerManager;
  if (global.RouteComputation) global.RouteComputation;
  if (global.RouteUtils) global.RouteUtils;
  if (global.MarkerUtils) global.MarkerUtils;
  if (global.RouteUtilsCore) global.RouteUtilsCore;
  if (global.StorageUtils) global.StorageUtils;

})(typeof window !== 'undefined' ? window : global);
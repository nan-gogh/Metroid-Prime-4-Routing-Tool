// tools/index.js
// Centralized exports for all tool modules

(function (global) {
  // Export all tools for easier importing
  global.Tools = {
    TSP_Euclid: global.TSP_Euclid
  };

  // Export individual tools for direct access
  if (global.TSP_Euclid) global.TSP_Euclid;

})(typeof window !== 'undefined' ? window : global);
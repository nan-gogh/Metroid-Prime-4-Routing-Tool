// input/index.js
// Centralized exports for all input handlers

(function (global) {
  // Export all input handlers for easier importing
  global.InputHandlers = {
    GestureHandler: global.GestureHandler,
    KeyboardHandler: global.KeyboardHandler,
    PointerHandler: global.PointerHandler,
    RouteEditHandler: global.RouteEditHandler
  };

  // Export individual handlers for direct access
  if (global.GestureHandler) global.GestureHandler;
  if (global.KeyboardHandler) global.KeyboardHandler;
  if (global.PointerHandler) global.PointerHandler;
  if (global.RouteEditHandler) global.RouteEditHandler;

})(typeof window !== 'undefined' ? window : global);
// state/index.js
// Centralized exports for all state managers

(function (global) {
  // Export all state managers for easier importing
  global.StateManagers = {
    BaseStateManager: global.BaseStateManager,
    MapState: global.MapState,
    SelectionState: global.SelectionState,
    LayerState: global.LayerState,
    RouteState: global.RouteState,
    EditModeState: global.EditModeState,
    HighlightState: global.HighlightState,
    TilesetState: global.TilesetState,
    RouteAnimationState: global.RouteAnimationState,
    RouteEditState: global.RouteEditState,
    DragState: global.DragState,
    HeatmapDisplayState: global.HeatmapDisplayState,
    ImageState: global.ImageState
  };

  // Export individual managers for direct access
  if (global.BaseStateManager) global.BaseStateManager;
  if (global.MapState) global.MapState;
  if (global.SelectionState) global.SelectionState;
  if (global.LayerState) global.LayerState;
  if (global.RouteState) global.RouteState;
  if (global.EditModeState) global.EditModeState;
  if (global.HighlightState) global.HighlightState;
  if (global.TilesetState) global.TilesetState;
  if (global.RouteAnimationState) global.RouteAnimationState;
  if (global.RouteEditState) global.RouteEditState;
  if (global.DragState) global.DragState;
  if (global.HeatmapDisplayState) global.HeatmapDisplayState;
  if (global.ImageState) global.ImageState;

})(typeof window !== 'undefined' ? window : global);
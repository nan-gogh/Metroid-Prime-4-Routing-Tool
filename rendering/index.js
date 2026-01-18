// rendering/index.js
// Centralized exports for all rendering components

(function (global) {
  // Export all renderers for easier importing
  global.Renderers = {
    TileRenderer: global.TileRenderer,
    HeatmapRenderer: global.HeatmapRenderer,
    GridRenderer: global.GridRenderer,
    MarkerRenderer: global.MarkerRenderer,
    RouteRenderer: global.RouteRenderer,
    OverlayRenderer: global.OverlayRenderer,
    CompositeStage: global.CompositeStage,
    TooltipManager: global.TooltipManager,
    RenderPipeline: global.RenderPipeline,
    RenderContext: global.RenderContext
  };

  // Export individual renderers for direct access
  if (global.TileRenderer) global.TileRenderer;
  if (global.HeatmapRenderer) global.HeatmapRenderer;
  if (global.GridRenderer) global.GridRenderer;
  if (global.MarkerRenderer) global.MarkerRenderer;
  if (global.RouteRenderer) global.RouteRenderer;
  if (global.OverlayRenderer) global.OverlayRenderer;
  if (global.CompositeStage) global.CompositeStage;
  if (global.TooltipManager) global.TooltipManager;
  if (global.RenderPipeline) global.RenderPipeline;
  if (global.RenderContext) global.RenderContext;

})(typeof window !== 'undefined' ? window : global);
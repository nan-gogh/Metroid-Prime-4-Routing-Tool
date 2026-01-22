// data/RouteAnimationController.js
// Centralizes RAF lifecycle for route dash animation
(function(global){
  const DEFAULTS = {
    DEFAULT_SPEED: (global.MP4Config && global.MP4Config.ROUTE && global.MP4Config.ROUTE.ANIMATION_SPEED) || 100,
    DASH_OFFSET_WRAP: (global.MP4Config && global.MP4Config.ROUTE && global.MP4Config.ROUTE.DASH_OFFSET_WRAP) || 40
  };

  function start(opts = {}) {
    const { routeAnimationState, routeManager, mapState, eventBus, renderCallback, errorHandler } = opts;
    const h = errorHandler || (global.RouteAnimation && global.RouteAnimation._errorHandler) || global.__MP4_NOOP_ERROR_HANDLER;
    if (!routeAnimationState) return;

    try {
      if (routeAnimationState.getAnimationFrameId && routeAnimationState.getAnimationFrameId()) return;
    } catch (e) {}

    try { routeAnimationState.setLastAnimationTime(performance.now()); } catch (e) {}

    const step = (timestamp) => {
      try {
        const lastTime = routeAnimationState.getLastAnimationTime() || 0;
        const dt = Math.max(0, timestamp - lastTime) / 1000;
        routeAnimationState.setLastAnimationTime(timestamp);

        const dir = (routeAnimationState.getAnimationDirection ? routeAnimationState.getAnimationDirection() : 1) || 1;
        const zoomFactor = (mapState && typeof mapState.zoom === 'number' && mapState.zoom > 0) ? mapState.zoom : 1;
        const speed = routeAnimationState.getAnimationSpeed ? routeAnimationState.getAnimationSpeed() : DEFAULTS.DEFAULT_SPEED;

        const currentOffset = routeAnimationState.getAnimationOffset ? routeAnimationState.getAnimationOffset() : 0;
        const newOffset = (currentOffset + speed * dt * dir * zoomFactor + DEFAULTS.DASH_OFFSET_WRAP) % DEFAULTS.DASH_OFFSET_WRAP;
        routeAnimationState.setAnimationOffset(newOffset);

        const hasRoute = routeManager && Array.isArray(routeManager.currentRoute) && routeManager.currentRoute.length;
        if (!hasRoute) {
          stop({ routeAnimationState, errorHandler: h });
          return;
        }

        try {
          if (typeof renderCallback === 'function') {
            renderCallback();
          } else if (eventBus && global.EventTypes && global.EventTypes.RENDER_SELECTIVE_REQUESTED) {
            try { eventBus.emit(global.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: ['RouteRenderer'] }); } catch (e) { h && h.logWarning && h.logWarning(e, 'RouteAnimationController.step.emitRender'); }
          } else if (global.eventBus && global.EventTypes && global.EventTypes.RENDER_SELECTIVE_REQUESTED) {
            try { global.eventBus.emit(global.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: ['RouteRenderer'] }); } catch (e) { h && h.logWarning && h.logWarning(e, 'RouteAnimationController.step.emitRenderGlobal'); }
          }
        } catch (e) { h && h.logWarning && h.logWarning(e, 'RouteAnimationController.step.renderRequest'); }

        const rafId = requestAnimationFrame(step);
        try { routeAnimationState.setAnimationFrameId(rafId); } catch (e) {}
      } catch (e) {
        h && h.logWarning && h.logWarning(e, 'RouteAnimationController.step');
      }
    };

    try {
      const rafId = requestAnimationFrame(step);
      try { routeAnimationState.setAnimationFrameId(rafId); } catch (e) {}
      try { routeAnimationState.startAnimation && routeAnimationState.startAnimation(); } catch (e) {}
    } catch (e) {
      h && h.logWarning && h.logWarning(e, 'RouteAnimationController.start.kickoff');
    }
  }

  function stop(opts = {}) {
    const { routeAnimationState, errorHandler } = opts;
    const h = errorHandler || (global.RouteAnimation && global.RouteAnimation._errorHandler) || global.__MP4_NOOP_ERROR_HANDLER;
    if (!routeAnimationState) return;
    try {
      const cur = routeAnimationState.getAnimationFrameId && routeAnimationState.getAnimationFrameId();
      if (cur) {
        try { cancelAnimationFrame(cur); } catch (e) {}
        try { routeAnimationState.setAnimationFrameId(null); } catch (e) {}
      }
      try { routeAnimationState.stopAnimation && routeAnimationState.stopAnimation(); } catch (e) {}
    } catch (e) { h && h.logWarning && h.logWarning(e, 'RouteAnimationController.stop'); }
  }

  global.RouteAnimationController = { start, stop };
})(window);

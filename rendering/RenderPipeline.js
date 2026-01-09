// rendering/RenderPipeline.js
// Orchestrates rendering order across renderers. Simple initial implementation.

(function (global) {
  class RenderPipeline {
    constructor(stages) {
      this.stages = stages || [];
    }

    add(stage) { this.stages.push(stage); }
    render() {
      for (let s of this.stages) {
        try {
          if (s && typeof s.render === 'function') s.render();
        } catch (e) { console.debug('RenderPipeline: stage failed', e); }
      }
    }
  }

  global.RenderPipeline = RenderPipeline;
})(window);

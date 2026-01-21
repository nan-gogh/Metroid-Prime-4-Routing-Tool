// rendering/RenderPipeline.js
// Orchestrates rendering order across renderers with staged control and profiling hooks.

(function (global) {
  // Shared, guarded NOOP error handler to avoid per-file duplicates
  if (typeof globalThis.NOOP_ERROR_HANDLER === 'undefined') {
    globalThis.NOOP_ERROR_HANDLER = { logDebug: function(){}, logWarning: function(){}, logError: function(){} };
  }

  class RenderPipeline {
    /**
     * Creates a new RenderPipeline instance for orchestrating multiple rendering stages.
     * @param {Array} stages - Array of renderer objects with render() methods to be managed
     * @param {RenderContext} renderContext - The render context providing canvas access
     * @param {MapState} [mapState] - Optional MapState for creating ViewportContext
     */
    constructor(stages, renderContext, mapState, options = {}) {
      this.errorHandler = global.errorHandler || globalThis.NOOP_ERROR_HANDLER;
      this.eventBus = options.eventBus || null;
      this.stages = stages || [];
      this.renderContext = renderContext; // Store render context for passing to renderers
      this.mapState = mapState; // Store mapState for creating ViewportContext during render
      this._enabledStages = new Set(); // Track enabled stages
      this._stageOrder = []; // Custom ordering
      this._profilingEnabled = false;
      this._performanceStats = new Map();
      this._renderCount = 0;
      this._lastRenderTime = 0;
      this._averageRenderTime = 0;

      // Performance optimization: dirty flag tracking and render batching
      this._dirtyFlags = new Set(); // Track which renderers need updating
      this._frameScheduled = false; // Prevent multiple rAF calls

      // Instrumentation API for performance diagnostics
      this.instrumentation = (typeof PerformanceInstrumentation !== 'undefined')
        ? new PerformanceInstrumentation()
        : null;

      // Initialize all stages as enabled by default
      this.stages.forEach((stage, index) => {
        if (stage && typeof stage.render === 'function') {
          this._enabledStages.add(stage);
          this._stageOrder.push(stage);
        }
      });
    }

    /**
     * Marks a specific renderer as dirty, indicating it needs re-rendering.
     * Automatically schedules a render frame if one isn't already scheduled.
     * @param {string} rendererName - The constructor name of the renderer to mark dirty
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    markDirty(rendererName) {
      this._dirtyFlags.add(rendererName);
      // Emit event to notify other modules that a renderer needs updating
      if (this.eventBus) {
        this.eventBus.emit(window.EventTypes.RENDER_PIPELINE_DIRTY, { renderer: rendererName });
      }
      this._scheduleRender();
      return this;
    }

    /**
     * Schedules a render frame using requestAnimationFrame to batch multiple render calls.
     * Prevents excessive rendering when multiple dirty flags are set in quick succession.
     * @private
     */
    _scheduleRender() {
      if (this._frameScheduled) return;

      this._frameScheduled = true;
      requestAnimationFrame(() => {
        this._frameScheduled = false;
        this.render(this._dirtyFlags);
        this._clearDirtyFlags();
      });
    }

    /**
     * Forces an immediate render of all enabled stages, bypassing the dirty flag system.
     * Useful for initial setup or when a full redraw is required.
     * @returns {Array} Array of stage names that were successfully rendered
     */
    forceRender() {
      return this.render();
    }

    /**
     * Checks if any renderers are currently marked as dirty.
     * @returns {boolean} True if any renderers are dirty, false otherwise
     */
    hasDirtyRenderers() {
      return this._dirtyFlags.size > 0;
    }

    /**
     * Gets the set of currently dirty renderer names.
     * @returns {Set} Set of dirty renderer names
     */
    getDirtyRenderers() {
      return new Set(this._dirtyFlags);
    }

    /**
     * Clears all dirty flags without triggering a render.
     * @private - Only called internally after render completion
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    _clearDirtyFlags() {
      this._dirtyFlags.clear();
      return this;
    }

    /**
     * Adds a new rendering stage to the pipeline.
     * The stage must have a render() method to be added successfully.
     * @param {Object} stage - The renderer stage to add
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    add(stage) {
      if (stage && typeof stage.render === 'function') {
        this.stages.push(stage);
        this._enabledStages.add(stage);
        this._stageOrder.push(stage);
      }
      return this;
    }

    /**
     * Removes a rendering stage from the pipeline.
     * @param {Object} stage - The renderer stage to remove
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    remove(stage) {
      const index = this.stages.indexOf(stage);
      if (index > -1) {
        this.stages.splice(index, 1);
        this._enabledStages.delete(stage);
        const orderIndex = this._stageOrder.indexOf(stage);
        if (orderIndex > -1) {
          this._stageOrder.splice(orderIndex, 1);
        }
      }
      return this;
    }

    /**
     * Enables a specific rendering stage for execution during render().
     * @param {Object} stage - The renderer stage to enable
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    enableStage(stage) {
      if (this.stages.includes(stage)) {
        this._enabledStages.add(stage);
        if (!this._stageOrder.includes(stage)) {
          this._stageOrder.push(stage);
        }
      }
      return this;
    }

    /**
     * Disables a specific rendering stage, preventing its execution during render().
     * @param {Object} stage - The renderer stage to disable
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    disableStage(stage) {
      this._enabledStages.delete(stage);
      return this;
    }

    /**
     * Checks if a specific rendering stage is currently enabled.
     * @param {Object} stage - The renderer stage to check
     * @returns {boolean} True if the stage is enabled, false otherwise
     */
    isStageEnabled(stage) {
      return this._enabledStages.has(stage);
    }

    /**
     * Sets a custom rendering order for the stages.
     * All stages in the order must exist in the pipeline, otherwise the order is rejected.
     * @param {Array} stageOrder - Array of stages in the desired rendering order
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    setStageOrder(stageOrder) {
      // Validate that all stages in order exist in our stages
      const validOrder = stageOrder.filter(stage => this.stages.includes(stage));
      if (validOrder.length === stageOrder.length) {
        this._stageOrder = validOrder;
      } else {
        this.errorHandler.logError('RenderPipeline: Invalid stage order provided, some stages not found', 'function');
      }
      return this;
    }

    /**
     * Gets the current rendering order of stages.
     * @returns {Array} Copy of the current stage order array
     */
    getStageOrder() {
      return [...this._stageOrder];
    }

    /**
     * Executes the rendering pipeline, calling render() on all enabled stages in order.
     * Includes performance profiling when enabled and error handling for individual stages.
     * @param {Set} [dirtyOnly] - Optional set of renderer names to render selectively
     * @returns {Array} Array of stage names that were successfully rendered
     */
    render(dirtyOnly = null) {
      const h = this.errorHandler;
      const startTime = performance.now();
      this._renderCount++;

      // Emit event when selective rendering is requested
      if (dirtyOnly && this.eventBus) {
        this.eventBus.emit(window.EventTypes.RENDER_SELECTIVE_REQUESTED, { renderers: Array.from(dirtyOnly) });
      }

      // Use custom order if set, otherwise use original stages array
      const stagesToRender = this._stageOrder.length > 0 ? this._stageOrder : this.stages;
      const renderedStages = [];

      for (let stage of stagesToRender) {
        if (!stage || !this._enabledStages.has(stage)) continue;

        // Skip rendering if we're doing selective rendering and this stage isn't dirty
        // Check stage.constructor.name which works for both classes and objects with custom constructor property
        const stageName = (stage && stage.constructor && stage.constructor.name) ? stage.constructor.name : 'UnknownStage';
        if (dirtyOnly && !dirtyOnly.has(stageName)) continue;

        const stageStartTime = this._profilingEnabled ? performance.now() : 0;

        try {
          if (typeof stage.render === 'function') {
            // Create ViewportContext from MapState if available
            let viewportContext = null;
            if (typeof ViewportContext !== 'undefined' && this.mapState) {
              viewportContext = ViewportContext.fromMapState(this.mapState);
            }
            // Pass renderContext and optional viewportContext to renderer
            stage.render(this.renderContext, viewportContext);
            renderedStages.push(stageName);

            if (this._profilingEnabled) {
              const stageTime = performance.now() - stageStartTime;
              this._recordStagePerformance(stage, stageTime);
              // Also record in instrumentation API
              if (this.instrumentation) {
                this.instrumentation.recordRendererTime(stageName, stageTime);
              }
            }
          }
        } catch (e) {
          const stageName = stage.constructor.name || 'UnknownStage';
          h.logError(e, 'RenderPipeline.render.stage', { stageName });

          if (this._profilingEnabled) {
            this._recordStageError(stage, e);
          }
        }
      }

      // Overall performance tracking
      const totalTime = performance.now() - startTime;
      this._lastRenderTime = totalTime;
      this._averageRenderTime = (this._averageRenderTime * (this._renderCount - 1) + totalTime) / this._renderCount;

      // Record frame metrics in instrumentation API
      if (this._profilingEnabled && this.instrumentation) {
        this.instrumentation.recordFrame(totalTime, renderedStages);
      }

      // Log performance warnings
      if (totalTime > 16.67 && this._profilingEnabled) { // Slower than 60fps
        h.logWarning(`RenderPipeline: Slow frame (${totalTime.toFixed(2)}ms) - stages: [${renderedStages.join(', ')}]`, 'RenderPipeline.render.performance', { totalTime, renderedStages });
      }

      return renderedStages; // Return for debugging/analysis
    }

    /**
     * Checks if performance profiling is currently enabled.
     * @returns {boolean} True if profiling is enabled, false otherwise
     */
    isProfilingEnabled() {
      return this._profilingEnabled;
    }

    _recordStagePerformance(stage, time) {
      const stageName = stage.constructor.name || 'UnknownStage';
      if (!this._performanceStats.has(stageName)) {
        this._performanceStats.set(stageName, {
          totalTime: 0,
          renderCount: 0,
          averageTime: 0,
          maxTime: 0,
          minTime: Infinity,
          lastTime: 0
        });
      }

      const stats = this._performanceStats.get(stageName);
      stats.totalTime += time;
      stats.renderCount++;
      stats.averageTime = stats.totalTime / stats.renderCount;
      stats.maxTime = Math.max(stats.maxTime, time);
      stats.minTime = Math.min(stats.minTime, time);
      stats.lastTime = time;
    }

    _recordStageError(stage, error) {
      const stageName = stage.constructor.name || 'UnknownStage';
      if (!this._performanceStats.has(stageName)) {
        this._performanceStats.set(stageName, {
          totalTime: 0,
          renderCount: 0,
          averageTime: 0,
          maxTime: 0,
          minTime: Infinity,
          lastTime: 0,
          errorCount: 0,
          lastError: null
        });
      }

      const stats = this._performanceStats.get(stageName);
      stats.errorCount = (stats.errorCount || 0) + 1;
      stats.lastError = error.message;
    }

    /**
     * Returns comprehensive performance statistics for the rendering pipeline.
     * Includes overall stats and per-stage timing, error counts, and profiling status.
     * @returns {Object} Performance statistics object with overall and stage-specific metrics
     */
    getPerformanceStats() {
      const stats = {
        overall: {
          renderCount: this._renderCount,
          lastRenderTime: this._lastRenderTime,
          averageRenderTime: this._averageRenderTime,
          profilingEnabled: this._profilingEnabled
        },
        stages: {}
      };

      for (const [stageName, stageStats] of this._performanceStats) {
        stats.stages[stageName] = { ...stageStats };
      }

      return stats;
    }

    /**
     * Resets all performance statistics to their initial state.
     * Clears timing data, render counts, and error statistics.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    resetPerformanceStats() {
      this._performanceStats.clear();
      this._renderCount = 0;
      this._lastRenderTime = 0;
      this._averageRenderTime = 0;
      return this;
    }

    /**
     * Gets all currently enabled rendering stages.
     * @returns {Array} Array of enabled stage objects
     */
    getEnabledStages() {
      return Array.from(this._enabledStages);
    }

    /**
     * Gets all rendering stages in the pipeline, regardless of enabled/disabled status.
     * @returns {Array} Array of all stage objects
     */
    getAllStages() {
      return [...this.stages];
    }

    /**
     * Finds a stage by its constructor name.
     * @param {string} name - The constructor name of the stage to find
     * @returns {Object|undefined} The stage object if found, undefined otherwise
     */
    getStageByName(name) {
      return this.stages.find(stage => stage.constructor.name === name);
    }

    /**
     * Enables all rendering stages in the pipeline.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    enableAllStages() {
      this.stages.forEach(stage => this._enabledStages.add(stage));
      this._stageOrder = [...this.stages];
      return this;
    }

    /**
     * Disables all rendering stages in the pipeline.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    disableAllStages() {
      this._enabledStages.clear();
      return this;
    }

    /**
     * Get the performance instrumentation API for diagnostics.
     * @returns {PerformanceInstrumentation|null} Instrumentation instance or null if unavailable
     */
    getInstrumentation() {
      return this.instrumentation;
    }

    /**
     * Get performance summary for monitoring/debugging.
     * @returns {Object} Summary of all collected metrics
     */
    getPerformanceSummary() {
      return this.instrumentation ? this.instrumentation.getSummary() : null;
    }

    /**
     * Reset performance metrics to start fresh measurement.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    resetMetrics() {
      if (this.instrumentation) {
        this.instrumentation.reset();
      }
      return this;
    }

    /**
     * Enable performance profiling for all rendering stages.
     * This records frame time and per-renderer metrics.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    enableProfiling() {
      this._profilingEnabled = true;
      if (this.instrumentation) {
        this.instrumentation.reset();
      }
      return this;
    }

    /**
     * Disable performance profiling.
     * @returns {RenderPipeline} This pipeline instance for chaining
     */
    disableProfiling() {
      this._profilingEnabled = false;
      return this;
    }
  }

  global.RenderPipeline = RenderPipeline;
})(window);


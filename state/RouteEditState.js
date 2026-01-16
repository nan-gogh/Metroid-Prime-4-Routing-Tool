// state/RouteEditState.js
// Manages route editing state (insertion points, candidates, etc.)

(function (global) {
  class RouteEditState {
    constructor(config) {
      this.eventBus = config.eventBus;
      this.errorHandler = config.errorHandler || new ErrorHandler();

      // Route editing state
      this.routeInsert = null; // { index, tempMarker, position }
      this.routeNodeCandidate = null; // Candidate node for insertion

      // Event types for this state
      this.eventTypes = {
        ROUTE_EDIT_STATE_CHANGED: 'route:edit-state-changed',
        ROUTE_INSERT_CLEARED: 'route:insert-cleared'
      };
    }

    /**
     * Set route insertion point
     * @param {Object} insertData - { index, tempMarker, position }
     */
    setRouteInsert(insertData) {
      this.routeInsert = insertData;
      this._emitChange(this.eventTypes.ROUTE_EDIT_STATE_CHANGED, {
        type: 'insert-set',
        insertData: this.routeInsert
      });
    }

    /**
     * Clear route insertion point
     */
    clearRouteInsert() {
      const hadInsert = this.routeInsert !== null;
      this.routeInsert = null;
      if (hadInsert) {
        this._emitChange(this.eventTypes.ROUTE_INSERT_CLEARED, {});
      }
    }

    /**
     * Set route node candidate
     * @param {Object} candidate - Candidate node data
     */
    setRouteNodeCandidate(candidate) {
      this.routeNodeCandidate = candidate;
      this._emitChange(this.eventTypes.ROUTE_EDIT_STATE_CHANGED, {
        type: 'candidate-set',
        candidate: this.routeNodeCandidate
      });
    }

    /**
     * Clear route node candidate
     */
    clearRouteNodeCandidate() {
      const hadCandidate = this.routeNodeCandidate !== null;
      this.routeNodeCandidate = null;
      if (hadCandidate) {
        this._emitChange(this.eventTypes.ROUTE_EDIT_STATE_CHANGED, {
          type: 'candidate-cleared'
        });
      }
    }

    /**
     * Clear all route editing state
     */
    clearAll() {
      const hadState = this.routeInsert !== null || this.routeNodeCandidate !== null;
      this.routeInsert = null;
      this.routeNodeCandidate = null;
      if (hadState) {
        this._emitChange(this.eventTypes.ROUTE_EDIT_STATE_CHANGED, {
          type: 'all-cleared'
        });
      }
    }

    /**
     * Get current route insert data
     */
    getRouteInsert() {
      return this.routeInsert;
    }

    /**
     * Get current route node candidate
     */
    getRouteNodeCandidate() {
      return this.routeNodeCandidate;
    }

    /**
     * Check if there's an active route insert
     */
    hasRouteInsert() {
      return this.routeInsert !== null;
    }

    /**
     * Check if there's an active route node candidate
     */
    hasRouteNodeCandidate() {
      return this.routeNodeCandidate !== null;
    }

    /**
     * Emit state change event
     * @private
     */
    _emitChange(eventType, data) {
      try {
        this.eventBus.emit(eventType, data);
      } catch (e) {
        this.errorHandler.logError(e, 'RouteEditState._emitChange');
      }
    }
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteEditState = RouteEditState;
  }
})(typeof window !== 'undefined' ? window : global);
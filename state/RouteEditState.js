// state/RouteEditState.js
// Manages route editing state (insertion points, candidates, etc.)

(function (global) {
  class RouteEditState extends BaseStateManager {
    constructor(config, options = {}) {
      super(config, options);
    }

    /**
     * Set route insertion point
     * @param {Object} insertData - { index, tempMarker, position }
     */
    setRouteInsert(insertData) {
      this.routeInsert = insertData;
      this._emitChange(window.EventTypes.ROUTE_INSERT_CHANGED, {
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
        this._emitChange(window.EventTypes.ROUTE_INSERT_CANCELLED, {});
      }
    }

    /**
     * Set route node candidate
     * @param {Object} candidate - Candidate node data
     */
    setRouteNodeCandidate(candidate) {
      this.routeNodeCandidate = candidate;
      this._emitChange(window.EventTypes.ROUTE_NODE_CANDIDATE_CHANGED, {
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
        this._emitChange(window.EventTypes.ROUTE_NODE_CANDIDATE_CANCELLED, {});
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
        this._emitChange(window.EventTypes.RENDER_REQUESTED, {
          reason: 'route-edit-state-cleared'
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
  }

  // Register globally
  if (typeof global !== 'undefined') {
    global.RouteEditState = RouteEditState;
  }
})(typeof window !== 'undefined' ? window : global);
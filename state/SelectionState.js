// state/SelectionState.js
// Holds selection/editing state for markers and routes

(function (global) {
  class SelectionState {
    constructor() {
      this.selectedMarker = null; // { uid, layerKey }
      this.editMode = null; // 'markers' | 'route' | null
    }

    clear() { this.selectedMarker = null; this.editMode = null; }
  }

  global.SelectionState = SelectionState;
})(window);

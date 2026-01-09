// state/RouteState.js
// Holds the current route representation and helpers

(function (global) {
  class RouteState {
    constructor() {
      this.currentRoute = null; // array of indices or node objects
      this.lengthNormalized = 0;
      this._sources = []; // internal unified source list
    }

    set(route, lengthNormalized, sources) {
      this.currentRoute = route;
      this.lengthNormalized = lengthNormalized;
      this._sources = sources || [];
    }

    clear() { this.currentRoute = null; this.lengthNormalized = 0; this._sources = []; }
  }

  global.RouteState = RouteState;
})(window);

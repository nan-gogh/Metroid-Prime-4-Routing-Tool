// tools/tsp_euclid.js
// Simple Euclidean TSP solver for browser use (nearest-neighbor + multi-restart 2-opt)
// Usage: const result = TSPEuclid.solveTSP(points, {restarts:5});
// points: array of {x, y}

(function (global) {
  function euclideanDistance(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function computeDistanceMatrix(points) {
    var n = points.length;
    // Pre-allocate full 2D array so symmetric writes are safe
    var d = Array.from({ length: n }, () => new Array(n));
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) d[i][j] = 0;
    }
    for (var i = 0; i < n; i++) {
      for (var j = i + 1; j < n; j++) {
        var dist = euclideanDistance(points[i], points[j]);
        d[i][j] = dist;
        d[j][i] = dist;
      }
    }
    return d;
  }

  function tourLength(tour, d) {
    var n = tour.length;
    var s = 0;
    for (var i = 0; i < n - 1; i++) s += d[tour[i]][tour[i + 1]];
    s += d[tour[n - 1]][tour[0]];
    return s;
  }

  function nearestNeighborTour(d, start) {
    var n = d.length;
    var visited = new Array(n).fill(false);
    var tour = [start];
    visited[start] = true;
    for (var k = 1; k < n; k++) {
      var last = tour[tour.length - 1];
      var best = -1;
      var bestDist = Infinity;
      for (var j = 0; j < n; j++) {
        if (!visited[j] && d[last][j] < bestDist) {
          bestDist = d[last][j];
          best = j;
        }
      }
      tour.push(best);
      visited[best] = true;
    }
    return tour;
  }

  function twoOptImprove(tour, d) {
    var n = tour.length;
    var improved = true;
    while (improved) {
      improved = false;
      for (var i = 0; i < n - 2; i++) {
        for (var k = i + 2; k < n; k++) {
          if (i === 0 && k === n - 1) continue; // don't break the loop closure
          var a = tour[i];
          var b = tour[i + 1];
          var c = tour[k];
          var dnext = tour[(k + 1) % n];
          var delta = (d[a][c] + d[b][dnext]) - (d[a][b] + d[c][dnext]);
          if (delta < -1e-9) {
            // reverse segment i+1..k
            var left = i + 1;
            var right = k;
            while (left < right) {
              var tmp = tour[left];
              tour[left] = tour[right];
              tour[right] = tmp;
              left++;
              right--;
            }
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }
    return tour;
  }

  function cloneTour(t) {
    return t.slice();
  }

  function solveTSP(points, opts) {
    opts = opts || {};
    var restarts = opts.restarts || 8;
    var n = points.length;
    if (n === 0) return {tour: [], length: 0};
    if (n === 1) return {tour: [0], length: 0};

    var d = computeDistanceMatrix(points);

    var bestTour = null;
    var bestLen = Infinity;

    var starts = [];
    // choose start indices: 0..min(n-1, restarts-1)
    for (var s = 0; s < Math.min(n, restarts); s++) starts.push(s);
    // if restarts > n, add random starts
    while (starts.length < restarts) {
      starts.push(Math.floor(Math.random() * n));
    }

    for (var si = 0; si < starts.length; si++) {
      var start = starts[si];
      var tour = nearestNeighborTour(d, start);
      tour = twoOptImprove(tour, d);
      var len = tourLength(tour, d);
      if (len < bestLen) {
        bestLen = len;
        bestTour = cloneTour(tour);
      }
    }

    return {tour: bestTour, length: bestLen, distanceMatrix: d};
  }

  global.TSPEuclid = {
    euclideanDistance: euclideanDistance,
    computeDistanceMatrix: computeDistanceMatrix,
    nearestNeighborTour: nearestNeighborTour,
    twoOptImprove: twoOptImprove,
    solveTSP: solveTSP
  };
})(typeof window !== 'undefined' ? window : globalThis);

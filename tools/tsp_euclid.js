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

  // Randomized 3-opt improvement: try random triples and accept reconnections that improve total length
  function randomized3Opt(tour, d, iterations) {
    iterations = iterations || Math.max(2000, tour.length * 10);
    var n = tour.length;
    var best = tour;
    var bestLen = tourLength(tour, d);

    function makeNewTour(t, i, j, k, caseId) {
      // Build new tour by concatenating segments according to caseId (0..6)
      // segments: A = 0..i, B = i+1..j, C = j+1..k, D = k+1..n-1
      var A = t.slice(0, i + 1);
      var B = t.slice(i + 1, j + 1);
      var C = t.slice(j + 1, k + 1);
      var D = t.slice(k + 1);
      var res;
      switch (caseId) {
        case 0: // reverse B
          res = A.concat(B.reverse(), C, D);
          break;
        case 1: // reverse C
          res = A.concat(B, C.reverse(), D);
          break;
        case 2: // reverse B+C
          res = A.concat((B.concat(C)).reverse(), D);
          break;
        case 3: // swap B and C
          res = A.concat(C, B, D);
          break;
        case 4: // reverse B, swap
          res = A.concat(C, B.reverse(), D);
          break;
        case 5: // reverse C, swap
          res = A.concat(C.reverse(), B, D);
          break;
        case 6: // complex reorder
          res = A.concat(B.reverse(), C.reverse(), D);
          break;
        default:
          res = t.slice();
      }
      return res;
    }

    for (var it = 0; it < iterations; it++) {
      // choose random triple with reasonable spacing
      var i = Math.floor(Math.random() * n);
      var j = (i + 2 + Math.floor(Math.random() * Math.max(1, Math.min(n - 3, 10)))) % n;
      var k = (j + 2 + Math.floor(Math.random() * Math.max(1, Math.min(n - j - 1, 10)))) % n;
      if (i >= j) continue;
      if (j >= k) continue;

      for (var caseId = 0; caseId < 7; caseId++) {
        var newTour = makeNewTour(best, i, j, k, caseId);
        var newLen = tourLength(newTour, d);
        if (newLen + 1e-12 < bestLen) {
          best = newTour;
          bestLen = newLen;
          break; // accept first improving move
        }
      }
    }

    // polish with 2-opt
    best = twoOptImprove(best, d);
    return best;
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

  // Higher-quality solver: more restarts + randomized 3-opt polishing
  function solveTSPAdvanced(points, opts) {
    opts = opts || {};
    var restarts = opts.restarts || 16;
    var threeOptIters = opts.threeOptIters || Math.max(2000, points.length * 20);
    var d = computeDistanceMatrix(points);
    var n = points.length;
    var bestTour = null;
    var bestLen = Infinity;

    var starts = [];
    for (var s = 0; s < Math.min(n, restarts); s++) starts.push(s);
    while (starts.length < restarts) starts.push(Math.floor(Math.random() * n));

    for (var si = 0; si < starts.length; si++) {
      var start = starts[si];
      var tour = nearestNeighborTour(d, start);
      tour = twoOptImprove(tour, d);
      // apply randomized 3-opt polishing
      tour = randomized3Opt(tour, d, Math.floor(threeOptIters / restarts));
      var len = tourLength(tour, d);
      if (len < bestLen) {
        bestLen = len;
        bestTour = cloneTour(tour);
      }
    }

    return { tour: bestTour, length: bestLen, distanceMatrix: d };
  }

  global.TSPEuclid = {
    euclideanDistance: euclideanDistance,
    computeDistanceMatrix: computeDistanceMatrix,
    nearestNeighborTour: nearestNeighborTour,
    twoOptImprove: twoOptImprove,
    solveTSP: solveTSP,
    solveTSPAdvanced: solveTSPAdvanced,
    randomized3Opt: randomized3Opt
  };
})(typeof window !== 'undefined' ? window : globalThis);

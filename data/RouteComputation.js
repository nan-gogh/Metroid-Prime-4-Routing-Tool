// Route computation utilities for complex route algorithms
// Extracted from map.js to improve modularity and testability

const RouteComputation = {
    // Configuration constants for route computation
    get CONFIG() {
        return {
            EXPAND_PROXIMITY_THRESHOLD: MP4Config.ROUTE.EXPAND_PROXIMITY_THRESHOLD,
            DP_MAX_INTERMEDIATES: MP4Config.ROUTE.DP_MAX_INTERMEDIATES,
            MAX_INTERMEDIATES_PER_BUCKET: MP4Config.ROUTE.MAX_INTERMEDIATES_PER_BUCKET,
            TSP_GREEDY_LIMIT: MP4Config.ROUTE.TSP_GREEDY_LIMIT
        };
    },

    /**
     * Compute route using current route waypoints plus nearby visible markers
     * @param {Object} map - The map instance
     * @param {Function} beginRouteCompute - Function to call at start
     * @param {Function} endRouteCompute - Function to call at end
     * @param {Object} LAYERS - The layers object
     * @param {number} MAP_SIZE - The map size constant
     */
    expandRouteNearby(map, beginRouteCompute, endRouteCompute, LAYERS, MAP_SIZE) {
        beginRouteCompute();
        try {
            if (!map.currentRoute || !Array.isArray(map.currentRoute) || map.currentRoute.length < 2) {
                return;
            }

            // Build route waypoints in normalized coordinates
            const routePts = [];
            const routeUIDs = new Set();
            for (let i = 0; i < map.currentRoute.length; i++) {
                const idx = map.currentRoute[i];
                const src = map._routeSources && map._routeSources[idx];
                if (!src || !src.marker) continue;
                routePts.push({ x: src.marker.x, y: src.marker.y });
                if (src.marker.uid) routeUIDs.add(src.marker.uid);
            }
            if (routePts.length < 2) { return; }

            // Threshold in pixels for proximity; tuneable
            const THRESHOLD_PX = this.CONFIG.EXPAND_PROXIMITY_THRESHOLD;
            const thresholdNorm = THRESHOLD_PX / MAP_SIZE;

            // Collect candidate markers from visible layers (exclude virtual 'route')
            const poolSources = this._collectNearbyMarkers(map, LAYERS, routePts, routeUIDs, thresholdNorm);

            // Assign nearby markers to the nearest route segment (by projection)
            const segments = this._assignMarkersToSegments(map, routePts, poolSources);

            // Solve TSP for each segment and construct final route
            const result = this._solveSegmentsAndBuildRoute(map, routePts, segments);

            // Set the computed route
            if (result.sources.length > 0) {
                map.setRoute(result.indices, result.length, result.sources);
            }
        } catch (e) {
            console.error('RouteComputation.expandRouteNearby failed:', e);
        } finally {
            endRouteCompute();
        }
    },

    /**
     * Collect markers that are near the route
     * @private
     */
    _collectNearbyMarkers(map, LAYERS, routePts, routeUIDs, thresholdNorm) {
        const poolSources = [];
        const layerEntries = Object.entries(LAYERS || {});

        for (let li = 0; li < layerEntries.length; li++) {
            const layerKey = layerEntries[li][0];
            const layer = layerEntries[li][1];
            if (layerKey === 'route') continue;
            if (!map.layerVisibility[layerKey]) continue;
            if (!Array.isArray(layer.markers)) continue;

            for (let mi = 0; mi < layer.markers.length; mi++) {
                const m = layer.markers[mi];
                if (!m) continue;
                // Always include route markers (they may be in other layers)
                if (m.uid && routeUIDs.has(m.uid)) continue; // will add route points separately

                // Compute minimal distance from m to route polyline (normalized units)
                if (this._isMarkerNearRoute(m, routePts, map.routeLooping, thresholdNorm)) {
                    poolSources.push({ marker: m, layerKey: layerKey, layerIndex: mi });
                }
            }
        }

        return poolSources;
    },

    /**
     * Check if a marker is within threshold distance of the route
     * @private
     */
    _isMarkerNearRoute(marker, routePts, routeLooping, thresholdNorm) {
        let minDist = Infinity;
        const len = routePts.length;
        const segCount = routeLooping ? len : (len - 1);

        for (let si = 0; si < segCount; si++) {
            const a = routePts[si];
            const b = routePts[(si + 1) % len];
            if (!a || !b) continue;

            const dist = this._pointToSegmentDistance(marker, a, b);
            if (dist < minDist) minDist = dist;
        }

        return minDist <= thresholdNorm;
    },

    /**
     * Calculate distance from point to line segment
     * @private
     */
    _pointToSegmentDistance(point, segmentStart, segmentEnd) {
        const vx = segmentEnd.x - segmentStart.x;
        const vy = segmentEnd.y - segmentStart.y;
        const wx = point.x - segmentStart.x;
        const wy = point.y - segmentStart.y;

        const vlen2 = vx * vx + vy * vy;
        if (vlen2 <= 0) return Math.hypot(wx, wy); // degenerate segment

        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
        const px = segmentStart.x + vx * t;
        const py = segmentStart.y + vy * t;

        return Math.hypot(point.x - px, point.y - py);
    },

    /**
     * Assign markers to their nearest route segments
     * @private
     */
    _assignMarkersToSegments(map, routePts, poolSources) {
        const routeLen = routePts.length;
        const segCount = map.routeLooping ? routeLen : (routeLen - 1);
        const segments = new Array(segCount);
        for (let si = 0; si < segCount; si++) segments[si] = [];

        for (let i = 0; i < poolSources.length; i++) {
            const s = poolSources[i];
            if (!s || !s.marker) continue;

            // find closest segment and its t
            let bestSeg = -1;
            let bestDist = Infinity;
            let bestT = 0;

            for (let si = 0; si < segCount; si++) {
                const a = routePts[si];
                const b = routePts[(si + 1) % routeLen];
                if (!a || !b) continue;

                const dist = this._pointToSegmentDistance(s.marker, a, b);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestSeg = si;
                    // Calculate t parameter for insertion point
                    const vx = b.x - a.x;
                    const vy = b.y - a.y;
                    const wx = s.marker.x - a.x;
                    const wy = s.marker.y - a.y;
                    const vlen2 = vx * vx + vy * vy;
                    bestT = vlen2 <= 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / vlen2));
                }
            }

            if (bestSeg >= 0) {
                segments[bestSeg].push({ src: s, t: bestT, dist: bestDist });
            }
        }

        return segments;
    },

    /**
     * Solve TSP for each segment and build the final route
     * @private
     */
    _solveSegmentsAndBuildRoute(map, routePts, segments) {
        const finalSources = [];
        const segCount = map.routeLooping ? routePts.length : (routePts.length - 1);

        // Process each segment
        for (let si = 0; si < segCount; si++) {
            const aIdx = map.currentRoute[si];
            const bIdx = map.currentRoute[(si + 1) % map.currentRoute.length];
            const srcA = map._routeSources && map._routeSources[aIdx];
            const srcB = map._routeSources && map._routeSources[bIdx];

            if (!srcA || !srcA.marker || !srcB || !srcB.marker) continue;

            // Gather segment points: start, intermediates, end
            const pts = [
                { x: srcA.marker.x, y: srcA.marker.y, srcObj: { marker: srcA.marker, layerKey: srcA.layerKey } }
            ];

            // Sort markers along segment by t for deterministic ordering
            const bucket = segments[si] || [];
            bucket.sort((p, q) => p.t - q.t);

            // Limit intermediates per-segment to avoid exponential DP blowup
            const MAX_INTERMEDIATES = this.CONFIG.MAX_INTERMEDIATES_PER_BUCKET;
            const limited = bucket.length > MAX_INTERMEDIATES ? bucket.slice(0, MAX_INTERMEDIATES) : bucket;

            for (let bi = 0; bi < limited.length; bi++) {
                pts.push({
                    x: limited[bi].src.marker.x,
                    y: limited[bi].src.marker.y,
                    srcObj: limited[bi].src
                });
            }

            pts.push({
                x: srcB.marker.x,
                y: srcB.marker.y,
                srcObj: { marker: srcB.marker, layerKey: srcB.layerKey }
            });

            if (pts.length <= 2) {
                // Just append start and end, avoid duplicating shared points
                if (finalSources.length === 0) {
                    finalSources.push({ marker: srcA.marker, layerKey: srcA.layerKey, layerIndex: finalSources.length });
                }
                finalSources.push({ marker: srcB.marker, layerKey: srcB.layerKey, layerIndex: finalSources.length });
                continue;
            }

            // Prepare points array for DP (x,y only)
            const pointsArr = pts.map(p => ({ x: p.x, y: p.y }));
            const order = this.solveFixedPathForSegment(pointsArr);

            // Append according to order, but avoid duplicating shared points between segments
            for (let oi = 0; oi < order.length; oi++) {
                const pi = order[oi];
                const srcEntry = pts[pi].srcObj;

                // Skip adding the start if it's already the last appended
                if (finalSources.length > 0) {
                    const last = finalSources[finalSources.length - 1];
                    if (last && last.marker && srcEntry && srcEntry.marker &&
                        last.marker.uid === srcEntry.marker.uid) continue;
                }

                finalSources.push({
                    marker: srcEntry.marker,
                    layerKey: srcEntry.layerKey || 'route',
                    layerIndex: finalSources.length
                });
            }
        }

        if (finalSources.length < 2) {
            throw new Error('Not enough markers in the pool to compute a route.');
        }

        // Compute overall length
        let totalLen = 0;
        for (let i = 1; i < finalSources.length; i++) {
            const a = finalSources[i - 1].marker;
            const b = finalSources[i].marker;
            if (!a || !b) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            totalLen += Math.hypot(dx, dy);
        }

        const indices = finalSources.map((_, i) => i);
        return { sources: finalSources, indices: indices, length: totalLen };
    },

    /**
     * Solve fixed-endpoint shortest Hamiltonian path for small N using DP
     * @param {Array} pointsArr - Array of {x,y} points with first=start and last=end
     * @returns {Array} - Array of indices representing the optimal path order
     */
    solveFixedPathForSegment(pointsArr) {
        const n = pointsArr.length;
        if (n <= 2) return [0, 1];
        const k = n - 2; // intermediates count

        // Safety: if too many intermediates, fall back to a cheap greedy solver
        const DP_MAX_K = this.CONFIG.DP_MAX_INTERMEDIATES;
        if (k > DP_MAX_K) {
            return this._solveGreedyPath(pointsArr);
        }

        // DP exact solver for small k
        return this._solveDPPath(pointsArr);
    },

    /**
     * Greedy nearest-neighbor solver for large intermediate sets
     * @private
     */
    _solveGreedyPath(pointsArr) {
        const n = pointsArr.length;
        try {
            const visited = new Array(n).fill(false);
            visited[0] = true;
            visited[n - 1] = true;
            const order = [0];
            let cur = 0;
            let remaining = n - 2; // intermediates only

            while (remaining > 0) {
                let bestIdx = -1;
                let bestDist = Infinity;
                for (let j = 1; j < n - 1; j++) {
                    if (visited[j]) continue;
                    const dist = Math.hypot(pointsArr[cur].x - pointsArr[j].x, pointsArr[cur].y - pointsArr[j].y);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestIdx = j;
                    }
                }
                if (bestIdx < 0) break;
                visited[bestIdx] = true;
                order.push(bestIdx);
                cur = bestIdx;
                remaining--;
            }
            order.push(n - 1);
            return order;
        } catch (err) {
            // Fallback to trivial ordering on error
            return Array.from({ length: n }, (_, i) => i);
        }
    },

    /**
     * Dynamic programming solver for optimal path
     * @private
     */
    _solveDPPath(pointsArr) {
        const n = pointsArr.length;
        const k = n - 2; // intermediates count

        try {
            // Build distance matrix
            const d = Array.from({ length: n }, () => new Array(n).fill(0));
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    const dx = pointsArr[i].x - pointsArr[j].x;
                    const dy = pointsArr[i].y - pointsArr[j].y;
                    d[i][j] = Math.hypot(dx, dy);
                }
            }

            const FULL = 1 << k;
            const dp = new Array(FULL).fill(null).map(() => new Array(k).fill(Infinity));
            const parent = new Array(FULL).fill(null).map(() => new Array(k).fill(-1));

            // Initialize DP table
            for (let j = 0; j < k; j++) {
                const mask = 1 << j;
                dp[mask][j] = d[0][j + 1];
            }

            // Fill DP table
            for (let mask = 1; mask < FULL; mask++) {
                for (let last = 0; last < k; last++) {
                    if (!(mask & (1 << last))) continue;
                    const prevMask = mask ^ (1 << last);
                    if (prevMask === 0) continue;

                    for (let prev = 0; prev < k; prev++) {
                        if (!(prevMask & (1 << prev))) continue;
                        const val = dp[prevMask][prev] + d[prev + 1][last + 1];
                        if (val < dp[mask][last]) {
                            dp[mask][last] = val;
                            parent[mask][last] = prev;
                        }
                    }
                }
            }

            // Find best path to end
            let best = Infinity;
            let bestLast = -1;
            const ALL = FULL - 1;

            if (k === 0) {
                return [0, n - 1];
            }

            for (let last = 0; last < k; last++) {
                const cost = dp[ALL][last] + d[last + 1][n - 1];
                if (cost < best) {
                    best = cost;
                    bestLast = last;
                }
            }

            // Reconstruct path
            const order = [];
            let mask = ALL;
            let cur = bestLast;
            while (cur >= 0) {
                order.push(cur + 1);
                const p = parent[mask][cur];
                mask = mask ^ (1 << cur);
                cur = p;
            }
            order.reverse();

            // Return full path indices
            return [0].concat(order).concat([n - 1]);
        } catch (err) {
            // On any unexpected failure, fallback to simple ordering
            return Array.from({ length: n }, (_, i) => i);
        }
    },
};

// Make RouteComputation globally available
window.RouteComputation = RouteComputation;
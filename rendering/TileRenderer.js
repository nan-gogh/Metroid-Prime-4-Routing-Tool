// rendering/TileRenderer.js
// Minimal scaffold for tile rendering module. Gradually replace methods from map.js.

(function (global) {
  class TileRenderer {
    constructor(map, config) {
      this.map = map;
      this.config = config || (global.MP4Config || {});
      this.canvas = map.canvasTiles || null;
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    }

    init() {
      // Place to initialize caches / preload strategies
    }

    render() {
      // Ported from map.renderTiles - draws tiles into tile canvas or overlay when tile canvas missing
      const ctxT = this.ctx || this.map.ctx;
      if (!ctxT) return;
      const cssWidth = (this.map.canvasTiles || this.map.canvas).clientWidth;
      const cssHeight = (this.map.canvasTiles || this.map.canvas).clientHeight;

      // Clear background (use app theme dark-blue) and draw subtle honeycomb pattern
      try {
        // Base fill
        ctxT.fillStyle = '#041018';
        ctxT.fillRect(0, 0, cssWidth, cssHeight);

        // Use a cached honeycomb pattern (offscreen canvas) for performance.
        try {
          // Create pattern canvas if missing (size tuned for low-spec devices)
          if (!this.map._honeycombPatternCanvas) {
            // default base size; increase on low-spec to reduce density
            const baseSize = 28;
            const preferred = (this.map._lowSpec ? Math.round(baseSize * 1.6) : baseSize);
            this._createHoneycombPattern(preferred);
          }

          if (this.map._honeycombPatternCanvas) {
            if (!this.map._honeycombPattern) {
              try { this.map._honeycombPattern = ctxT.createPattern(this.map._honeycombPatternCanvas, 'repeat'); } catch (e) { this.map._honeycombPattern = null; }
            }
            if (this.map._honeycombPattern) {
              ctxT.save();
              ctxT.fillStyle = this.map._honeycombPattern;
              ctxT.fillRect(0, 0, cssWidth, cssHeight);
              ctxT.restore();
            }
          }
        } catch (e) { console.debug('TileRenderer.render: honeycomb pattern draw failed', e); }
      } catch (e) { console.debug('TileRenderer.render: base fill failed', e); }

      if (this.map.currentImage) {
        const size = MAP_SIZE * this.map.zoom;
        try { ctxT.imageSmoothingEnabled = true; ctxT.imageSmoothingQuality = 'high'; } catch (e) {}
        try { ctxT.drawImage(this.map.currentImage, this.map.panX, this.map.panY, size, size); } catch (e) { console.debug('TileRenderer.render: drawImage failed', e); }
      }
    }

    // Create honeycomb pattern logic (moved from map._createHoneycombPattern)
    _createHoneycombPattern(size = 28) {
      try {
        const dpr = window.devicePixelRatio || 1;
        const base = Number(size) || 28;
        const container = this.map.canvasTiles || this.map.canvas;
        const containerWidth = (container && container.clientWidth) ? container.clientWidth : (window.innerWidth || 1024);
        const refWidth = 1024; // reference width for scaling
        const viewportRatio = Math.min(1, containerWidth / refWidth);
        const maxShrink = 1; // max 18% shrink on very small viewports
        const viewportMultiplier = 1 - (1 - viewportRatio) * maxShrink;
        const adaptiveBase = Math.max(10, base * viewportMultiplier);
        const r = this.map._lowSpec ? (adaptiveBase * 1.6) : adaptiveBase;
        const hexH = Math.sqrt(3) * r;
        const hSpacing = 1.5 * r;
        const vSpacing = hexH;

        const tileW = Math.max(2, Math.ceil(hSpacing * 2));
        const tileH = Math.max(2, Math.ceil(vSpacing * 2));

        const pc = document.createElement('canvas');
        pc.width = Math.max(1, Math.floor(tileW * dpr));
        pc.height = Math.max(1, Math.floor(tileH * dpr));
        const pctx = pc.getContext('2d');
        pctx.scale(dpr, dpr);

        pctx.fillStyle = 'rgba(6,20,30,0.28)';
        pctx.strokeStyle = 'rgba(34,211,238,0.06)';
        pctx.lineWidth = 1;

        const xStart = -hSpacing;
        const yStart = -vSpacing;
        const cols = Math.ceil(tileW / hSpacing) + 3;
        const rows = Math.ceil(tileH / vSpacing) + 3;

        for (let col = 0; col < cols; col++) {
          for (let row = 0; row < rows; row++) {
            const cx = xStart + col * hSpacing;
            const cy = yStart + row * vSpacing + (col % 2 ? vSpacing / 2 : 0);
            pctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = (Math.PI / 180) * (60 * i);
              const x = cx + r * Math.cos(angle);
              const y = cy + r * Math.sin(angle);
              if (i === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
            }
            pctx.closePath();
            pctx.fill();
            pctx.stroke();
          }
        }

        try {
          const rc = document.createElement('canvas');
          rc.width = pc.height;
          rc.height = pc.width;
          const rctx = rc.getContext('2d');
          rctx.translate(rc.width / 2, rc.height / 2);
          rctx.rotate(Math.PI / 2);
          rctx.drawImage(pc, -pc.width / 2, -pc.height / 2);
          this.map._honeycombPatternCanvas = rc;
        } catch (e) {
          this.map._honeycombPatternCanvas = pc;
        }
        this.map._honeycombPattern = null;
      } catch (e) {
        this.map._honeycombPatternCanvas = null;
        this.map._honeycombPattern = null;
        console.debug('TileRenderer._createHoneycombPattern failed', e);
      }
    }

    // Future methods: preloadResolution(), determineBestResolution(), invalidateCache(), setTileset()
  }

  global.TileRenderer = TileRenderer;
})(window);

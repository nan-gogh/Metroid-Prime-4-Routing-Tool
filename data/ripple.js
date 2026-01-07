(function(){
    // Create a ring ripple on pointerup for relevant containers.
    // Targets: sidebar, map-container, zoom-controls, buttons and toggle rows.

    const CONTAINER_SELECTOR = '.sidebar, .map-container, .zoom-controls, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle';
    // Track pointer start positions to avoid showing ripples for drag gestures
    const _pointerState = new Map(); // pointerId -> {x,y,moved}
    const MOVE_THRESHOLD = 8; // pixels

    // Ensure a dedicated ripple layer exists above all UI so ripples can be
    // shown regardless of which element handled the pointer event.
    function ensureRippleLayer() {
        let layer = document.getElementById('rippleLayer');
        if (layer) return layer;
        try {
            layer = document.createElement('div');
            layer.id = 'rippleLayer';
            layer.style.position = 'fixed';
            layer.style.left = '0'; layer.style.top = '0';
            layer.style.width = '100%'; layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '200001';
            document.body.appendChild(layer);
            return layer;
        } catch (e) { return document.body; }
    }

    function createRippleAt(container, x, y) {
        if (!container) container = document.body;
        // If the target is a small control (button/toggle), prefer appending
        // the ripple to a larger parent container so the effect isn't clipped
        // and appears consistent with the map/sidebar ripples.
        const SMALL_CONTROL_SELECTOR = '.control-btn, .zoom-btn, .hints-toggle, .layer-toggle';
        let appendContainer = container;
        try {
            if (container.matches && container.matches(SMALL_CONTROL_SELECTOR)) {
                appendContainer = container.closest('.sidebar, .zoom-controls, .map-container') || container;
            }
        } catch (e) {
            appendContainer = container;
        }

        const rect = appendContainer.getBoundingClientRect();

        // Position using viewport coordinates so the ripple sits above all UI.
        const ripple = document.createElement('span');
        ripple.className = 'ripple-ring';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';

        // size relative to container diagonal, but capped by CSS variable `--ripple-max-size`
        const maxDim = Math.max(rect.width, rect.height);
        const baseSize = Math.round(maxDim * 1.6);
        // read CSS variable (may be like '240px') from root
        const cssVal = getComputedStyle(document.documentElement).getPropertyValue('--ripple-max-size').trim();
        let cap = null;
        if (cssVal) {
            const m = cssVal.match(/([0-9.]+)/);
            if (m) cap = parseFloat(m[1]);
        }

        // For small inline controls, prefer using the cap so the ripple visually
        // matches the larger ripples on sidebar/map. Otherwise, use min(baseSize, cap).
        const useCapForSmall = appendContainer !== container; // if we moved to a parent
        const size = (cap && !isNaN(cap)) ? (useCapForSmall ? cap : Math.min(baseSize, cap)) : baseSize;
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';

        // Append to dedicated ripple layer so ripples can appear above all UI
        const layer = ensureRippleLayer();
        // Position relative to viewport: layer is fixed at 0,0 so absolute works
        ripple.style.position = 'absolute';
        layer.appendChild(ripple);

        // remove once animation ends
        ripple.addEventListener('animationend', () => {
            if (ripple && ripple.parentNode) ripple.parentNode.removeChild(ripple);
        }, { once: true });

        // safety remove after 1s
        setTimeout(() => { if (ripple && ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 1500);
    }

    function onPointerDown(ev) {
        try {
            _pointerState.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, moved: false });
        } catch (e) {}
    }

    function onPointerMove(ev) {
        try {
            const s = _pointerState.get(ev.pointerId);
            if (!s) return;
            const dx = ev.clientX - s.x;
            const dy = ev.clientY - s.y;
            if ((dx*dx + dy*dy) > (MOVE_THRESHOLD * MOVE_THRESHOLD)) {
                s.moved = true;
            }
        } catch (e) {}
    }

    function onPointerUp(ev) {
        try {
            const s = _pointerState.get(ev.pointerId);
            // If we have a pointer start and the pointer moved beyond threshold, don't ripple
            if (s && s.moved) {
                _pointerState.delete(ev.pointerId);
                return;
            }

            const target = ev.target;
            const container = target.closest(CONTAINER_SELECTOR) || document.body;
            createRippleAt(container, ev.clientX, ev.clientY);
            if (s) _pointerState.delete(ev.pointerId);
        } catch (e) {
            // swallow
        }
    }

    // Clean up state on cancel
    function onPointerCancel(ev) {
        try { _pointerState.delete(ev.pointerId); } catch (e) {}
    }

    // Attach pointer listeners to track drags and avoid ripples for drag gestures
    // Use capture so ripples run before handlers that may stop propagation.
    document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true, capture: true });
    document.addEventListener('pointercancel', onPointerCancel, { passive: true, capture: true });
})();

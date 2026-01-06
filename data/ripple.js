(function(){
    // Create a ring ripple on pointerup for relevant containers.
    // Targets: sidebar, map-container, zoom-controls, buttons and toggle rows.

    const CONTAINER_SELECTOR = '.sidebar, .map-container, .zoom-controls, .control-btn, .zoom-btn, .hints-toggle, .layer-toggle';

    function createRippleAt(container, x, y) {
        if (!container) return;

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
        const rx = x - rect.left;
        const ry = y - rect.top;

        const ripple = document.createElement('span');
        ripple.className = 'ripple-ring';
        ripple.style.left = rx + 'px';
        ripple.style.top = ry + 'px';

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

        appendContainer.appendChild(ripple);

        // remove once animation ends
        ripple.addEventListener('animationend', () => {
            if (ripple && ripple.parentNode) ripple.parentNode.removeChild(ripple);
        }, { once: true });

        // safety remove after 1s
        setTimeout(() => { if (ripple && ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 1500);
    }

    function onPointerUp(ev) {
        try {
            const target = ev.target;
            const container = target.closest(CONTAINER_SELECTOR) || document.body;
            createRippleAt(container, ev.clientX, ev.clientY);
        } catch (e) {
            // swallow
        }
    }

    // Attach the listener to the document so it fires for all pointerups
    document.addEventListener('pointerup', onPointerUp, { passive: true });
})();

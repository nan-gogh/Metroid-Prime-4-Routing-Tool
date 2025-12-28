// Marker utility functions for export/import

const MarkerUtils = {
    // Generate a hash of marker data for unique filenames
    hashMarkerData(markers) {
        const data = JSON.stringify(markers.map(m => ({ x: m.x, y: m.y })));
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 8); // 8-char hex string
    },
    
    // Export custom markers to JSON
    exportCustomMarkers() {
        const markers = LAYERS.customMarkers.markers;
        const dataHash = MarkerUtils.hashMarkerData(markers);
        const now = new Date();
        const timestamp = now.getTime(); // milliseconds
        
        // Format markers with each on a single line
        const markersJson = markers.map(m => 
            JSON.stringify({ uid: m.uid, x: m.x, y: m.y })
        ).join(',\n    ');
        
        // Manually construct JSON for compact marker formatting
        const json = `{
  "exported": "${now.toISOString()}",
  "count": ${markers.length},
  "markers": [
    ${markersJson}
  ]
}`;
        
        // Trigger download
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custom-markers-${timestamp}-${dataHash}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('✓ Exported', markers.length, 'custom markers');
    },
    
    // Import markers from JSON file
    importCustomMarkers(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const imported = [];
                    
                    if (!Array.isArray(data.markers)) {
                        throw new Error('Invalid format: markers must be an array');
                    }
                    
                    // Validate and add markers
                    for (const marker of data.markers) {
                        if (typeof marker.x !== 'number' || typeof marker.y !== 'number') {
                            throw new Error('Invalid marker: x and y must be numbers');
                        }
                        
                        if (LAYERS.customMarkers.markers.length >= (map?.layerConfig?.customMarkers?.maxMarkers || 50)) {
                            console.warn('⚠ Reached max markers limit, stopping import');
                            break;
                        }
                        
                        // Use imported UID if it starts with "cm", otherwise generate new
                        let uid = marker.uid;
                        if (!uid || !uid.startsWith('cm')) {
                            uid = MarkerUtils.generateUID();
                        } else if (LAYERS.customMarkers.markers.some(m => m.uid === uid)) {
                            // UID conflict, generate new one
                            uid = MarkerUtils.generateUID();
                        }
                        
                        const newMarker = { uid, x: marker.x, y: marker.y };
                        LAYERS.customMarkers.markers.push(newMarker);
                        imported.push(newMarker);
                    }
                    
                    // Persist to localStorage
                    MarkerUtils.saveToLocalStorage();
                    
                    console.log('✓ Imported', imported.length, 'markers');
                    resolve(imported);
                } catch (error) {
                    console.error('✗ Import failed:', error.message);
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    },
    
    // Generate next available UID
    generateUID() {
        const existing = LAYERS.customMarkers.markers.map(m => m.uid);
        let num = 1;
        while (existing.includes(`cm${String(num).padStart(2, '0')}`)) {
            num++;
        }
        return `cm${String(num).padStart(2, '0')}`;
    },
    
    // Add a new custom marker
    addCustomMarker(x, y) {
        const maxMarkers = map?.layerConfig?.customMarkers?.maxMarkers || 50;
        if (LAYERS.customMarkers.markers.length >= maxMarkers) {
            console.warn('⚠ Max markers limit reached');
            return null;
        }
        
        const uid = MarkerUtils.generateUID();
        const marker = { uid, x, y };
        LAYERS.customMarkers.markers.push(marker);
        MarkerUtils.saveToLocalStorage();
        
        console.log('✓ Added custom marker:', uid);
        return marker;
    },
    
    // Delete a custom marker by UID
    deleteCustomMarker(uid) {
        const index = LAYERS.customMarkers.markers.findIndex(m => m.uid === uid);
        if (index !== -1) {
            LAYERS.customMarkers.markers.splice(index, 1);
            MarkerUtils.saveToLocalStorage();
            console.log('✓ Deleted marker:', uid);
            return true;
        }
        return false;
    },
    
    // Delete all custom markers
    clearCustomMarkers() {
        const count = LAYERS.customMarkers.markers.length;
        LAYERS.customMarkers.markers.length = 0;
        MarkerUtils.saveToLocalStorage();
        console.log('✓ Cleared all', count, 'custom markers');
    },
    
    // Save to localStorage
    saveToLocalStorage() {
        try {
            localStorage.setItem('mp4_customMarkers', JSON.stringify(LAYERS.customMarkers.markers));
        } catch (e) {
            console.error('✗ Failed to save to localStorage:', e);
        }
    }
};

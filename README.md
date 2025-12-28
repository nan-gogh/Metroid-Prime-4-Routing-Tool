# Metroid Prime 4: Beyond - Sol Valley Interactive Map

A lightweight, mobile-friendly interactive map for tracking collectibles in Metroid Prime 4: Beyond. Works seamlessly on desktop and mobile devices.

## Features

- 🗺️ **Pan and zoom** with mouse wheel, touch gestures, or keyboard
- 🔍 **Multi-resolution tiles** (256px - 8192px, auto-loaded based on zoom)
- 💎 **Green Crystals layer** (175+ collectible locations)
- 📍 **Custom Markers** (user-placed, up to 50 per session)
- 💾 **Persistent storage** (localStorage auto-saves custom markers)
- 📤 **Export/Import** (JSON format for sharing marker sets)
- 📱 **Mobile optimized** (collapsible sidebar, touch-friendly controls)
- 🎨 **Layer-aware UI** (dynamic icons and colors from data definitions)

## Usage

Open `index.html` in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then visit `http://localhost:8080`

## Live Demo

View the live site: https://nan-gogh.github.io/Metroid-Prime-4-Routing-Tool/

## Controls

### Desktop
| Input | Action |
|-------|--------|
| **Scroll wheel** | Zoom in/out |
| **Drag** | Pan map |
| **Double-click** | Zoom in (centered) |
| **Click (marker)** | Toggle marker tooltip |
| **Click (empty space)** | Place custom marker |
| **Click (custom marker)** | Delete custom marker |
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset view |

### Mobile (Touch)
| Gesture | Action |
|---------|--------|
| **Drag** | Pan map |
| **Pinch** | Zoom in/out + pan map |
| **Double-tap** | Zoom in (centered) |
| **Tap (marker)** | Toggle marker tooltip |
| **Tap (empty space)** | Place custom marker |
| **Tap (custom marker)** | Delete custom marker |

### Sidebar
| Control | Action |
|---------|--------|
| **Layer toggles** | Show/hide Green Crystals or Custom Markers |
| **Export** | Download custom markers as JSON |
| **Import** | Load custom markers from JSON file |
| **Clear** | Remove all custom markers (with confirmation) |
| **Handle (◀)** | Collapse/expand sidebar |

## Custom Markers

### Adding Markers
- **Desktop**: Quick tap (less than 150ms hold) on empty space
- **Mobile**: Brief tap on empty space

### Removing Markers
- **Desktop**: Quick tap on custom marker
- **Mobile**: Brief tap on custom marker

### Saving & Sharing
- Custom markers auto-save to browser storage
- **Export**: Downloads JSON file with timestamp and data hash (`custom-markers-{timestamp}-{hash}.json`)
- **Import**: Paste JSON file to load marker sets
- **Share**: Paste JSON content directly in Discord (compact one-line-per-marker format)

## Project Structure

```
├── index.html              # Main HTML document
├── styles.css              # Responsive styling
├── map.js                  # Interactive map engine (750+ lines)
├── data/
│   ├── init.js            # LAYERS object initialization
│   ├── greenCrystals.js   # Green Crystals layer data
│   ├── customMarkers.js   # Custom Markers layer definition
│   └── markerUtils.js     # Marker export/import utilities
└── tiles/                 # Map tiles (256-8192px)
    ├── 256.avif
    ├── 512.avif
    ├── 1024.avif
    ├── 2048.avif
    ├── 4096.avif
    └── 8192.avif
```

## Data Architecture

### LAYERS Object
All marker layers are defined in the modular `LAYERS` object:
```javascript
LAYERS.greenCrystals = {
    name: "Green Crystals",
    icon: "💎",
    color: "#22c55e",
    markers: [...]
}
```

Each layer includes:
- **name**: Display name in sidebar
- **icon**: Emoji or text for layer toggle
- **color**: Hex color for markers and UI elements
- **markers**: Array of marker data

This architecture allows easy addition of new layers (save stations, red doors, etc.) without modifying the core rendering logic.

## Browser Compatibility

- Modern browsers with Canvas 2D API support
- Touch event support for mobile
- LocalStorage support for persistence

Tested on:
- Chrome/Edge (desktop & mobile)
- Firefox (desktop & mobile)
- Safari (iOS & macOS)

## Performance Notes

- Tiles load dynamically based on zoom level
- Markers render only when visible (off-screen culling)
- Hold-duration detection (150ms) distinguishes click from drag

## License

MIT License - see [LICENSE](LICENSE)

## Disclaimer

This is a fan-made tool for personal use. Metroid Prime 4: Beyond and all related assets are property of Nintendo.

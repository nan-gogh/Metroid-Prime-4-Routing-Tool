# Metroid Prime 4: Beyond - Sol Valley Interactive Map

A lightweight, dependency-free interactive map for tracking collectibles in Metroid Prime 4: Beyond.

## Features

- 🗺️ Pan and zoom with mouse or touch
- 🔍 Multi-resolution tile loading (256px - 8192px)
- 💎 Green Crystal markers (153 locations)
- ⌨️ Keyboard shortcuts

## Usage

Open `index.html` in a browser, or serve locally:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve
```

Then visit `http://localhost:8080`

## Controls

| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out |
| Click + drag | Pan |
| `+` / `-` | Zoom |
| `0` | Reset view |

## Project Structure

```
├── index.html      # Main HTML
├── styles.css      # Styling
├── map.js          # Map logic & marker data
└── tiles/          # Map images (256-8192px)
```

## License

MIT License - see [LICENSE](LICENSE)

## Disclaimer

This is a fan-made tool for personal use. Metroid Prime 4: Beyond and all related assets are property of Nintendo.

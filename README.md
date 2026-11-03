# NightDwift

A browser-based top-down drifting game. Choose a car and track, then race laps
or practice in freeplay.

## Run

Open `dwifft.html` in a browser, or serve the project directory locally:

```sh
python3 -m http.server
```

Then visit `http://localhost:8000/dwifft.html`.

## Controls

- **W / Up:** accelerate; **S / Down:** brake or reverse
- **A / Left** and **D / Right:** steer
- **Space:** handbrake
- **R:** reset; **Escape / P:** return to the menu
- **Menu:** W / S or the D-pad to choose; Enter / Space to confirm
- Standard gamepads are supported

## Project files

- `dwifft.html` — page structure and script loading order
- `styles.css` — game and menu styles
- `js/input.js` — keyboard and gamepad controls
- `js/cars.js` — car definitions and drawing
- `js/tracks.js` — track definitions and rendering
- `js/physics.js` — car handling and physics
- `js/game.js` — game state, menus, simulation, and rendering loop
- `js/error-handler.js` — displays runtime errors in the menu

Optional car sprite PNGs can be placed in `sprites/`, named after their car
IDs: `skyline`, `supra`, `porsche`, `rx7`, `silvia`, and `ae86`. Vector cars are
used when a sprite is not available.

# NightDwift

NightDwift is a midnight-styled, browser-based top-down drifting game. Race laps,
practice freely, or take on an endless city and an escalating police pursuit.

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

## Modes

- **Time Attack:** race laps on a chosen track and set a best time. A minimap
  shows the circuit, your car, and the next checkpoint.
- **Freeplay:** practice drifting without a timer.
- **Cop Chase:** survive as long as possible in an endless, procedurally
  generated city. Police pursue and reinforce over time; touching one ends the
  run. Drift into new streets to score; the same road tiles only pay once, so
  repeating donuts won't farm points. Drift chains raise a capped multiplier
  and briefly distract nearby cops. The minimap shows nearby streets,
  buildings, police, and your car. Survival time is shown separately, and the
  best chase score is saved.

## Project files

- `dwifft.html` — page structure and script loading order
- `styles.css` — game and menu styles
- `js/input.js` — keyboard and gamepad controls
- `js/cars.js` — car definitions and drawing
- `js/tracks.js` — track definitions and streamed procedural city
- `js/physics.js` — car handling and physics
- `js/chase.js` — police pursuit behavior and escalating spawns
- `js/game.js` — game state, menus, simulation, and rendering loop
- `js/error-handler.js` — displays runtime errors in the menu

Optional car sprite PNGs can be placed in `sprites/`, named after their car
IDs: `skyline`, `supra`, `porsche`, `rx7`, `silvia`, and `ae86`. Vector cars are
used when a sprite is not available.

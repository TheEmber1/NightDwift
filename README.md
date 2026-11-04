# NightDwift

NightDwift is a pixelated, CRT-styled browser drifting game with a worn arcade
night-racing look. Race laps, practice freely, or take on an endless city and
an escalating police pursuit.

## Run

Open `dwifft.html` in a browser, or serve the project directory locally:

```sh
python3 -m http.server
```

Then visit `http://localhost:8000/dwifft.html`.

## Controls

- **W / Up:** accelerate; **S / Down:** brake or reverse
- **A / Left** and **D / Right:** steer
- **Space:** handbrake (strong rear breakaway for wider, longer slides)
- **R:** reset; **Escape / P:** return to the menu
- **Menu:** W / S or the D-pad to choose; Enter / Space to confirm
- **Settings:** open from the main menu for control examples and the sound toggle
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
- **Garage:** choose each car's body color, paint pattern, wing, and drift-wheel
  finish. Wheel compounds display their grip ratings and change handling from
  sticky to slippery; setups save separately for every car.

## Project files

- `dwifft.html` — page structure and script loading order
- `styles.css` — game and menu styles
- `js/input.js` — keyboard and gamepad controls
- `js/sound.js` — synthesized engine, tire, and arcade sound effects
- `js/cars.js` — car definitions and drawing
- `js/tracks.js` — track definitions and streamed procedural city
- `js/physics.js` — car handling and physics
- `js/chase.js` — police pursuit behavior and escalating spawns
- `js/game.js` — game state, menus, simulation, and rendering loop
- `js/error-handler.js` — displays runtime errors in the menu

Optional car sprite PNGs can be placed in `sprites/`, named after their car
IDs: `skyline`, `supra`, `porsche`, `rx7`, `silvia`, and `ae86`. Vector cars are
used when a sprite is not available. The included cars are model-specific
vector drawings with a low-resolution arcade presentation. Kenney's free
[CC0 Racing Pack](https://kenney.nl/assets/racing-pack) was considered, but its
generic vehicles do not depict the specific cars in this game.

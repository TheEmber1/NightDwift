# NightDwift

NightDwift is a pixelated, CRT-styled browser drifting game with a worn arcade
night-racing look. Race laps or practice freely.

## Run

Open `index.html` in a browser, or serve the project directory locally:

```sh
python3 -m http.server
```

Then visit `http://localhost:8000/`.

## Controls

- **W / Up:** accelerate; **S / Down:** brake or reverse
- **A / Left** and **D / Right:** steer
- **Space:** handbrake (strong rear breakaway for wider, longer slides)
- **R:** reset; **Escape / P:** return to the menu
- **Menu:** W / S, D-pad, or left stick to choose; Enter / Space / Cross to
  confirm; Escape / Circle / Options to go back
- **Settings:** open from the main menu for control examples and the sound toggle
- Standard gamepads, including PS4 controllers in a supported browser, are
  supported

## Modes

- **Time Attack:** race one circuit on a chosen track and set a best time. A
  finish screen compares your run with your previous and current best, lists
  your five latest local times, shows your friends' best times, and offers a
  retry. Faster runs replace your previous best. The numbered minimap gates,
  glowing next-checkpoint gate, and HUD show the required route; cross every
  gate in order before the checkered finish line.
- **Freeplay:** practice drifting without a timer.
- **Garage:** choose each car's body color, paint pattern, wing, and drift-wheel
  finish. Wheel compounds display their grip ratings and change handling from
  sticky to slippery; setups save separately for every car.
- **Profiles:** sign in with email to sync XP, scores, run totals, and playtime
  through Supabase. Your selected car, per-car garage setups, best and recent
  Time Attack times, selected track, and sound setting sync to your profile.
  Your current customized car appears as your profile picture. The profile with
  friend code
  `CAYBZ#F66865D2F18B` has a glowing developer banner and tag.
- **Friends:** share your friend code, send/accept requests, and compare
  personal-best Time Attack records on every circuit from the finish screen.
- **Following:** open a player from the Friends list or global leaderboard to
  view their profile and follow or unfollow them. Profiles show follower and
  following counts; following is one-way and does not replace mutual Friends.
- **Leaderboards:** browse the global top ten on each Time Attack track,
  including the driver's current car portrait and name, record time, car, and
  saved garage build.
  Sign in to submit your best time.

### Configure player profiles

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql)
   in its SQL Editor. Re-run it after pulling updates that add profile, save,
   friends, following, or leaderboard features; it is written to be re-applied
   safely.
2. Put the project URL and the browser-safe anon/publishable key in
   [`js/supabase-config.js`](./js/supabase-config.js).
3. Enable email/password authentication in the Supabase project. For local
   testing, add your game's local URL to the project's allowed redirect URLs.

Only the anon/publishable key belongs in the browser config; never put a
service-role key in the game. Profile and run rows are protected with
row-level security. Stats sync when a run ends or the player returns to the
menu, and periodically during active runs; saved progress updates XP and
playtime. Friend requests use the unique friend code shown in the Profile
window. Time Attack saves each signed-in player's best time per track and
shows it alongside accepted friends' best times after each run.

## Project files

- `index.html` — page structure and script loading order
- `styles.css` — game and menu styles
- `js/input.js` — keyboard and gamepad controls
- `js/sound.js` — synthesized engine, tire, and arcade sound effects
- `js/cars.js` — car definitions and drawing
- `js/tracks.js` — track definitions
- `js/physics.js` — car handling and physics
- `js/game.js` — game state, menus, simulation, and rendering loop
- `js/profile.js` and `js/supabase-config.js` — account UI, profile syncing,
  and Supabase client configuration
- `supabase/schema.sql` — private profile/run tables and stat-recording RPC
- `js/error-handler.js` — displays runtime errors in the menu

Optional car sprite PNGs can be placed in `sprites/`, named after their car
IDs: `skyline`, `supra`, `porsche`, `rx7`, `silvia`, and `ae86`. Vector cars are
used when a sprite is not available. The included cars are model-specific
vector drawings with a low-resolution arcade presentation. Kenney's free
[CC0 Racing Pack](https://kenney.nl/assets/racing-pack) was considered, but its
generic vehicles do not depict the specific cars in this game.

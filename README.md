# Star Drift

A fast, responsive Asteroids-style arcade game built with plain HTML5 Canvas, CSS, and JavaScript. It has no runtime dependencies.

The playfield scrolls early as the ship approaches an edge. Camera speed ramps up sharply with edge proximity, overtakes the ship while it still has a generous border, and smoothly settles when thrust is released—replacing classic screen-edge teleporting. The ship and varied cratered asteroids use layered, shaded canvas artwork rather than simple wireframes. The field escalates with colossal rocks, volatile red asteroids that explode into dangerous debris, increasingly frequent reinforcements, hostile multi-hit interceptors with aimed plasma fire, and roaring comets that streak through the sector.

## Play locally

Serve the folder with any static web server, for example:

```bash
npx serve .
```

Then open the displayed local URL. Opening `index.html` directly also works, except offline installation requires a web server.

## Controls

- Turn: Arrow Left/Right or A/D
- Thrust: Arrow Up or W
- Fire: Space
- Pause: P or Escape
- Mobile: on-screen multi-touch controls

## Developer launch controls

Add the developer code and options to the game URL. For example, this launches sector 8 with every hazard enabled:

```text
http://localhost:4173/?dev=driftlab&level=8&preset=chaos
```

Available presets are `calm`, `classic`, `combat`, and `chaos`. Every feature can also be switched independently:

```text
?dev=driftlab&level=5&hostiles=1&huge=1&volatile=1&comets=1&bases=1
```

Balance overrides include `roids=0.25..3`, `enemyRate=0.25..3`, `cometRate=0.25..3`, `baseRate=0.25..3`, `enemyWave=1..30`, `cometWave=1..30`, `baseWave=1..30`, and `invincible=1`. The active developer configuration appears in the lower-left corner. Defaults and URL parsing live in `tuning.js`.

## Phone packaging

The game is responsive and installable as a Progressive Web App. It can also be wrapped as a native Android/iOS app with Capacitor without rewriting the game.

## License

MIT

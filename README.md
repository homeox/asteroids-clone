# Star Drift

A fast, responsive Asteroids-style arcade game built with plain HTML5 Canvas, CSS, and JavaScript. It has no runtime dependencies.

The playfield scrolls as the ship approaches an edge. Camera speed ramps up with edge proximity, overtakes the ship before it reaches the border, and smoothly settles when thrust is released—replacing classic screen-edge teleporting.

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

## Phone packaging

The game is responsive and installable as a Progressive Web App. It can also be wrapped as a native Android/iOS app with Capacitor without rewriting the game.

## License

MIT

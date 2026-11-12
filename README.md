# Multi-Channel Vestibular Stimulator Front-End UI

React + TypeScript + Vite frontend for waveform design, zero-sum stimulation
simulation, CSV period export and ESP32 monitoring.

```powershell
npm install
npm run dev:mock
```

Use the URL printed by Vite. `npm run dev` selects the original ROS data source;
configure its address with `.env.local` using `.env.example`. Stimulation is
simulated in both modes until a device transport adapter is implemented.

See [STIMULATION.md](STIMULATION.md) for waveform variables, channel constraints,
configuration, runtime validation, period-analysis limitations and canvas controls.

```powershell
npm test
npm run typecheck
npm run build
npm run preview
```

With the development server running, set `STUDIO_URL` to its URL and run
`npm run test:e2e` to exercise the browser workflow with installed Chrome.

The interface was originally extracted from the Justin Lab UI examples.
Application code is in this project's `src/`; configuration is in
`public/stimulation-config.json`. Build output is in `dist/`.

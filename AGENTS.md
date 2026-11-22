# Repository Guidelines

## Project Structure & Module Organization

Bun workspace monorepo.

- `apps/orbit/`: standalone HTML/CSS/JavaScript instrument. `flow.js` generates phrases, `clock.js` schedules audio, `drums.js` synthesizes percussion, and `orbit.js` connects playback and UI.
- `apps/acido/`: standalone acid bass synth. DSP files are DOM-free and written for a future C++ port.
- `apps/studio/`: Acido and Orbit in one worklet. It reuses Acido's DSP and Orbit's `flow.js` without copying them.
- `plugins/acido-core/`: C++ port of the Acido and Studio DSP, shared by the Luma Acido and Luma Studio plugins. Keep it in step with the web DSP; `scripts/check_native_parity.cjs` compares their audio.
- `plugins/luma/`, `plugins/orbit/`, `plugins/rms/`: C++17/JUCE plugins, each with `src/` and `tests/`. All are built by the root `CMakeLists.txt`.
- `packages/orbit-locales/`: translation catalog that generates Orbit's web and native strings.
- `docs/` contains guides and installation notes. `scripts/` holds packaging, web staging and the local server. `PRODUCT.md` and `DESIGN.md` describe UI intent.
- `build/` and `build-*/`: ignored outputs; never commit compiled plugins.

## Build, Test, and Development Commands

Run commands from the repository root. Use Bun, never npm or npx. Native builds require macOS, Xcode Command Line Tools, and CMake 3.22+. JUCE is pinned and fetched automatically; use `-DJUCE_SOURCE_DIR=/path/to/JUCE` for a local checkout.

```sh
bun install
bun run dev:orbit     # http://127.0.0.1:8765
bun run dev:acido     # http://127.0.0.1:8767
bun run dev:studio    # http://127.0.0.1:8769
bun run test:web
bun run build:native
bun run test:native
bun run test
```

The web apps need no frontend build.

## Coding Style & Naming Conventions

Match surrounding formatting: native C++ generally uses four-space indentation; web JavaScript uses compact one-space nesting; Python uses four spaces. Use PascalCase for classes and camelCase for JavaScript functions and variables. Preserve existing parameter IDs for saved-session compatibility.

No repository-wide formatter or linter is configured. Avoid unrelated reformatting. Keep audio callbacks allocation-free; schedule browser audio against `AudioContext.currentTime`, not timer arrival times.

## Testing Guidelines

Native tests are custom executables: `synth_smoke`, `rms_measurement` and `orbit_sequencer`. Web tests are `*.test.cjs` files run with Bun. No numeric coverage threshold exists. Add focused regression checks for changed behavior, especially timing, cancellation, locked notes, RMS accuracy, and state restoration. For UI/audio changes, also verify playback, stop, and responsive layout in a browser.

## Commit & Pull Request Guidelines

History currently contains one descriptive initial commit; no enforced prefix convention exists. Use concise, action-oriented subjects. PRs should explain the behavior change, report relevant test results, link applicable issues, and include screenshots for UI changes.

## Configuration & Deployment

Keep credentials, `.env` files, Wrangler state, and Audacity sessions untracked. `scripts/prepare_orbit_web.py` stages an explicit asset allowlist. Each app's `wrangler.jsonc` targets its live site; deploy only when requested, with `bun run deploy:orbit` or `bun run deploy:acido`.

# Luma Studio

Acido and Orbit in one page and one audio engine.

```sh
bun run dev:studio    # http://127.0.0.1:8769
bun run --filter @luma/studio test
```

## How it works

- **One clock.** Orbit is a voice inside the Acido engine (`orbit-layer.js`), driven by the Acido sequencer. One Orbit pulse is two Acido steps, so the two cannot drift apart, with or without swing.
- **One key.** Orbit maps its phrases onto the scale of the song and moves strong pulses to the nearest chord tone of the current bass note.
- **One arrangement.** Orbit follows the song sections and rests where both lead and bass are muted.
- **One mix.** Orbit shares the Acido reverb and ducks under the kick through the same sidechain.

Phrases are prepared on the main thread with Orbit's `flow.js`. The audio thread does not allocate.

## Limits

Studio has no WAV export or saved sessions yet, and it does not include Orbit's sampler, Broken mode or Body control. The timbres are ported to the Acido engine, so they are close to Orbit but not identical.

## Deploy

`bun run deploy:studio` publishes to `studio.avalla.dev`. `scripts/prepare_studio_web.py` stages an explicit allowlist of files.

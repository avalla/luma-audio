# Luma Audio

A collection of original music tools: instruments that run in the browser and native plugins for macOS and Windows.

| Tool | What it is | Runs on | Try it |
| --- | --- | --- | --- |
| **Orbit** | Generative synth and sequencer with electronic drums | Web, VST3, Audio Unit, standalone | [orbit.avalla.dev](https://orbit.avalla.dev) · [macOS download](https://github.com/avalla/luma-audio/releases/latest/download/Luma-Orbit-macOS-Universal.zip) |
| **Acido** | Acid bassline synth with sequencer, drums, song mode and sung vowels | Web | [acido.avalla.dev](https://acido.avalla.dev) |
| **Luma Studio** | Acido and Orbit on one audio clock, with a shared mixer and sidechain | Web (local for now) | `bun run dev:studio` |
| **Luma** | Eight-voice polyphonic synth | VST3, Audio Unit, standalone | [Build from source](#building-the-native-plugins) |
| **Luma RMS** | RMS and peak meter | VST3, Audio Unit | [Build from source](#building-the-native-plugins) |

## Monorepo

```text
apps/orbit/              Orbit for the web
apps/acido/              Acido for the web
apps/studio/             Luma Studio, Acido and Orbit in one audio engine
plugins/luma/            Luma synth (C++17/JUCE)
plugins/orbit/           Native Orbit plugin
plugins/rms/             Luma RMS plugin
packages/orbit-locales/  Translations shared by Orbit web and native
docs/                    User guides and installation notes
scripts/                 Packaging, web staging and the local server
```

The repository uses [Bun](https://bun.sh) workspaces. The web apps are plain HTML, CSS and JavaScript with no frontend build, and Wrangler is the only JavaScript dependency.

```sh
bun install
bun run dev:orbit      # http://127.0.0.1:8765
bun run dev:acido      # http://127.0.0.1:8767
bun run dev:studio     # http://127.0.0.1:8769
bun run test:web       # web and translation tests
bun run build:native   # all native plugins
bun run test:native    # native tests
bun run test           # everything
bun run deploy:orbit   # test, stage and publish Orbit
bun run deploy:acido   # test, stage and publish Acido
```

## Orbit

Orbit is a generative synth and sequencer. Its web version schedules audio on the Web Audio clock. The native version is a separate C++ engine, so the two sound similar but not identical.

**New in 0.5:**

- A language selector with Italian, English, French, German and Spanish. The choice is stored on the device, can change during playback and is not saved in presets.
- **Body** adds two sine voices detuned by ±7 cents and one an octave below, with normalized gain. New sessions start at 35%, and 35–60% is a good range. Older presets load with Body at zero to keep their sound.
- Four timed scenes, swing, probability, and the Energy and Fill macros.
- Full phrase capture, JSON presets shared between web and plugin, MIDI export (synth, sub, drums) and three aligned WAV stems.
- Eight timbres: Glass, Rubber, Mist, Soft Keys, Bell, Organ, Velvet and Prism. Presets store the timbre, so reopening one that uses a newer timbre requires an updated Orbit.

**Getting started:** shape a sound, save it to the Intro or Groove scene, then recall the scene while playing. In the plugin, these controls are under the effects and scenes panel. Save a preset to keep all four scene slots.

**Guides:** [English](docs/en/README.md) · [Italiano](docs/Orbit-quickstart.md) · [Français](docs/fr/README.md) · [Deutsch](docs/de/README.md) · [Español](docs/es/README.md)

**More:** [changelog](CHANGELOG.md) · [native guide, in Italian](docs/Luma-Orbit.md) · [web guide, in Italian](apps/orbit/README.md)

### Native plugin

VST3, Audio Unit and standalone, with the Flow sequencer, electronic drums and a tuned sub bass. Transport can follow the DAW's tempo and position. Controls, notes and locks are saved with the session.

- **[Download Luma Orbit for macOS, Intel + Apple Silicon](https://github.com/avalla/luma-audio/releases/latest/download/Luma-Orbit-macOS-Universal.zip)**: the latest release with VST3, Audio Unit, standalone app, sources and licenses.
- [All releases](https://github.com/avalla/luma-audio/releases).
- [Development builds](https://github.com/avalla/luma-audio/actions/workflows/orbit-build.yml): open a successful run and download the ZIP from **Artifacts**. This requires a GitHub login, and builds are kept for 30 days.

The **Build Luma Orbit** workflow runs on native or web changes to `main`, manually with **Run workflow**, or on `orbit-v*` tags. Tags publish a release only after compilation, tests and package verification. Builds are ad-hoc signed and not notarized by Apple.

CMake targets are `LumaOrbit_VST3`, `LumaOrbit_AU`, `LumaOrbit_Standalone` and `LumaOrbitTests`. Artifacts are written to `build-universal/LumaOrbit_artefacts/Release/`. To package them:

```sh
python3 scripts/package_orbit.py --build-dir build-universal --juce-dir /path/to/JUCE
```

The package is created at `build/Delivery/Luma-Orbit-macOS-Universal.zip`.

### Web version

Open [Orbit online](https://orbit.avalla.dev), or serve it on localhost to also use WAV recording:

```sh
bun run dev:orbit
```

Run the generator, clock, preset, MIDI and recording tests with Node.js:

```sh
bun run apps/orbit/flow.test.cjs
bun run apps/orbit/clock.test.cjs
bun run apps/orbit/session.test.cjs
```

The compatibility test needs the preset generated by the native test. Configure `build-universal` as described in [Building the native plugins](#building-the-native-plugins), then run:

```sh
cmake --build build-universal --target LumaOrbitTests -j 8
ctest --test-dir build-universal -R orbit_sequencer --output-on-failure
bun run apps/orbit/interchange.test.cjs build-universal/orbit-native-preset.json
```

## Acido

Acido is a monophonic acid bass synth for the browser, with a resonant four-pole filter, accent, slide and a 16-step sequencer. A JUCE version is planned but not started.

- **Sound:** saw or square oscillator, distortion, glitch and bitcrush, a formant filter that sings A E I O U per step, delay and reverb.
- **Parts:** lead, second bass voice, programmable kick, hi-hat and clap.
- **Composition:** 32 patterns, song sections with mutes, per-step automation and MIDI import.
- **Output:** 24-bit stereo WAV export, private share links and user presets.
- **Demo songs:** 15 original songs, including vocal and glitch collections.
- **Languages:** Italian, English, French, German and Spanish.

Run it locally and test it:

```sh
bun run dev:acido
bun run --filter @luma/acido test
```

The full reference, in Italian, is in the [Acido guide](apps/acido/README.md).

## Luma Studio

Luma Studio runs Orbit as a voice inside the Acido engine, so the two share one sample clock and cannot drift apart. Orbit stays in the song key, follows the bass chords, rests in sections without lead and bass, and ducks under the kick. See the [Studio guide](apps/studio/README.md).

## Native Acido and Studio

`plugins/acido-core/` is the C++ port of the Acido and Studio engines. It builds **Luma Acido** and **Luma Studio** as VST3, Audio Unit (macOS only) and standalone apps, with host tempo sync, MIDI input, all demo songs, and the Studio mixer. The plugins do not include the web step editor yet.

The **Build Luma Native** workflow builds and tests all plugins on macOS and Windows, compares the native audio with the web engine, and uploads one ZIP per platform. A `luma-v*` tag publishes them as a release. Builds are not notarized or code signed.

After changing the demo songs, run `bun scripts/generate_acido_demos.cjs`.

## Luma

An eight-voice synth with two sine, triangle or saw oscillators per voice, mix and detune, a sine sub, a resonant low-pass filter with its own envelope, volume ADSR, stereo chorus and ±2 semitone pitch bend. Presets: Init, Velvet Pad, Rubber Bass, Glass Pluck, Solar Lead and Soft Keys. Manual edits show as "Custom / modified".

- **In a DAW:** create an instrument track and send MIDI to Luma. Parameters are automatable and their state is saved with the project.
- **On-screen keyboard:** works with the mouse.
- **Computer keyboard:** plays from middle C (MIDI 60). Use `A S D F G H J K` for white keys and `W E T Y U` for sharps, and hold several keys for chords. In a DAW, the host must forward keys to the plugin.
- **After typing a value:** click "Suona con la tastiera" or the piano to resume playing. Losing focus releases held keyboard notes.
- **Knobs:** accept typed values, and a double click restores the default.

## Luma RMS

An analysis effect for a track or the DAW master, in VST3 and Audio Unit, mono or stereo. It does not change the audio and adds no latency. Place it after the effects whose result you want to measure.

- Real-time RMS with a moving window of 100, 400 or 1000 ms (default 400 ms).
- Separate L/R readings, with a main value equal to the energy average of the channels: `10 * log10((mean(L²) + mean(R²)) / 2)`. In mono it uses the active channel only.
- Maximum sample peak per channel, held until "Reset peak hold". The reset applies on the next audio block.
- While the window first fills, RMS uses the available samples. Changing the window restarts the fill, and the window is saved with the session.
- A meter from -60 to 0 dBFS, with numeric values beyond that range. Silence shows `-inf`.
- Mathematical RMS with no weighting: a sine peaking at 0 dBFS reads -3.0103 dBFS RMS. It does not measure LUFS or true peak.

The display refreshes at 30 Hz, and the engine updates the measurement on every audio callback. After Stop or a DAW suspend, the last reading and peak stay visible, and the next start begins a new measurement. A status line distinguishes incoming audio, last reading and waiting for playback.

## Building the native plugins

Requires macOS, Xcode Command Line Tools, CMake 3.22+ and GitHub access on the first run. JUCE 8.0.13 is pinned and fetched automatically. To use a local checkout, add `-DJUCE_SOURCE_DIR=/path/to/JUCE`.

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j 8
ctest --test-dir build --output-on-failure
```

| Plugin | Artifact | Install to |
| --- | --- | --- |
| Luma standalone | `build/Luma_artefacts/Release/Standalone/Luma.app` | Run directly |
| Luma VST3 | `build/Luma_artefacts/Release/VST3/Luma.vst3` | `~/Library/Audio/Plug-Ins/VST3/` |
| Luma AU | `build/Luma_artefacts/Release/AU/Luma.component` | `~/Library/Audio/Plug-Ins/Components/` |
| Luma RMS VST3 | `build/LumaRms_artefacts/Release/VST3/Luma RMS.vst3` | `~/Library/Audio/Plug-Ins/VST3/` |
| Luma RMS AU | `build/LumaRms_artefacts/Release/AU/Luma RMS.component` | `~/Library/Audio/Plug-Ins/Components/` |

The build does not install plugins. After copying them, restart the DAW or rescan. Plugins appear under the manufacturer **Luma Audio**.

A local build targets the current Mac's architecture. For a universal build and package (Intel + Apple Silicon):

```sh
cmake -S . -B build-universal -DCMAKE_BUILD_TYPE=Release \
  '-DCMAKE_OSX_ARCHITECTURES=arm64;x86_64' -DCMAKE_OSX_DEPLOYMENT_TARGET=10.13
cmake --build build-universal -j 8
ctest --test-dir build-universal --output-on-failure
python3 scripts/package_plugins.py --build-dir build-universal --universal \
  --juce-dir /path/to/JUCE
```

The ZIP is created at `build/Delivery/Luma-Plugins-macOS-Universal.zip`. The build minimum is macOS 10.13 on Intel and macOS 11 on Apple Silicon, and compatibility with older systems still has to be checked on those machines. The script verifies architectures, ad-hoc signatures and ZIP integrity, and includes the exact sources used for the build.

## Architecture and limits

- `plugins/luma/src/Parameters.h` defines the synth's parameters and presets, `Voice.h` the voices, `Plugin.cpp` the processor and `Editor.cpp` the interface. A single parameter tree feeds DSP, automation and controls.
- The Luma engine uses preallocated voices, a PolyBLEP saw and an additive triangle limited to 8 odd harmonics. Cutoff, resonance, mix, sub, detune, envelope depth and volume are smoothed. Two mono choruses with different modulation create the stereo width, and their memory is allocated during preparation. v0.1 sessions keep their parameters and get neutral values for newer controls.
- `plugins/rms/src/RmsEngine.h` holds the moving-window calculation, independent of JUCE. The RMS processor reads the buffer without changing it and publishes measurements through atomics.
- `plugins/luma/tests/Smoke.cpp` checks finite audio, eight voices, three waveforms, sample rates, silence after release and state restore.
- `plugins/rms/tests/Rms.cpp` checks calibration, the moving window, block-size independence, mono and stereo, bit-identical audio, peak, reset, bypass and state. It also generates `build/Luma-RMS-preview.png`.

**Known limits:** CPU use has not been measured in target DAWs. Multi-host validation, Developer ID signing and notarization are missing. Product names and manufacturer identifiers are provisional.

## License

The original code in this project is released under the [MIT License](LICENSE). JUCE and other dependencies keep their own licenses, which the MIT License does not replace. JUCE is available under AGPL or a commercial license, so choose and comply with the appropriate license before distributing the plugins.

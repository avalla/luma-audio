// Acido session model. JUCE-free. Parameter ids match the web app, so saved values keep their meaning.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>

namespace acido {

namespace P {
enum Id { tuning, cutoff, resonance, envMod, decay, accent, drive, delay, volume, waveform, distortion, distTone, distType, crush, glitch, glitchSize,
          kick, kickTune, kickDecay, duck, formant, vowel, reverb, reverbSize, hat, clap, snare, fill, bass, bassTone, bassDecay, count };
}
inline constexpr const char* paramIds[P::count] = {"tuning","cutoff","resonance","envMod","decay","accent","drive","delay","volume","waveform","distortion","distTone","distType","crush","glitch","glitchSize",
    "kick","kickTune","kickDecay","duck","formant","vowel","reverb","reverbSize","hat","clap","snare","fill","bass","bassTone","bassDecay"};
inline constexpr const char* paramNames[P::count] = {"Tuning","Cutoff","Resonance","Env Mod","Decay","Accent","Drive","Delay","Volume","Wave","Distortion","Dist Tone","Dist Type","Crush","Glitch","Glitch Size",
    "Kick","Kick Tune","Kick Decay","Sidechain","Formant","Vowel","Reverb","Reverb Size","Hi-hat","Clap","Snare","Fill","Bass","Bass Tone","Bass Decay"};
inline constexpr double paramDefaults[P::count] = {.5,.32,.72,.55,.35,.65,.25,.18,.75,0,0,.55,0,0,0,.4,.75,.35,.35,.45,0,0,0,.5,.55,.5,.6,0,.65,.3,.45};

inline constexpr int STEPS = 16, PATTERNS = 32, MAX_SECTIONS = 16, MAX_SECTION_PATTERNS = 128, AUTO_LANES = 4;
inline constexpr int autoParams[AUTO_LANES] = {P::cutoff, P::resonance, P::envMod, P::decay};
enum Mute { muteLead, muteBass, muteKick, muteHat, muteClap, muteSnare, muteCount };

// JavaScript Math.round: halves go up, also for negative values.
inline double jsRound(double x) { return std::floor(x + .5); }
inline double sat(double x) { if (x > 3) return 1; if (x < -3) return -1; const double x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
inline double blep(double t, double dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
}
inline double cutoffHz(double v) { return 60 * std::pow(2.0, v * 6.4); }
inline double decaySeconds(double v) { return .2 + v * v * 2.3; }
inline double distToneHz(double v) { return 800 * std::pow(2.0, v * 3.9); }
inline double glitchSlice(double v) { return std::pow(2.0, -jsRound(std::min(1.0, std::max(0.0, v)) * 4)); }

struct Step {
    int8_t note = 0, octave = 0, gateLen = 0, hat = 0, vowel = -1, bass = -1, bassOct = 0, snare = 0;
    bool gate = false, accent = false, slide = false, clap = false, bassTie = false;
};
struct Pattern {
    int length = STEPS;
    std::array<Step, STEPS> steps{};
    bool hasKicks = false;
    std::array<bool, STEPS> kicks{};
    // NaN = the step follows the knob.
    std::array<std::array<double, STEPS>, AUTO_LANES> automation;
    Pattern() { for (auto& lane : automation) lane.fill(std::numeric_limits<double>::quiet_NaN()); }
};
struct Section {
    char name[25] = {};
    int patternCount = 0, repeat = 1;
    std::array<uint8_t, MAX_SECTION_PATTERNS> patterns{};
    std::array<bool, muteCount> mute{};
};
struct Session {
    char name[41] = {};
    double tempo = 124, swing = .5;
    std::array<double, P::count> params{};
    std::array<Pattern, PATTERNS> patterns;
    std::array<Section, MAX_SECTIONS> sections;
    int sectionCount = 0, scaleCount = 0;
    bool songOn = false;
    std::array<int, 12> scale{};
    Session() { std::copy(std::begin(paramDefaults), std::end(paramDefaults), params.begin()); }
};

} // namespace acido

#include "Songs.generated.h"

namespace acido {

inline constexpr int songCount = int(sizeof(generated::songs) / sizeof(generated::songs[0]));

// Unpacks one factory song from the generated tables.
inline void loadSong(int index, Session& out) {
    using namespace generated;
    const auto& def = songs[std::clamp(index, 0, songCount - 1)];
    out = Session{};
    std::strncpy(out.name, def.name, sizeof(out.name) - 1);
    out.tempo = def.tempo; out.swing = def.swing;
    std::copy(std::begin(def.params), std::end(def.params), out.params.begin());
    out.scaleCount = def.scaleCount;
    for (int i = 0; i < def.scaleCount; ++i) out.scale[size_t(i)] = def.scale[i];
    const int32_t* d = ints + def.intStart;
    const double* v = reals + def.realStart;
    const int used = *d++;
    for (int n = 0; n < used; ++n) {
        auto& p = out.patterns[size_t(*d++)];
        p.length = *d++;
        p.hasKicks = *d++ != 0;
        const int kicks = *d++;
        for (int i = 0; i < STEPS; ++i) p.kicks[size_t(i)] = (kicks >> i & 1) != 0;
        const int lanes = *d++;
        for (int l = 0; l < lanes; ++l) {
            const int lane = *d++, mask = *d++;
            for (int i = 0; i < STEPS; ++i) if (mask >> i & 1) p.automation[size_t(lane)][size_t(i)] = *v++;
        }
        for (auto& s : p.steps) {
            const int x = *d++;
            s.note = int8_t(x & 15); s.octave = int8_t((x >> 4 & 3) - 1); s.gate = (x >> 6 & 1) != 0; s.accent = (x >> 7 & 1) != 0; s.slide = (x >> 8 & 1) != 0;
            s.gateLen = int8_t(x >> 9 & 3); s.hat = int8_t(x >> 11 & 3); s.clap = (x >> 13 & 1) != 0; s.vowel = int8_t((x >> 14 & 7) - 1);
            s.bass = int8_t((x >> 17 & 15) - 1); s.bassOct = int8_t((x >> 21 & 3) - 1); s.bassTie = (x >> 23 & 1) != 0; s.snare = int8_t(x >> 24 & 3);
        }
    }
    out.sectionCount = *d++;
    out.songOn = def.songOn;
    for (int n = 0; n < out.sectionCount; ++n) {
        auto& s = out.sections[size_t(n)];
        std::strncpy(s.name, sectionNames[*d++], sizeof(s.name) - 1);
        s.repeat = *d++;
        const int mute = *d++;
        for (int m = 0; m < muteCount; ++m) s.mute[size_t(m)] = (mute >> m & 1) != 0;
        s.patternCount = *d++;
        for (int i = 0; i < s.patternCount; ++i) s.patterns[size_t(i)] = uint8_t(*d++);
    }
}

} // namespace acido

// C++ port of the Acido and Luma Studio web DSP (apps/acido, apps/studio/mixer.js, apps/studio/orbit-layer.js).
// JUCE-free. Nothing allocates after construction. scripts/check_native_parity.cjs compares its audio with the web engine.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <string>
#include <vector>

namespace acido {

constexpr double PI = 3.141592653589793, TAU = PI * 2;
constexpr int BASE_NOTE = 36, STEPS = 16, PATTERNS = 32, MAX_CHAIN = 32, MAX_SECTIONS = 16, MAX_SECTION_PATTERNS = 128, MAX_PHRASE = 1024;

enum Param { tuning, cutoff, resonance, envMod, decay, accent, drive, delay, volume, waveform, distortion, distTone, distType, crush, glitch, glitchSize,
             kick, kickTune, kickDecay, duck, formant, vowel, reverb, reverbSize, hat, clap, snare, fill, bass, bassTone, bassDecay, paramCount };

struct ParamInfo { const char* id; const char* name; double value; };
inline const std::array<ParamInfo, paramCount>& paramInfo() {
    static const std::array<ParamInfo, paramCount> info {{
        {"tuning","Tuning",.5},{"cutoff","Cutoff",.32},{"resonance","Resonance",.72},{"envMod","Env Mod",.55},{"decay","Decay",.35},{"accent","Accent",.65},
        {"drive","Drive",.25},{"delay","Delay",.18},{"volume","Volume",.75},{"waveform","Wave",0},{"distortion","Distortion",0},{"distTone","Dist Tone",.55},
        {"distType","Dist Type",0},{"crush","Crush",0},{"glitch","Glitch",0},{"glitchSize","Glitch Size",.4},{"kick","Kick",.75},{"kickTune","Kick Tune",.35},
        {"kickDecay","Kick Decay",.35},{"duck","Sidechain",.45},{"formant","Formant",0},{"vowel","Vowel",0},{"reverb","Reverb",0},{"reverbSize","Room",.5},
        {"hat","Hi-hat",.55},{"clap","Clap",.5},{"snare","Snare",.6},{"fill","Fill",0},{"bass","Bass",.65},{"bassTone","Bass Tone",.3},{"bassDecay","Bass Decay",.45}
    }};
    return info;
}

inline double jsRound(double x) { return std::floor(x + .5); }
inline double sat(double x) { if (x > 3) return 1; if (x < -3) return -1; const double x2 = x * x; return x * (27 + x2) / (27 + 9 * x2); }
inline double blep(double t, double dt) {
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
}
inline double hardCurve(double x) { if (x >= 1.5) return 1; if (x <= -1.5) return -1; return x - .148148 * x * x * x; }
inline double shape(double x, double w0, double w1, double w2) {
    static const double bias = sat(.3);
    return w0 * (sat(x + .3) - bias) + w1 * hardCurve(x) + w2 * (.9 * sat(2.5 * x) + .42 * std::abs(sat(1.5 * x)));
}
inline double t60(double seconds, double sr) { return std::exp(-6.9 / (seconds * sr)); }
inline double onePole(double seconds, double sr) { return 1 - std::exp(-1 / (seconds * sr)); }
inline double cutoffHz(double v) { return 60 * std::pow(2.0, v * 6.4); }
inline double decaySeconds(double v) { return .2 + v * v * 2.3; }
inline double distToneHz(double v) { return 800 * std::pow(2.0, v * 3.9); }
inline double glitchSlice(double v) { return std::pow(2.0, -jsRound(std::min(1.0, std::max(0.0, v)) * 4)); }
inline std::int32_t lcg(std::int32_t x) { return std::int32_t(std::uint32_t(x) * 1664525u + 1013904223u); }

struct Rng {
    std::uint32_t a;
    explicit Rng(std::uint32_t seed) : a(seed) {}
    double operator()() {
        a += 0x6D2B79F5u;
        std::uint32_t t = a;
        t = (t ^ (t >> 15)) * (t | 1u);
        t ^= t + (t ^ (t >> 7)) * (t | 61u);
        return double(t ^ (t >> 14)) / 4294967296.0;
    }
};

// ---- Session data ----
struct Step { int note = 0; bool gate = false, accent = false, slide = false; int octave = 0, gateLen = 0, hat = 0; bool clap = false; int vowel = -1, bass = -1, bassOct = 0; bool bassTie = false; int snare = 0; };
struct Pattern {
    int length = STEPS;
    std::array<Step, STEPS> steps {};
    std::array<std::array<double, STEPS>, 4> lanes; // cutoff, resonance, envMod, decay. NaN follows the knob.
    bool hasKicks = false;
    std::array<bool, STEPS> kicks {};
    Pattern() { for (auto& lane : lanes) lane.fill(std::numeric_limits<double>::quiet_NaN()); }
};
enum Part { partLead, partBass, partKick, partHat, partClap, partSnare, partCount };
struct Section { std::array<char, 25> name {}; int count = 0, repeat = 1; std::array<std::uint8_t, MAX_SECTION_PATTERNS> patterns {}; std::array<bool, partCount> mute {}; };
struct Song { bool on = false; int count = 0; std::array<Section, MAX_SECTIONS> sections {}; };
struct SongData {
    double tempo = 124, swing = .5;
    int current = 0, chainCount = 0, scaleCount = 7, phraseLength = 0;
    std::array<Pattern, PATTERNS> patterns {};
    std::array<int, MAX_CHAIN> chain {};
    std::array<int, 12> scale {{0, 2, 3, 5, 7, 8, 10}};
    Song song {};
    std::array<std::int8_t, MAX_PHRASE> deg {};
    std::array<std::uint8_t, MAX_PHRASE> beats {};
};

// ---- Drum language ----
struct Fill { int from = 0; std::array<std::uint8_t, STEPS> s {}, k {}, h {}; };
inline int snareCode(char c) { return c == '1' ? 1 : c == '2' ? 2 : 0; }
inline int hatCode(char c) { return c == 'c' ? 1 : c == 'o' ? 2 : 0; }
inline const std::array<Fill, 9>& fills() {
    static const std::array<Fill, 9> table = [] {
        struct Def { int from; const char* s; const char* k; const char* h; };
        const Def defs[] = {{12,"1111","....","...o"},{12,"2.11","x...","..c."},{12,".211","x...","c..."},{12,"1.11","..x.",".c.."},
            {8,"22221111","x.......",".......o"},{8,"1.21.211","..x..x..",".c..c..o"},{8,".2.21212","x..x....","c.c.c..."},{8,"1..1..11",".x..x...","c.c.c.co"},{8,"2121.111","....x...","....c..o"}};
        std::array<Fill, 9> out {};
        for (size_t f = 0; f < out.size(); ++f) {
            out[f].from = defs[f].from;
            for (int i = 0; defs[f].s[i]; ++i) {
                const auto at = size_t(defs[f].from + i);
                out[f].s[at] = std::uint8_t(snareCode(defs[f].s[i])); out[f].k[at] = defs[f].k[i] == 'x'; out[f].h[at] = std::uint8_t(hatCode(defs[f].h[i]));
            }
        }
        return out;
    }();
    return table;
}
inline int fillIndex(std::int64_t bar, double amount, int pos) {
    if (!(amount > .001)) return -1;
    const auto n = bar + 1;
    bool longFill;
    if (n % 8 == 0) longFill = true;
    else if (n % 4 == 0 && amount >= .25) longFill = amount >= .6;
    else if (n % 2 == 0 && amount >= .75) longFill = false;
    else return -1;
    const auto hash = (std::uint32_t(n) * 0x9E3779B1u) >> 16;
    const int i = longFill ? 4 + int(hash % 5u) : int(hash % 4u);
    return pos >= fills()[size_t(i)].from ? i : -1;
}
inline bool hasDrums(const Pattern& p) {
    if (!p.hasKicks) return true;
    for (size_t i = 0; i < STEPS; ++i) if (p.kicks[i] || p.steps[i].hat || p.steps[i].clap || p.steps[i].snare) return true;
    return false;
}
struct DrumGrid { std::array<bool, STEPS> kicks {}, claps {}; std::array<int, STEPS> snares {}, hats {}; };
inline const std::array<const char*, 5>& styleNames() { static const std::array<const char*, 5> n {{"Techno", "Rave", "Breakbeat", "Jungle", "Electro"}}; return n; }
inline DrumGrid generateDrums(int style, std::uint32_t seed, int variation) {
    using L = std::vector<const char*>;
    struct Def { L kick, snare, clap, hat; };
    static const std::array<Def, 5> styles {{
        {{"x...x...x...x...","x...x...x...x.x.","x...x...x..xx..."},{"....2.......1..2",".......2....1...","..2.....2...1..."},{"....x.......x..."},{"..o...o...o...o.","c.o.c.o.c.o.c.oc","ccoccocccco.ccoc"}},
        {{"x..x..x...x.x...","x..x..x..x..x...","x.x...x..x..x..."},{"....1..2....1..2","....1.......1.11","....1..2.2..1..."},{"....x.......x...","............x..."},{"..o...o...o...o.","c.occ.o.c.occ.oc"}},
        {{"x.x.......x..x..","x.....x...x.....","x..x......xx...."},{"....1..2.2..1...","....1.....2.1..2","....1..2....1.2."},{"................","............x..."},{"c.c.c.c.c.c.c.co","c.c.o.c.c.c.o.c.","ccc.ccc.ccc.ccco"}},
        {{"x.........x.....","x.x.......x.....","x.....x...x..x.."},{"....1..2.2..1.2.","....1.2..2..1..2","..2.1..2.2.21..."},{"................"},{"ccccccccccccccco","c.ccc.ccc.ccc.co","cc.ccc.ccc.ccc.c"}},
        {{"x..x..x...x..x..","x.....x.x.....x.","x..x....x.x....."},{"....1.......1...","....1.......1..2","....1..2....1..."},{"....x.......x...","................"},{"c.c.c.c.c.c.c.c.","ccc.ccc.ccc.ccc."}}
    }};
    const auto& def = styles[size_t(std::clamp(style, 0, 4))];
    Rng base(seed);
    auto pick = [&](const L& list) { return list[size_t(std::floor(base() * double(list.size())))]; };
    const char* k = pick(def.kick); const char* s = pick(def.snare); const char* c = pick(def.clap); const char* h = pick(def.hat);
    Rng r(seed + std::uint32_t(variation + 1) * 7919u);
    DrumGrid d;
    for (size_t i = 0; i < STEPS; ++i) { d.kicks[i] = k[i] == 'x'; d.snares[i] = snareCode(s[i]); d.claps[i] = c[i] == 'x'; d.hats[i] = hatCode(h[i]); }
    if (variation > 0) {
        const size_t ghosts[] = {3, 9, 13}, g = ghosts[variation % 3];
        d.snares[g] = d.snares[g] == 0 ? 2 : 0;
        for (size_t i : {6u, 7u, 10u, 11u, 14u, 15u}) {
            if (r() < .22 && !d.kicks[i] && i % 4 != 0) d.kicks[i] = true;
            if (r() < .3 && !d.snares[i]) d.snares[i] = 2;
            if (r() < .25) d.hats[i] = d.hats[i] == 2 ? 1 : d.hats[i] == 0 ? 1 : 0;
        }
    }
    d.kicks[0] = true;
    return d;
}
inline void applyDrums(Pattern& p, const DrumGrid& d) {
    p.hasKicks = true; p.kicks = d.kicks;
    for (size_t i = 0; i < STEPS; ++i) { p.steps[i].hat = d.hats[i]; p.steps[i].clap = d.claps[i]; p.steps[i].snare = d.snares[i]; }
}

// ---- Orbit phrase ----
inline void buildTimeline(SongData& out, std::array<int, 8> notes, double amount, std::uint32_t seed, int phrases = 8) {
    Rng r(seed);
    const double strength = std::max(0.0, std::min(1.0, amount));
    const bool evolving = strength > 0;
    int n = 0;
    auto push = [&](int d, int b) { if (n < MAX_PHRASE) { out.deg[size_t(n)] = std::int8_t(d); out.beats[size_t(n)] = std::uint8_t(b); ++n; } };
    for (int phrase = 0; phrase < phrases; ++phrase) {
        const int lengths[] = {8, 12, 16};
        const int length = evolving ? lengths[int(std::floor(r() * 3))] : 8;
        auto next = notes;
        if (evolving) {
            std::vector<int> candidates {0, 1, 2, 3, 4, 5, 6, 7};
            const int count = std::max(1, int(std::ceil(strength * 3)));
            for (int j = 0; j < count && !candidates.empty(); ++j) {
                const auto at = size_t(std::floor(r() * double(candidates.size())));
                const auto i = size_t(candidates[at]); candidates.erase(candidates.begin() + std::ptrdiff_t(at));
                const int sign = r() < .5 ? -1 : 1;
                const int delta = sign * (1 + int(std::floor(r() * std::ceil(strength * 3))));
                next[i] = std::max(0, std::min(7, next[i] + delta));
                if (next[i] == notes[i]) next[i] = notes[i] == 7 ? 6 : notes[i] + 1;
            }
        }
        struct Event { int index; bool rest; int beats; };
        std::vector<Event> events;
        for (int j = 0; j < length; ++j) {
            const int index = j < 8 || !evolving ? j % 8 : int(std::floor(r() * 8));
            const bool rest = evolving && j > 0 && r() < strength * .28;
            const int beats = evolving && r() < strength * .35 ? 2 : 1;
            events.push_back({index, rest, beats});
        }
        notes = next;
        for (const auto& e : events) {
            push(e.rest ? -1 : notes[size_t(e.index)], e.beats);
            for (int j = 1; j < e.beats; ++j) push(-1, 1);
        }
        while (n % 8) push(-1, 1);
    }
    out.phraseLength = n - n % 8;
}

// ---- Voices ----
class Glitch {
public:
    explicit Glitch(double rate) : sr(rate), size(int(std::ceil(rate * 2.5))), buf(size_t(size)), loop(size_t(std::ceil(rate * .4))),
        fadeCoef(1 - std::exp(-1 / (.002 * rate))), declick(std::exp(-1 / (.0015 * rate))) { reset(); }
    void reset() {
        std::fill(buf.begin(), buf.end(), 0.f); std::fill(loop.begin(), loop.end(), 0.f);
        w = 0; mode = 0; active = false; mix = 0; remaining = 0; held = false; sliceLen = 1; p = 0; revStart = 0; t = 0; readPos = 0; len = 1;
        crushPhase = 1; crushHeld = 0; rngState = 0x5eed; lastWet = 0; offset = 0; jump = false;
    }
    void onStep(double stepLen, double probability, double slice) {
        if (held) return;
        const double r = rand(), kind = rand();
        if (!(probability > 0 && r < probability)) return;
        jump = mode != 0;
        remaining = jsRound(stepLen);
        if (kind < .5) startStutter(stepLen, slice);
        else if (kind < .75) { mode = 2; revStart = w; t = 0; active = true; }
        else { mode = 3; readPos = w - 1 < 0 ? size - 1 : w - 1; len = remaining; active = true; }
    }
    void hold(bool on, double stepLen, double slice) {
        if (on && !held) { held = true; remaining = std::numeric_limits<double>::infinity(); startStutter(stepLen, slice); }
        else if (!on && held) { held = false; active = false; }
    }
    double process(double x, double crush) {
        buf[size_t(w)] = float(x); if (++w >= size) w = 0;
        double y = x;
        if (mode != 0) {
            if (active && --remaining <= 0) active = false;
            mix += ((active ? 1.0 : 0.0) - mix) * fadeCoef;
            double wet = read(x);
            if (jump) { offset = lastWet - wet; jump = false; }
            wet += offset; offset *= declick; lastWet = wet;
            y = x + (wet - x) * mix;
            if (!active && mix < 1e-4) { mode = 0; mix = 0; offset = 0; }
        }
        if (crush > 1e-5) {
            const double q = std::pow(2.0, 16 - crush * 13 - 1);
            crushPhase += std::pow(2.0, -crush * 5);
            if (crushPhase >= 1) { crushPhase -= 1; crushHeld = jsRound(y * q) / q; }
            y = crushHeld;
        } else crushPhase = 1;
        return y;
    }
private:
    double rand() {
        rngState += 0x6D2B79F5u;
        std::uint32_t v = rngState;
        v = (v ^ (v >> 15)) * (v | 1u); v ^= v + (v ^ (v >> 7)) * (v | 61u);
        return double(v ^ (v >> 14)) / 4294967296.0;
    }
    void startStutter(double stepLen, double slice) {
        const int L = std::min(int(loop.size()), std::max(16, int(jsRound(stepLen * slice))));
        int s = w - L; if (s < 0) s += size;
        for (int i = 0; i < L; ++i) { loop[size_t(i)] = buf[size_t(s)]; if (++s >= size) s = 0; }
        mode = 1; sliceLen = L; p = 0; active = true;
    }
    double read(double x) {
        if (mode == 1) {
            const int L = sliceLen, F = std::min(64, L >> 2), at = p;
            const double g = std::min({1.0, double(at) / F, double(L - at) / F});
            if (++p >= L) p = 0;
            return double(loop[size_t(at)]) * g;
        }
        if (mode == 2) {
            std::int64_t i = std::int64_t(revStart) - 1 - t; i %= size; if (i < 0) i += size;
            ++t; return buf[size_t(i)];
        }
        if (mode == 3) {
            const double rate = active ? remaining / len : 0;
            double r = readPos;
            const int i0 = int(std::floor(r)), i1 = i0 + 1 >= size ? 0 : i0 + 1;
            const double f = r - i0, y = double(buf[size_t(i0)]) + (double(buf[size_t(i1)]) - double(buf[size_t(i0)])) * f;
            r += rate; if (r >= size) r -= size; readPos = r;
            return y;
        }
        return x;
    }
    double sr; int size; std::vector<float> buf, loop; double fadeCoef, declick;
    int w = 0, mode = 0, sliceLen = 1, p = 0, revStart = 0; std::int64_t t = 0;
    bool active = false, held = false, jump = false;
    double mix = 0, remaining = 0, readPos = 0, len = 1, crushPhase = 1, crushHeld = 0, lastWet = 0, offset = 0;
    std::uint32_t rngState = 0x5eed;
};

class Kick {
public:
    explicit Kick(double rate) : sr(rate), pitchCoef(std::exp(-1 / (.028 * rate))), clickCoef(std::exp(-1 / (.004 * rate))),
        duckAttack(1 - std::exp(-1 / (.002 * rate))), duckRelease(1 - std::exp(-1 / (.09 * rate))) { reset(); }
    void reset() { phase = amp = pitch = click = clickPhase = duck = ampCoef = 0; noise = 0x1234; }
    void trigger(double decayValue) { phase = 0; amp = 1; pitch = 1; click = 1; clickPhase = 0; ampCoef = std::exp(-6.9 / ((.15 + decayValue * .65) * sr)); }
    double process(double tune) {
        if (amp < 1e-5 && click < 1e-5) { duck += (0 - duck) * duckRelease; return 0; }
        const double f = (40 + tune * 30) * (1 + 3.2 * pitch);
        phase += f / sr; if (phase >= 1) phase -= 1;
        const double body = std::sin(TAU * phase) * amp;
        noise = lcg(noise);
        clickPhase += 1800 / sr; if (clickPhase >= 1) clickPhase -= 1;
        const double hit = (noise / 2147483648.0 * .5 + std::sin(TAU * clickPhase) * .5) * click * .35;
        pitch *= pitchCoef; amp *= ampCoef; click *= clickCoef;
        duck += (amp - duck) * (amp > duck ? duckAttack : duckRelease);
        return sat((body + hit) * 1.5);
    }
    double duckGain(double amount) const { return 1 - amount * .85 * (duck > 1 ? 1 : duck); }
private:
    double sr, pitchCoef, clickCoef, duckAttack, duckRelease, phase = 0, amp = 0, pitch = 0, click = 0, clickPhase = 0, duck = 0, ampCoef = 0;
    std::int32_t noise = 0x1234;
};

class Drums {
public:
    double hatOut = 0, clapOut = 0, snareOut = 0;
    explicit Drums(double sr) {
        const double metal[] = {205.3, 304.4, 369.6, 522.7, 540, 800};
        for (size_t i = 0; i < 6; ++i) inc[i] = metal[i] * 2.4 / sr;
        hpCoef = 1 - std::exp(-TAU * 7000 / sr); closedCoef = t60(.055, sr); openCoef = t60(.34, sr); burstCoef = t60(.012, sr); tailCoef = t60(.19, sr);
        b2 = int(jsRound(.011 * sr)); b3 = int(jsRound(.022 * sr)); b4 = int(jsRound(.033 * sr));
        bpG = std::tan(PI * 1300 / sr); bpK = 1 / 1.6; bpA1 = 1 / (1 + bpG * (bpG + bpK)); bpA2 = bpG * bpA1; bpA3 = bpG * bpA2;
        snBodyCoef = t60(.09, sr); snNoiseCoef = t60(.17, sr); snHp = 1 - std::exp(-TAU * 1800 / sr); snInc1 = 185 / sr; snInc2 = 330 / sr;
        reset();
    }
    void reset() {
        ph.fill(0); hatEnv = 0; hatCoef = closedCoef; lp1 = lp2 = 0; burst = tail = 0; clapT = -1; ic1 = ic2 = 0; noise = 0x51ed; hatOut = clapOut = 0;
        snEnv = snBody = snPh1 = snPh2 = snLp = 0; snLevel = 1; snareOut = 0;
    }
    void hatHit(bool open) { hatEnv = 1; hatCoef = open ? openCoef : closedCoef; }
    void clapHit() { clapT = 0; burst = 1; tail = 0; }
    void snareHit(double level) { snEnv = 1; snBody = 1; snLevel = level; }
    void process() {
        hatOut = clapOut = snareOut = 0;
        if (hatEnv < 1e-5 && clapT < 0 && burst < 1e-5 && tail < 1e-5 && snEnv < 1e-5) return;
        noise = lcg(noise);
        const double n = noise / 2147483648.0;
        if (hatEnv >= 1e-5) {
            double metal = 0;
            for (size_t i = 0; i < 6; ++i) { double p = ph[i] + inc[i]; if (p >= 1) p -= 1; ph[i] = p; metal += p < .5 ? 1 : -1; }
            const double x = metal / 6 * .7 + n * .3;
            lp1 += (x - lp1) * hpCoef; const double h1 = x - lp1;
            lp2 += (h1 - lp2) * hpCoef;
            hatOut = (h1 - lp2) * hatEnv * 1.7;
            hatEnv *= hatCoef;
        }
        if (clapT >= 0) {
            const int c = clapT++;
            if (c == b2 || c == b3) burst = 1;
            if (c == b4) { tail = 1; clapT = -1; }
        }
        const double env = std::max(burst, tail * .7);
        if (env >= 1e-5) {
            const double v3 = n - ic2, v1 = bpA1 * ic1 + bpA2 * v3, v2 = ic2 + bpA2 * ic1 + bpA3 * v3;
            ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
            clapOut = v1 * bpK * env * 2.2;
        }
        burst *= burstCoef; tail *= tailCoef;
        if (snEnv >= 1e-5) {
            double a = snPh1 + snInc1, b = snPh2 + snInc2; if (a >= 1) a -= 1; if (b >= 1) b -= 1; snPh1 = a; snPh2 = b;
            snLp += (n - snLp) * snHp;
            snareOut = ((std::sin(TAU * a) * .6 + std::sin(TAU * b) * .4) * snBody * .6 + (n - snLp) * snEnv * .8) * snLevel;
            snBody *= snBodyCoef; snEnv *= snNoiseCoef;
        }
    }
private:
    std::array<double, 6> inc {}, ph {};
    double hpCoef, closedCoef, openCoef, burstCoef, tailCoef, bpG, bpK, bpA1, bpA2, bpA3, snBodyCoef, snNoiseCoef, snHp, snInc1, snInc2;
    int b2, b3, b4, clapT = -1;
    double hatEnv = 0, hatCoef = 0, lp1 = 0, lp2 = 0, burst = 0, tail = 0, ic1 = 0, ic2 = 0, snEnv = 0, snBody = 0, snPh1 = 0, snPh2 = 0, snLp = 0, snLevel = 1;
    std::int32_t noise = 0x51ed;
};

class Formant {
public:
    explicit Formant(double rate) : sr(rate) { for (size_t b = 0; b < 3; ++b) k[b] = 1.0 / Q(b); reset(); }
    void reset() { ic1.fill(0); ic2.fill(0); count = 0; }
    double process(double x, double pos, double mix) {
        if (mix <= 1e-5) { if (count != 0) reset(); return x; }
        if (--count <= 0) { count = 8; update(pos); }
        static constexpr double gain[] = {1, .62, .3};
        double out = 0;
        for (size_t b = 0; b < 3; ++b) {
            const double c1 = ic1[b], c2 = ic2[b], v3 = x - c2, v1 = a1[b] * c1 + a2[b] * v3, v2 = c2 + a2[b] * c1 + a3[b] * v3;
            ic1[b] = 2 * v1 - c1; ic2[b] = 2 * v2 - c2;
            out += v1 * k[b] * gain[b];
        }
        return x + (out * 2.6 - x) * mix;
    }
private:
    static double Q(size_t b) { static constexpr double q[] = {8, 11, 13}; return q[b]; }
    void update(double pos) {
        static constexpr double vowels[5][3] = {{730,1090,2440},{530,1840,2480},{270,2290,3010},{570,840,2410},{300,870,2240}};
        const int i = std::min(4, std::max(0, int(std::floor(pos)))), j = std::min(4, i + 1);
        const double f = std::min(1.0, std::max(0.0, pos - i));
        for (size_t b = 0; b < 3; ++b) {
            const double hz = std::min(sr * .45, vowels[i][b] * std::pow(vowels[j][b] / vowels[i][b], f));
            const double g = std::tan(PI * hz / sr), c = 1 / (1 + g * (g + k[b]));
            a1[b] = c; a2[b] = g * c; a3[b] = g * g * c;
        }
    }
    double sr; int count = 0;
    std::array<double, 3> ic1 {}, ic2 {}, a1 {}, a2 {}, a3 {}, k {};
};

class Reverb {
public:
    double l = 0, r = 0;
    explicit Reverb(double sr) {
        const double times[] = {.0297, .0371, .0411, .0437};
        for (size_t i = 0; i < 4; ++i) buf[i].resize(size_t(jsRound(times[i] * sr * 1.6)));
        damp = 1 - std::exp(-PI * 2 * 5200 / sr);
        reset();
    }
    void reset() { for (auto& b : buf) std::fill(b.begin(), b.end(), 0.f); pos.fill(0); lp.fill(0); l = r = 0; }
    void process(double x, double size) {
        const double fb = .72 + size * .23;
        const double a[] = {buf[0][pos[0]], buf[1][pos[1]], buf[2][pos[2]], buf[3][pos[3]]};
        l = (a[0] + a[2]) * .5; r = (a[1] + a[3]) * .5;
        const double m = (a[0] + a[1] + a[2] + a[3]) * .5;
        for (size_t i = 0; i < 4; ++i) {
            lp[i] += (a[i] - m - lp[i]) * damp;
            if (std::abs(lp[i]) < 1e-15) lp[i] = 0;
            buf[i][pos[i]] = float(lp[i] * fb + (i % 2 ? -x : x) * .35);
            if (++pos[i] >= buf[i].size()) pos[i] = 0;
        }
    }
private:
    std::array<std::vector<float>, 4> buf; std::array<size_t, 4> pos {}; std::array<double, 4> lp {}; double damp;
};

class Bass {
public:
    explicit Bass(double rate) : sr(rate), attack(1 - std::exp(-1 / (.002 * rate))), release(1 - std::exp(-1 / (.012 * rate))),
        glide(1 - std::exp(-1 / (.025 * rate))), filterEnvCoef(std::exp(-6.9 / (.22 * rate))) { reset(); }
    void reset() { phase = 0; pitch = target = 36; gate = false; amp = body = fenv = ic1 = ic2 = 0; count = 0; a1 = 1; a2 = a3 = 0; }
    void on(int note, bool tied) { target = note; if (!(tied && gate)) { pitch = note; body = 1; fenv = 1; } gate = true; }
    void off() { gate = false; }
    double process(double tone, double decayValue) {
        if (!gate && amp < 1e-5) { if (amp != 0) { amp = 0; ic1 = ic2 = 0; } return 0; }
        pitch += (target - pitch) * glide;
        const double hz = 440 * std::pow(2.0, (pitch - 69) / 12), dt = std::min(.45, hz / sr);
        phase += dt; if (phase >= 1) phase -= 1;
        const double x = (2 * phase - 1 - blep(phase, dt)) * .5 + std::sin(TAU * phase) * .6;
        if (--count <= 0) {
            count = 8;
            const double fc = std::min(sr * .42, 80 * std::pow(2.0, tone * 5 + fenv * 1.6)), g = std::tan(PI * fc / sr), k = 1.1;
            a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
            body *= std::exp(-6.9 * 8 / ((.15 + decayValue * 1.85) * sr));
            fenv *= std::pow(filterEnvCoef, 8);
        }
        const double v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        const double goal = gate ? .35 + .65 * body : 0;
        amp += (goal - amp) * (goal > amp ? attack : release);
        return sat(v2 * 1.3) * amp;
    }
private:
    double sr, attack, release, glide, filterEnvCoef, phase = 0, pitch = 36, target = 36, amp = 0, body = 0, fenv = 0, ic1 = 0, ic2 = 0, a1 = 1, a2 = 0, a3 = 0;
    bool gate = false; int count = 0;
};

class OrbitLayer {
public:
    static constexpr int SIZE = 2048, VOICES = 8;
    double level = .7, send = .25, l = 0, r = 0;
    int transpose = 0, octave = 0;
    explicit OrbitLayer(double rate) : sr(rate), fast(std::exp(-6.9 / (.012 * rate))) {
        for (size_t s = 0; s < tables.size(); ++s) {
            auto& t = tables[s]; double peakValue = 0;
            for (int i = 0; i < SIZE; ++i) {
                double x = 0; const auto& h = timbre(s).harmonics;
                for (size_t n = 0; n < 8; ++n) x += h[n] * std::sin(TAU * double(n + 1) * i / SIZE);
                t[size_t(i)] = float(x); peakValue = std::max(peakValue, std::abs(x));
            }
            for (size_t i = 0; i < SIZE; ++i) t[i] = float(double(t[i]) / peakValue);
            t[SIZE] = t[0];
        }
        setTone(.6);
    }
    static const std::array<const char*, 8>& soundNames() { static const std::array<const char*, 8> n {{"Glass", "Rubber", "Mist", "Soft Keys", "Bell", "Organ", "Velvet", "Prism"}}; return n; }
    void setTone(double v) { const double fc = std::min(sr * .45, 300 + v * v * 12000); lp = 1 - std::exp(-TAU * fc / sr); }
    void setSound(int i) { if (i >= 0 && i < 8) sound = size_t(i); }
    void setScale(const std::array<int, 12>& scale, int count) {
        const int n = std::min(12, count); nPcs = n;
        for (int i = 0; i < n; ++i) pcs[size_t(i)] = scale[size_t(i)];
        int last = 60 + scale[0]; if (last > 66) last -= 12;
        pitches[0] = last;
        for (int d = 1; d < 8; ++d) { const int pc = scale[size_t(d % n)], up = ((pc - last % 12) % 12 + 12) % 12; last += up ? up : 12; pitches[size_t(d)] = last; }
    }
    void setPhrase(const std::int8_t* degrees, const std::uint8_t* lengths, int length) { deg = degrees; beats = lengths; phraseLength = length; }
    void restart() { root = -1; }
    void stop() { for (size_t i = 0; i < VOICES; ++i) if (on[i]) { rising[i] = 0; fall[i] = fast; } }
    void reset() { on.fill(0); env.fill(0); lpL = lpR = l = r = 0; root = -1; }
    void step(std::int64_t count, const Step* s, bool muted) {
        if (s && s->bass >= 0) root = ((36 + s->bassOct * 12 + s->bass + transpose) % 12 + 12) % 12;
        if (count % 2) return;
        if (phraseLength <= 0) return;
        const auto pulse = size_t((count / 2) % phraseLength);
        const int d = deg[pulse];
        if (d < 0 || muted) return;
        const int base = pitches[size_t(d)]; const bool strong = pulse % 4 == 0;
        noteOn((strong ? chordTone(base) : base) + octave * 12, strong ? .23 : .12, beats[pulse] > 1 ? 1.4 : 1);
    }
    void process() {
        double a = 0, b = 0;
        const auto& tab = tables[sound];
        for (size_t i = 0; i < VOICES; ++i) {
            if (!on[i]) continue;
            double p = phase[i] + inc[i]; if (p >= SIZE) p -= SIZE; phase[i] = p;
            const auto k = size_t(p); const double f = p - double(k), x = (double(tab[k]) + (double(tab[k + 1]) - double(tab[k])) * f) * env[i];
            if (i % 2) { a += x * .82; b += x * .58; } else { a += x * .58; b += x * .82; }
            if (rising[i]) { env[i] += rise[i]; if (env[i] >= peak[i]) { env[i] = peak[i]; rising[i] = 0; } }
            else { env[i] *= fall[i]; if (env[i] < 1e-5) { env[i] = 0; on[i] = 0; } }
        }
        lpL += (a - lpL) * lp; lpR += (b - lpR) * lp;
        l = lpL * level * 8; r = lpR * level * 8;
    }
private:
    struct Timbre { std::array<double, 8> harmonics; double attack, decayTime; };
    static const Timbre& timbre(size_t i) {
        static const std::array<Timbre, 8> t {{
            {{{1,0,0,0,0,0,0,0}},.006,.5},{{{1,0,-1.0/9,0,1.0/25,0,0,0}},.006,.19},{{{1,.5,.33,.25,.2,.17,.14,.12}},.08,.75},{{{.75,.25,0,0,0,0,0,0}},.006,.5},
            {{{1,.5,0,.3,0,.2,0,0}},.006,1.2},{{{.55,.3,.15,0,0,0,0,0}},.015,1},{{{.8,0,.2,0,0,0,0,0}},.12,1.4},{{{.6,.25,0,.15,0,0,0,0}},.006,.7}
        }};
        return t[i];
    }
    int chordTone(int p) const {
        if (root < 0 || !nPcs) return p;
        int at = -1; for (int i = 0; i < nPcs; ++i) if (pcs[size_t(i)] == root) { at = i; break; }
        if (at < 0) return p;
        const int a = pcs[size_t(at)], b = pcs[size_t((at + 2) % nPcs)], c = pcs[size_t((at + 4) % nPcs)];
        for (int d = 0; d < 7; ++d) for (int s = 0; s < 2; ++s) { const int x = s ? p + d : p - d, pc = (x % 12 + 12) % 12; if (pc == a || pc == b || pc == c) return x; }
        return p;
    }
    void noteOn(int pitch, double gain, double hold) {
        const auto i = next; next = (i + 1) % VOICES;
        const auto& def = timbre(sound);
        on[i] = 1; rising[i] = 1; phase[i] = 0; inc[i] = 440 * std::pow(2.0, (pitch - 69) / 12.0) / sr * SIZE; peak[i] = gain;
        rise[i] = gain / std::max(1.0, def.attack * sr); fall[i] = std::exp(std::log(1e-4) / (def.decayTime * hold * sr));
    }
    double sr, fast, lp = 1, lpL = 0, lpR = 0;
    std::array<std::array<float, SIZE + 1>, 8> tables {};
    std::array<std::uint8_t, VOICES> on {}, rising {};
    std::array<double, VOICES> phase {}, inc {}, env {}, peak {}, rise {}, fall {};
    std::array<int, 8> pitches {}; std::array<int, 12> pcs {};
    const std::int8_t* deg = nullptr; const std::uint8_t* beats = nullptr;
    int phraseLength = 0, nPcs = 0, root = -1; size_t next = 0, sound = 0;
};

class Mixer {
public:
    static constexpr int N = 7;
    enum Channel { lead, orbit, bassChannel, kickChannel, snareChannel, hatChannel, clapChannel };
    struct Strip { bool mute = false, solo = false; double pan = 0, delay = 0, reverb = 0; };
    std::array<float, N + 1> peak {};
    double retD = 1, retV = 1, delayIn = 0, reverbIn = 0, duckL = 0, duckR = 0, dryL = 0, dryR = 0;
    explicit Mixer(double sr) : k(1 - std::exp(-1 / (.005 * sr))) { update(); reset(); }
    void setStrip(int i, const Strip& s) {
        if (i < 0 || i >= N) return;
        auto unit = [](double v, double lo) { return std::isfinite(v) ? std::min(1.0, std::max(lo, v)) : 0.0; };
        strips[size_t(i)] = {s.mute, s.solo, unit(s.pan, -1), unit(s.delay, 0), unit(s.reverb, 0)};
        update();
    }
    void setReturns(double d, double r) { if (std::isfinite(d)) returnDelay = std::min(1.0, std::max(0.0, d)); if (std::isfinite(r)) returnReverb = std::min(1.0, std::max(0.0, r)); }
    void reset() { gL = tL; gR = tR; gD = tD; gV = tV; peak.fill(0); retD = returnDelay; retV = returnReverb; delayIn = reverbIn = duckL = duckR = dryL = dryR = 0; }
    void process(double leadIn, double orbitL, double orbitR, double bassIn, double kickIn, double snareIn, double hatIn, double clapIn) {
        const double a[N] = {leadIn, orbitL, bassIn, kickIn, snareIn, hatIn, clapIn}, b[N] = {leadIn, orbitR, bassIn, kickIn, snareIn, hatIn, clapIn};
        double nextDuckL = 0, nextDuckR = 0, nextDryL = 0, nextDryR = 0, del = 0, rev = 0;
        for (size_t i = 0; i < N; ++i) {
            gL[i] += (tL[i] - gL[i]) * k; gR[i] += (tR[i] - gR[i]) * k; gD[i] += (tD[i] - gD[i]) * k; gV[i] += (tV[i] - gV[i]) * k;
            const double x = a[i] * gL[i], y = b[i] * gR[i], mono = (a[i] + b[i]) * .5, m = std::max(std::abs(x), std::abs(y));
            if (m > peak[i]) peak[i] = float(m);
            del += mono * gD[i]; rev += mono * gV[i];
            if (i < 3) { nextDuckL += x; nextDuckR += y; } else { nextDryL += x; nextDryR += y; }
        }
        retD += (returnDelay - retD) * k; retV += (returnReverb - retV) * k;
        delayIn = del; reverbIn = rev; duckL = nextDuckL; duckR = nextDuckR; dryL = nextDryL; dryR = nextDryR;
    }
private:
    void update() {
        bool soloed = false; for (const auto& s : strips) soloed = soloed || s.solo;
        for (size_t i = 0; i < N; ++i) {
            const auto& s = strips[i]; const double on = !s.mute && (!soloed || s.solo) ? 1 : 0;
            tL[i] = on * std::min(1.0, 1 - s.pan); tR[i] = on * std::min(1.0, 1 + s.pan); tD[i] = on * s.delay; tV[i] = on * s.reverb;
        }
    }
    double k, returnDelay = 1, returnReverb = 1;
    std::array<Strip, N> strips {};
    std::array<double, N> tL {}, tR {}, tD {}, tV {}, gL {}, gR {}, gD {}, gV {};
};

class Engine;
class Sequencer {
public:
    double tempo = 124, swing = .5, stepLen, curLen = 0, pos = 0, offAt = inf(), bassOffAt = inf();
    bool running = false, prevGate = false, prevSlide = false, changed = false, prevBassTie = false, loopSec = false;
    int transpose = 0, pat = 0, step = 0, queued = -1, chainPos = 0, lastFired = -1, lastPat = 0, secI = 0, secPos = 0, secRep = 0, nS = 0, nI = 0, nR = 0, qSec = -1;
    std::int64_t count = 0;
    std::array<bool, 4> held {};
    explicit Sequencer(double rate) : stepLen(rate * 60 / 124 / 4), sr(rate) { fills(); }
    void configure(const SongData& next) {
        data = &next;
        if (next.song.count > 0) {
            if (secI >= next.song.count) { secI = 0; secPos = 0; secRep = 0; }
            const auto& sec = next.song.sections[size_t(secI)];
            if (secPos >= sec.count) secPos = 0;
            if (secRep >= sec.repeat) secRep = 0;
        }
        setTempo(next.tempo);
        swing = std::min(.75, std::max(.5, next.swing));
        if (chainPos >= next.chainCount) chainPos = 0;
        if (step >= len(pat)) step = len(pat) - 1;
    }
    void setTempo(double value) { tempo = std::min(200.0, std::max(60.0, value)); stepLen = sr * 60 / tempo / 4; }
    void select(int i) {
        if (i < 0) return;
        if (!running) { pat = i; queued = -1; return; }
        if (songActive()) return;
        queued = i == pat ? -1 : i;
    }
    void queueSection(int i) { qSec = songActive() && i >= 0 && i < data->song.count ? i : -1; }
    bool songActive() const { return data && data->song.on && data->song.count > 0; }
    void start(Engine& e) { begin(e); fire(e); }
    void seek(Engine& e, std::int64_t steps, double fraction);
    void stop(Engine& e);
    void tick(Engine& e);
    void hold(int lane, bool on, Engine& e);
private:
    static double inf() { return std::numeric_limits<double>::infinity(); }
    int len(int p) const { return data ? data->patterns[size_t(p)].length : STEPS; }
    int songNext() {
        const auto& list = data->song;
        if (qSec >= 0 && qSec < list.count) { nS = qSec; nI = 0; nR = 0; return list.sections[size_t(qSec)].patterns[0]; }
        const auto& sec = list.sections[size_t(secI)];
        int s = secI, i = secPos + 1, r = secRep;
        if (i >= sec.count) { i = 0; ++r; if (r >= sec.repeat) { r = 0; if (!loopSec) s = (s + 1) % list.count; } }
        nS = s; nI = i; nR = r;
        return list.sections[size_t(s)].patterns[size_t(i)];
    }
    int nextPattern() {
        if (songActive()) return songNext();
        if (queued >= 0) return queued;
        if (data && data->chainCount) return data->chain[size_t((chainPos + 1) % data->chainCount)];
        return pat;
    }
    void advance() {
        if (++step < len(pat)) return;
        step = 0;
        if (songActive()) { pat = songNext(); secI = nS; secPos = nI; secRep = nR; queued = -1; qSec = -1; return; }
        const bool fromQueue = queued >= 0;
        pat = nextPattern(); queued = -1;
        if (data && data->chainCount) {
            int ci = -1; for (int i = 0; i < data->chainCount; ++i) if (data->chain[size_t(i)] == pat) { ci = i; break; }
            chainPos = fromQueue ? (ci >= 0 ? ci : chainPos) : (chainPos + 1) % data->chainCount;
        }
    }
    const Step* upcoming() {
        if (!data) return nullptr;
        if (step + 1 < len(pat)) return &data->patterns[size_t(pat)].steps[size_t(step + 1)];
        return &data->patterns[size_t(nextPattern())].steps[0];
    }
    std::int64_t cycleSteps() const {
        if (!data) return STEPS;
        std::int64_t total = 0;
        if (songActive()) {
            for (int s = 0; s < data->song.count; ++s) { const auto& x = data->song.sections[size_t(s)]; std::int64_t one = 0; for (int i = 0; i < x.count; ++i) one += len(x.patterns[size_t(i)]); total += one * x.repeat; }
        } else if (data->chainCount) { for (int i = 0; i < data->chainCount; ++i) total += len(data->chain[size_t(i)]); }
        else total = len(pat);
        return std::max<std::int64_t>(1, total);
    }
    void begin(Engine& e);
    void applyAuto(Engine& e, int p, int stepIndex);
    void fire(Engine& e);
    const SongData* data = nullptr;
    double sr;
};

class Engine {
public:
    double sr, tempo = 124, leadLevel = 1;
    Sequencer* sequence = nullptr; OrbitLayer* layer = nullptr; Mixer* mixer = nullptr;
    std::array<double, paramCount> target {}, value {};
    std::array<double, 4> automation {{-1, -1, -1, -1}};
    int stepVowel = -1;
    explicit Engine(double rate) : sr(rate), fsOS(rate * 2), smooth(onePole(.012, rate)), slideCoef(onePole(.02, rate)), attackCoef(onePole(.0015, rate)), releaseCoef(onePole(.006, rate)),
        vegDecay(t60(4, rate)), accentDecay(t60(.2, rate)), capCharge(onePole(.04, rate)), capDischarge(onePole(.25, rate)), fbHp(1 / (1 + TAU * 90 / (rate * 2))), dcR(1 - TAU * 20 / rate),
        dlLp(onePole(1 / (TAU * 3200), rate)), dlSize(int(std::ceil(rate * 2)) + 1), dlL(size_t(dlSize)), dlR(size_t(dlSize)), glitchFx(rate), kickVoice(rate), drums(rate), formantFx(rate), reverbFx(rate), bassVoice(rate), vowelCoef(onePole(.03, rate)) {
        for (size_t i = 0; i < paramCount; ++i) target[i] = value[i] = paramInfo()[i].value;
        reset();
    }
    double stepLength() const { return sr * 60 / tempo / 4; }
    void onStep(double len) { glitchFx.onStep(len, target[glitch], glitchSlice(target[glitchSize])); }
    void kickHit() { if (target[kick] > 1e-4) kickVoice.trigger(target[kickDecay]); }
    void drumHit(int hatHit, bool clapHit, int snareHit) {
        if (hatHit && target[hat] > 1e-4) drums.hatHit(hatHit == 2);
        if (clapHit && target[clap] > 1e-4) drums.clapHit();
        if (snareHit && target[snare] > 1e-4) drums.snareHit(snareHit == 2 ? .38 : 1);
    }
    void bassOn(int note, bool tied) { if (target[bass] > 1e-4) bassVoice.on(note, tied); else bassVoice.off(); }
    void bassOff() { bassVoice.off(); }
    void setAuto(int lane, double v) {
        automation[size_t(lane)] = v;
        if (lane == 3) value[decay] = v >= 0 ? v : target[decay];
    }
    void stutter(bool on) { glitchFx.hold(on, stepLength(), glitchSlice(target[glitchSize])); }
    void reset() {
        phase = 0; pitch = targetPitch = BASE_NOTE; gate = noteAccent = false;
        fenv = 0; fenvCoef = accentDecay; veg = amp = ampTarget = cap = 0;
        s1 = s2 = s3 = s4 = hpX = hpY = prevIn = distPrev = distLp = 0;
        dw = {{0, 0, 0}}; dw[size_t(jsRound(target[distType] * 2))] = 1;
        dcX = dcY = 0; dlW = 0; dlLpL = dlLpR = 0;
        std::fill(dlL.begin(), dlL.end(), 0.f); std::fill(dlR.begin(), dlR.end(), 0.f);
        glitchFx.reset(); clock = 0; kickVoice.reset();
        if (layer) layer->reset();
        if (mixer) mixer->reset();
        drums.reset(); formantFx.reset(); reverbFx.reset(); bassVoice.reset(); stepVowel = -1;
        automation.fill(-1);
        for (int id : {tuning, cutoff, resonance, envMod, accent, drive, delay, volume, waveform, distortion, distTone, crush, formant, vowel, reverb}) value[size_t(id)] = target[size_t(id)];
    }
    void setParam(int id, double v) { if (id >= 0 && id < paramCount && std::isfinite(v)) target[size_t(id)] = std::min(1.0, std::max(0.0, v)); }
    void noteOn(int note, bool accented, bool slide) {
        targetPitch = note;
        if (!(slide && gate)) { pitch = note; fenv = 1; veg = 1; fenvCoef = accented ? accentDecay : t60(decaySeconds(value[decay]), sr); }
        noteAccent = accented; gate = true;
    }
    void noteOff() { gate = false; }
    void process(float* outL, float* outR, int n);
private:
    double fsOS, smooth, slideCoef, attackCoef, releaseCoef, vegDecay, accentDecay, capCharge, capDischarge, fbHp, dcR, dlLp;
    int dlSize, dlW = 0;
    std::vector<float> dlL, dlR;
    Glitch glitchFx; Kick kickVoice; Drums drums; Formant formantFx; Reverb reverbFx; Bass bassVoice;
    double vowelCoef;
    double phase = 0, pitch = BASE_NOTE, targetPitch = BASE_NOTE, fenv = 0, fenvCoef = 0, veg = 0, amp = 0, ampTarget = 0, cap = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, hpX = 0, hpY = 0, prevIn = 0;
    double distPrev = 0, distLp = 0, dcX = 0, dcY = 0, dlLpL = 0, dlLpR = 0, clock = 0;
    bool gate = false, noteAccent = false;
    std::array<double, 3> dw {};
};

inline void Engine::process(float* outL, float* outR, int n) {
    auto& v = value; const auto& t = target; const auto& a = automation; const double k = smooth;
    auto* seq = sequence; auto* m = mixer;
    const int dlLen = std::min(dlSize - 1, std::max(1, int(jsRound(sr * 60 / tempo * .75))));
    v[decay] = a[3] >= 0 ? a[3] : t[decay];
    const int dType = int(jsRound(t[distType] * 2));
    for (int i = 0; i < n; ++i) {
        if (seq && seq->running) seq->tick(*this);
        else if (t[glitch] > 0 && --clock <= 0) { const double L = stepLength(); clock += L; onStep(L); }
        v[tuning] += (t[tuning] - v[tuning]) * k; v[cutoff] += ((a[0] >= 0 ? a[0] : t[cutoff]) - v[cutoff]) * k; v[resonance] += ((a[1] >= 0 ? a[1] : t[resonance]) - v[resonance]) * k;
        v[formant] += (t[formant] - v[formant]) * k; v[reverb] += (t[reverb] - v[reverb]) * k; v[vowel] += ((stepVowel >= 0 ? stepVowel / 4.0 : t[vowel]) - v[vowel]) * vowelCoef;
        v[envMod] += ((a[2] >= 0 ? a[2] : t[envMod]) - v[envMod]) * k; v[accent] += (t[accent] - v[accent]) * k; v[drive] += (t[drive] - v[drive]) * k;
        v[delay] += (t[delay] - v[delay]) * k; v[volume] += (t[volume] - v[volume]) * k; v[waveform] += ((t[waveform] < .5 ? 0.0 : 1.0) - v[waveform]) * k;
        v[distortion] += (t[distortion] - v[distortion]) * k; v[distTone] += (t[distTone] - v[distTone]) * k;
        dw[0] += ((dType == 0 ? 1.0 : 0.0) - dw[0]) * k; dw[1] += ((dType == 1 ? 1.0 : 0.0) - dw[1]) * k; dw[2] += ((dType == 2 ? 1.0 : 0.0) - dw[2]) * k;
        pitch += (targetPitch - pitch) * slideCoef;
        const double hz = 440 * std::pow(2.0, (pitch + (v[tuning] - .5) * 24 - 69) / 12), dt = std::min(.45, hz / sr);
        phase += dt; if (phase >= 1) phase -= 1;
        const double p = phase, saw = 2 * p - 1 - blep(p, dt), p2 = p + .5 >= 1 ? p - .5 : p + .5;
        const double sq = (p < .5 ? 1 : -1) + blep(p, dt) - blep(p2, dt), osc = saw + (sq * .6 - saw) * v[waveform];
        fenv *= fenvCoef;
        if (noteAccent && gate) cap += (fenv - cap) * capCharge; else cap -= cap * capDischarge;
        veg *= vegDecay;
        ampTarget = gate ? veg * (noteAccent ? 1 + v[accent] * .9 : 1) : 0;
        amp += (ampTarget - amp) * (ampTarget > amp ? attackCoef : releaseCoef);
        const double mod = v[envMod] * (fenv * 4.6 - 1.1) + cap * v[accent] * (1.2 + v[envMod] * 2.4);
        double fc = cutoffHz(v[cutoff]) * std::pow(2.0, mod);
        if (fc > 16000) fc = 16000; if (fc > fsOS * .42) fc = fsOS * .42; if (fc < 20) fc = 20;
        const double wc = TAU * fc / fsOS, g = wc / (1 + wc), kRes = v[resonance] * 4.15, x = osc * .55;
        double y = 0;
        for (int o = 0; o < 2; ++o) {
            const double xi = o == 0 ? (prevIn + x) * .5 : x;
            hpY = fbHp * (hpY + s4 - hpX); hpX = s4;
            const double u = sat(xi - kRes * hpY);
            s1 += g * (u - s1); s2 += g * (s1 - s2); s3 += g * (s2 - s3); s4 += g * (s3 - s4);
            y += s4;
        }
        prevIn = x;
        y *= .5 * amp;
        const double dg = 1 + v[drive] * 11;
        y = sat(y * 1.6 * dg) / (1 + v[drive] * 1.8) * .75;
        y = formantFx.process(y, v[vowel] * 4, v[formant]);
        const double da = v[distortion], dry = y;
        if (da > 1e-5) {
            const double pg = 1 + da * da * 60;
            const double d = (shape((distPrev + y) * .5 * pg, dw[0], dw[1], dw[2]) + shape(y * pg, dw[0], dw[1], dw[2])) * .5;
            distLp += (d - distLp) * (1 - std::exp(-TAU * distToneHz(v[distTone]) / sr));
            const double wetAmount = da * 6 < 1 ? da * 6 : 1;
            y += (distLp * .42 / (1 + da * .5) - y) * wetAmount;
        } else distLp = 0;
        distPrev = dry;
        const double dc = y - dcX + dcR * dcY; dcX = y; dcY = dc; y = dc;
        y = glitchFx.process(y, v[crush]);
        int r = dlW - dlLen; if (r < 0) r += dlSize;
        const double dl = dlL[size_t(r)], dr = dlR[size_t(r)];
        dlLpL += (dl - dlLpL) * dlLp; dlLpR += (dr - dlLpR) * dlLp;
        dlL[size_t(dlW)] = float((m ? m->delayIn : y) + dlLpR * .45); dlR[size_t(dlW)] = float(dlLpL * .45);
        if (++dlW >= dlSize) dlW = 0;
        const double mix = v[delay] * .7, vol = v[volume] * v[volume] * 1.3;
        const double kk = kickVoice.process(t[kickTune]) * t[kick] * 1.15, duckGain = kickVoice.duckGain(t[duck]);
        drums.process();
        const double hh = drums.hatOut * t[hat] * .5, cl = drums.clapOut * t[clap] * .7 + drums.snareOut * t[snare] * .6;
        const double ll = leadLevel; double xl = 0, xr = 0, xs = 0;
        if (layer) { layer->process(); xl = layer->l; xr = layer->r; xs = (xl + xr) * .5 * layer->send; }
        const double send = v[reverb] * 8 < 1 ? v[reverb] * 8 : 1;
        reverbFx.process(m ? m->reverbIn : (y * ll + cl * .8 + xs) * send, t[reverbSize]);
        const double wet = v[reverb] * .9, bs = bassVoice.process(t[bassTone], t[bassDecay]) * t[bass] * .8;
        if (m) {
            m->process(y * ll, xl, xr, bs, kk, drums.snareOut * t[snare] * .6, hh, drums.clapOut * t[clap] * .7);
            outL[i] = float(.95 * sat(((m->duckL + dl * .7 * m->retD + reverbFx.l * .9 * m->retV) * duckGain + m->dryL) * vol));
            outR[i] = float(.95 * sat(((m->duckR + dr * .7 * m->retD + reverbFx.r * .9 * m->retV) * duckGain + m->dryR) * vol));
            continue;
        }
        outL[i] = float(.95 * sat(((y * ll + bs + dl * ll * mix + reverbFx.l * wet + xl) * duckGain + kk + hh + cl) * vol));
        outR[i] = float(.95 * sat(((y * ll + bs + dr * ll * mix + reverbFx.r * wet + xr) * duckGain + kk + hh + cl) * vol));
    }
}

inline void Sequencer::hold(int lane, bool on, Engine& e) { held[size_t(lane)] = on; if (on) e.setAuto(lane, -1); }
inline void Sequencer::begin(Engine& e) {
    running = true; step = 0; count = 0; pos = 0; prevGate = false; prevSlide = false; queued = -1; bassOffAt = inf(); prevBassTie = false;
    if (songActive()) { secI = qSec >= 0 && qSec < data->song.count ? qSec : 0; qSec = -1; secPos = 0; secRep = 0; pat = data->song.sections[size_t(secI)].patterns[0]; }
    else if (data && data->chainCount) { chainPos = 0; pat = data->chain[0]; }
    if (e.layer) e.layer->restart();
}
inline void Sequencer::seek(Engine& e, std::int64_t steps, double fraction) {
    begin(e);
    const auto target = std::max<std::int64_t>(0, steps), offset = target % cycleSteps();
    for (std::int64_t i = 0; i < offset; ++i) advance();
    count = target;
    fire(e);
    pos = std::min(.999, std::max(0.0, fraction)) * curLen;
}
inline void Sequencer::stop(Engine& e) {
    if (e.layer) e.layer->stop();
    if (running) { e.noteOff(); e.bassOff(); }
    bassOffAt = inf();
    for (int i = 0; i < 4; ++i) e.setAuto(i, -1);
    e.stepVowel = -1; running = false; offAt = inf(); lastFired = -1; changed = true;
}
inline void Sequencer::tick(Engine& e) {
    if (!running) return;
    pos += 1;
    if (pos >= offAt) { e.noteOff(); offAt = inf(); }
    if (pos >= bassOffAt) { e.bassOff(); bassOffAt = inf(); }
    if (pos >= curLen) { pos -= curLen; advance(); fire(e); }
}
inline void Sequencer::applyAuto(Engine& e, int p, int stepIndex) {
    const auto& pattern = data->patterns[size_t(p)];
    for (size_t i = 0; i < 4; ++i) {
        const double v = held[i] ? std::numeric_limits<double>::quiet_NaN() : pattern.lanes[i][size_t(stepIndex)];
        e.setAuto(int(i), std::isfinite(v) ? v : -1);
    }
}
inline void Sequencer::fire(Engine& e) {
    if (!data) return;
    const auto& p = data->patterns[size_t(pat)]; const auto* s = &p.steps[size_t(step)];
    const bool* m = songActive() ? data->song.sections[size_t(secI)].mute.data() : nullptr;
    const bool leadOn = s->gate && !(m && m[partLead]);
    curLen = stepLen * 2 * (count % 2 == 0 ? swing : 1 - swing);
    e.onStep(curLen);
    const int at = int(count % 16);
    int fi = fillIndex(count / 16, e.target[fill], at);
    if (fi >= 0 && !hasDrums(p)) fi = -1;
    const Fill* F = fi >= 0 ? &fills()[size_t(fi)] : nullptr;
    const bool kickNow = F ? F->k[size_t(at)] == 1 : p.hasKicks ? p.kicks[size_t(step)] : count % 4 == 0;
    if (kickNow && !(m && m[partKick])) e.kickHit();
    if (e.layer) e.layer->step(count, s, m && m[partLead] && m[partBass]);
    ++count;
    applyAuto(e, pat, step);
    const int hatNow = F ? F->h[size_t(at)] : s->hat; const bool clapNow = F ? false : s->clap; const int snareNow = F ? F->s[size_t(at)] : s->snare;
    e.drumHit(m && m[partHat] ? 0 : hatNow, m && m[partClap] ? false : clapNow, m && m[partSnare] ? 0 : snareNow);
    if (s->bass >= 0 && !(m && m[partBass])) {
        e.bassOn(BASE_NOTE + s->bassOct * 12 + s->bass + transpose, prevBassTie);
        const auto* nb = upcoming();
        bassOffAt = s->bassTie && nb && nb->bass >= 0 ? inf() : curLen * .85;
        prevBassTie = s->bassTie;
    } else { e.bassOff(); bassOffAt = inf(); prevBassTie = false; }
    if (leadOn) {
        e.stepVowel = s->vowel;
        e.noteOn(BASE_NOTE + s->octave * 12 + s->note + transpose, s->accent, prevGate && prevSlide);
        const auto* next = upcoming();
        static constexpr double gates[] = {.5, .22, .92};
        offAt = s->slide && next && next->gate ? inf() : curLen * gates[s->gateLen];
    } else { e.noteOff(); offAt = inf(); }
    prevGate = leadOn; prevSlide = s->slide;
    lastFired = step; lastPat = pat; changed = true;
}

} // namespace acido

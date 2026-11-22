// Beats, Orbit phrases and voice, and the Studio mixer. Ports of apps/acido/beats.js, apps/orbit/flow.js and apps/studio.
#pragma once
#include "Voices.h"
#include <string_view>

namespace acido {

struct Fill { int from; std::array<uint8_t, STEPS> s{}, k{}, h{}; };
inline Fill makeFill(int from, std::string_view s, std::string_view k, std::string_view h) {
    Fill out; out.from = from;
    for (size_t i = 0; i < s.size(); ++i) {
        const size_t at = size_t(from) + i;
        out.s[at] = s[i] == '1' ? 1 : s[i] == '2' ? 2 : 0; out.k[at] = k[i] == 'x' ? 1 : 0; out.h[at] = h[i] == 'c' ? 1 : h[i] == 'o' ? 2 : 0;
    }
    return out;
}
inline constexpr int SHORT_FILLS = 4, LONG_FILLS = 5;
inline const std::array<Fill, 9> fills = {
    makeFill(12,"1111","....","...o"),makeFill(12,"2.11","x...","..c."),makeFill(12,".211","x...","c..."),makeFill(12,"1.11","..x.",".c.."),
    makeFill(8,"22221111","x.......",".......o"),makeFill(8,"1.21.211","..x..x..",".c..c..o"),makeFill(8,".2.21212","x..x....","c.c.c..."),makeFill(8,"1..1..11",".x..x...","c.c.c.co"),makeFill(8,"2121.111","....x...","....c..o")};
inline int fillIndex(int bar, double amount, int pos) {
    if (!(amount > .001)) return -1;
    const int n = bar + 1; bool isLong;
    if (n % 8 == 0) isLong = true;
    else if (n % 4 == 0 && amount >= .25) isLong = amount >= .6;
    else if (n % 2 == 0 && amount >= .75) isLong = false;
    else return -1;
    const uint32_t hash = (uint32_t(n) * 0x9E3779B1u) >> 16;
    const int i = isLong ? SHORT_FILLS + int(hash % LONG_FILLS) : int(hash % SHORT_FILLS);
    return pos >= fills[size_t(i)].from ? i : -1;
}
inline bool hasDrums(const Pattern& p) {
    if (!p.hasKicks) return true;
    for (size_t i = 0; i < STEPS; ++i) { const auto& s = p.steps[i]; if (p.kicks[i] || s.hat || s.clap || s.snare) return true; }
    return false;
}

class Random {
public:
    explicit Random(uint32_t seed) : a(seed) {}
    double operator()() { a += 0x6D2B79F5u; uint32_t t = a; t = (t ^ t >> 15) * (t | 1u); t ^= t + (t ^ t >> 7) * (t | 61u); return double(t ^ t >> 14) / 4294967296.0; }
private:
    uint32_t a;
};

inline constexpr int BEAT_STYLES = 5;
inline constexpr const char* beatStyleNames[BEAT_STYLES] = {"Techno", "Rave", "Breakbeat", "Jungle", "Electro"};
struct Lines { std::array<std::string_view, 3> items; int count; };
struct BeatStyle { Lines kick, snare, clap, hat; };
inline constexpr BeatStyle beatStyles[BEAT_STYLES] = {
    {{{"x...x...x...x...","x...x...x...x.x.","x...x...x..xx..."},3},{{"....2.......1..2",".......2....1...","..2.....2...1..."},3},{{"....x.......x..."},1},{{"..o...o...o...o.","c.o.c.o.c.o.c.oc","ccoccocccco.ccoc"},3}},
    {{{"x..x..x...x.x...","x..x..x..x..x...","x.x...x..x..x..."},3},{{"....1..2....1..2","....1.......1.11","....1..2.2..1..."},3},{{"....x.......x...","............x..."},2},{{"..o...o...o...o.","c.occ.o.c.occ.oc"},2}},
    {{{"x.x.......x..x..","x.....x...x.....","x..x......xx...."},3},{{"....1..2.2..1...","....1.....2.1..2","....1..2....1.2."},3},{{"................","............x..."},2},{{"c.c.c.c.c.c.c.co","c.c.o.c.c.c.o.c.","ccc.ccc.ccc.ccco"},3}},
    {{{"x.........x.....","x.x.......x.....","x.....x...x..x.."},3},{{"....1..2.2..1.2.","....1.2..2..1..2","..2.1..2.2.21..."},3},{{"................"},1},{{"ccccccccccccccco","c.ccc.ccc.ccc.co","cc.ccc.ccc.ccc.c"},3}},
    {{{"x..x..x...x..x..","x.....x.x.....x.","x..x....x.x....."},3},{{"....1.......1...","....1.......1..2","....1..2....1..."},3},{{"....x.......x...","................"},2},{{"c.c.c.c.c.c.c.c.","ccc.ccc.ccc.ccc."},2}}};

// Writes a generated groove into a pattern. The same seed gives the same groove as the web app.
inline void applyBeat(Pattern& p, int style, uint32_t seed, int variation) {
    const auto& def = beatStyles[std::clamp(style, 0, BEAT_STYLES - 1)];
    Random base(seed);
    auto pick = [&](const Lines& l) { return l.items[size_t(std::floor(base() * l.count))]; };
    const auto kickLine = pick(def.kick), snareLine = pick(def.snare), clapLine = pick(def.clap), hatLine = pick(def.hat);
    Random r(seed + uint32_t(variation + 1) * 7919u);
    std::array<bool, STEPS> kicks{}, claps{}; std::array<int, STEPS> snares{}, hats{};
    for (size_t i = 0; i < STEPS; ++i) {
        kicks[i] = kickLine[i] == 'x'; claps[i] = clapLine[i] == 'x';
        snares[i] = snareLine[i] == '1' ? 1 : snareLine[i] == '2' ? 2 : 0; hats[i] = hatLine[i] == 'c' ? 1 : hatLine[i] == 'o' ? 2 : 0;
    }
    if (variation > 0) {
        static constexpr size_t ghost[3] = {3, 9, 13};
        const size_t g = ghost[variation % 3]; snares[g] = snares[g] == 0 ? 2 : 0;
        for (size_t i : {6, 7, 10, 11, 14, 15}) {
            if (r() < .22 && !kicks[i] && i % 4 != 0) kicks[i] = true;
            if (r() < .3 && !snares[i]) snares[i] = 2;
            if (r() < .25) hats[i] = hats[i] == 2 ? 1 : hats[i] == 0 ? 1 : 0;
        }
    }
    kicks[0] = true;
    p.hasKicks = true; p.kicks = kicks;
    for (size_t i = 0; i < STEPS; ++i) { p.steps[i].hat = int8_t(hats[i]); p.steps[i].clap = claps[i]; p.steps[i].snare = int8_t(snares[i]); }
}

inline constexpr int TIMELINE_MAX = 8 * 16 * 2 + 8;
struct Timeline { int size = 0; std::array<int8_t, TIMELINE_MAX> deg{}; std::array<uint8_t, TIMELINE_MAX> beats{}; };

// One Orbit phrase with the same random calls, in the same order, as apps/orbit/flow.js.
inline Timeline buildTimeline(std::array<int, 8> current, double amount, uint32_t seed) {
    Random random(seed); Timeline out;
    const double strength = std::max(0.0, std::min(1.0, amount));
    const bool evolving = strength > 0;
    auto push = [&](int d, int b) { out.deg[size_t(out.size)] = int8_t(d); out.beats[size_t(out.size)] = uint8_t(b); ++out.size; };
    for (int phrase = 0; phrase < 8; ++phrase) {
        static constexpr int lengths[3] = {8, 12, 16};
        const int length = evolving ? lengths[int(std::floor(random() * 3))] : 8;
        auto next = current;
        if (evolving) {
            std::array<int, 8> candidates{0, 1, 2, 3, 4, 5, 6, 7}; int left = 8;
            const int count = std::max(1, int(std::ceil(strength * 3)));
            for (int j = 0; j < count && left > 0; ++j) {
                const int at = int(std::floor(random() * left)), i = candidates[size_t(at)];
                for (int c = at; c < left - 1; ++c) candidates[size_t(c)] = candidates[size_t(c + 1)];
                --left;
                const int sign = random() < .5 ? -1 : 1;
                const int delta = sign * (1 + int(std::floor(random() * std::ceil(strength * 3))));
                next[size_t(i)] = std::max(0, std::min(7, next[size_t(i)] + delta));
                if (next[size_t(i)] == current[size_t(i)]) next[size_t(i)] = current[size_t(i)] == 7 ? 6 : current[size_t(i)] + 1;
            }
        }
        std::array<int, 16> index{}; std::array<bool, 16> rest{}; std::array<int, 16> beats{};
        for (int j = 0; j < length; ++j) {
            index[size_t(j)] = j < 8 || !evolving ? j % 8 : int(std::floor(random() * 8));
            const bool movable = evolving;
            rest[size_t(j)] = movable && j > 0 && random() < strength * .28;
            beats[size_t(j)] = movable && random() < strength * .35 ? 2 : 1;
        }
        current = next;
        for (int j = 0; j < length; ++j) {
            push(rest[size_t(j)] ? -1 : current[size_t(index[size_t(j)])], beats[size_t(j)]);
            for (int b = 1; b < beats[size_t(j)]; ++b) push(-1, 1);
        }
        while (out.size % 8) push(-1, 1);
    }
    return out;
}

inline constexpr int ORBIT_SOUNDS = 8;
inline constexpr const char* orbitSoundNames[ORBIT_SOUNDS] = {"Glass", "Rubber", "Mist", "Soft Keys", "Bell", "Organ", "Velvet", "Prism"};

class OrbitLayer {
public:
    double level = .7, l = 0, r = 0; int transpose = 0, octave = 0;
    explicit OrbitLayer(double rate) : sr(rate) { (void)tables(); fast = std::exp(-6.9 / (.012 * sr)); setTone(.6); }
    void setTone(double v) { const double fc = std::min(sr * .45, 300 + v * v * 12000); lp = 1 - std::exp(-TAU * fc / sr); }
    void setSound(int i) { sound = std::clamp(i, 0, ORBIT_SOUNDS - 1); }
    void setScale(const int* scale, int count) {
        const int n = std::min(12, count); nPcs = n;
        for (int i = 0; i < n; ++i) pcs[size_t(i)] = scale[i];
        int last = 60 + scale[0]; if (last > 66) last -= 12; pitches[0] = last;
        for (int d = 1; d < 8; ++d) { const int pc = scale[d % n], up = ((pc - last % 12) % 12 + 12) % 12; last += up ? up : 12; pitches[size_t(d)] = last; }
    }
    void setPhrase(const Timeline* t) { phrase = t; }
    void restart() { root = -1; }
    void stop() { for (size_t i = 0; i < VOICES; ++i) if (on[i]) { rising[i] = 0; fall[i] = fast; } }
    void reset() { on.fill(0); env.fill(0); lpL = lpR = l = r = 0; root = -1; }
    void step(int count, const Step* s, bool muted) {
        if (s && s->bass >= 0) root = ((36 + s->bassOct * 12 + s->bass + transpose) % 12 + 12) % 12;
        if (count % 2 || !phrase || !phrase->size) return;
        const int pulse = (count / 2) % phrase->size, d = phrase->deg[size_t(pulse)];
        if (d < 0 || muted) return;
        const int base = pitches[size_t(d)]; const bool strong = pulse % 4 == 0;
        noteOn((strong ? chordTone(base) : base) + octave * 12, strong ? .23 : .12, phrase->beats[size_t(pulse)] > 1 ? 1.4 : 1);
    }
    void process() {
        double a = 0, b = 0; const auto& tab = tables()[size_t(sound)];
        for (size_t i = 0; i < VOICES; ++i) {
            if (!on[i]) continue;
            double p = phase[i] + inc[i]; if (p >= SIZE) p -= SIZE; phase[i] = p;
            const int k = int(p); const double f = p - k, x = (double(tab[size_t(k)]) + (double(tab[size_t(k + 1)]) - double(tab[size_t(k)])) * f) * env[i];
            if (i % 2) { a += x * .82; b += x * .58; } else { a += x * .58; b += x * .82; }
            if (rising[i]) { env[i] += rise[i]; if (env[i] >= peak[i]) { env[i] = peak[i]; rising[i] = 0; } }
            else { env[i] *= fall[i]; if (env[i] < 1e-5) { env[i] = 0; on[i] = 0; } }
        }
        lpL += (a - lpL) * lp; lpR += (b - lpR) * lp;
        l = lpL * level * 8; r = lpR * level * 8;
    }
private:
    static constexpr size_t VOICES = 8; static constexpr int SIZE = 2048;
    struct Timbre { double h[8]; int n; double attack, decay; };
    static constexpr Timbre timbres[ORBIT_SOUNDS] = {
        {{1},1,.006,.5},{{1,0,-1.0/9,0,1.0/25},5,.006,.19},{{1,.5,.33,.25,.2,.17,.14,.12},8,.08,.75},{{.75,.25},2,.006,.5},
        {{1,.5,0,.3,0,.2},6,.006,1.2},{{.55,.3,.15},3,.015,1},{{.8,0,.2},3,.12,1.4},{{.6,.25,0,.15},4,.006,.7}};
    using Tables = std::array<std::array<float, SIZE + 1>, ORBIT_SOUNDS>;
    static const Tables& tables() {
        static const Tables all = [] {
            Tables out{};
            for (size_t s = 0; s < ORBIT_SOUNDS; ++s) {
                auto& t = out[s]; double peak = 0; const auto& d = timbres[s];
                for (int i = 0; i < SIZE; ++i) { double x = 0; for (int n = 0; n < d.n; ++n) x += d.h[n] * std::sin(TAU * (n + 1) * i / SIZE); t[size_t(i)] = float(x); peak = std::max(peak, std::abs(x)); }
                for (size_t i = 0; i < SIZE; ++i) t[i] = float(double(t[i]) / peak);
                t[SIZE] = t[0];
            }
            return out;
        }();
        return all;
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
        const size_t i = next; next = (i + 1) % VOICES; const auto& d = timbres[size_t(sound)];
        on[i] = 1; rising[i] = 1; phase[i] = 0; inc[i] = 440 * std::pow(2.0, (pitch - 69) / 12.0) / sr * SIZE; peak[i] = gain;
        rise[i] = gain / std::max(1.0, d.attack * sr); fall[i] = std::exp(std::log(1e-4) / (d.decay * hold * sr));
    }
    double sr, lp = 1, lpL = 0, lpR = 0, fast = 0; int sound = 0, nPcs = 0, root = -1; size_t next = 0; const Timeline* phrase = nullptr;
    std::array<uint8_t, VOICES> on{}, rising{}; std::array<double, VOICES> phase{}, inc{}, env{}, peak{}, rise{}, fall{}; std::array<int, 8> pitches{}; std::array<int, 12> pcs{};
};

inline constexpr int CHANNELS = 7;
inline constexpr const char* channelIds[CHANNELS] = {"lead", "orbit", "bass", "kick", "snare", "hat", "clap"};
inline constexpr const char* channelNames[CHANNELS] = {"Acido", "Orbit", "Bass", "Kick", "Snare", "Hi-hat", "Clap"};

class Mixer {
public:
    double delayIn = 0, reverbIn = 0, duckL = 0, duckR = 0, dryL = 0, dryR = 0, retD = 1, retV = 1;
    std::array<float, CHANNELS + 1> peak{};
    explicit Mixer(double sr) { k = 1 - std::exp(-1 / (.005 * sr)); update(); reset(); }
    void setStrip(int i, bool isMuted, bool isSolo, double panValue, double delayValue, double reverbValue) {
        if (i < 0 || i >= CHANNELS) return;
        const size_t c = size_t(i);
        if (mute[c] == isMuted && solo[c] == isSolo && pan[c] == panValue && delay[c] == delayValue && reverb[c] == reverbValue) return;
        mute[c] = isMuted; solo[c] = isSolo; pan[c] = std::clamp(panValue, -1.0, 1.0); delay[c] = std::clamp(delayValue, 0.0, 1.0); reverb[c] = std::clamp(reverbValue, 0.0, 1.0);
        update();
    }
    void setReturns(double d, double r) { returnDelay = std::clamp(d, 0.0, 1.0); returnReverb = std::clamp(r, 0.0, 1.0); }
    void reset() { gL = tL; gR = tR; gD = tD; gV = tV; peak.fill(0); retD = returnDelay; retV = returnReverb; delayIn = reverbIn = duckL = duckR = dryL = dryR = 0; }
    void process(double lead, double orbitL, double orbitR, double bass, double kick, double snare, double hat, double clap) {
        const std::array<double, CHANNELS> a{lead, orbitL, bass, kick, snare, hat, clap}, b{lead, orbitR, bass, kick, snare, hat, clap};
        double dl = 0, dr = 0, ul = 0, ur = 0, del = 0, rev = 0;
        for (size_t i = 0; i < CHANNELS; ++i) {
            gL[i] += (tL[i] - gL[i]) * k; gR[i] += (tR[i] - gR[i]) * k; gD[i] += (tD[i] - gD[i]) * k; gV[i] += (tV[i] - gV[i]) * k;
            const double x = a[i] * gL[i], y = b[i] * gR[i], mono = (a[i] + b[i]) * .5;
            peak[i] = std::max(peak[i], float(std::max(std::abs(x), std::abs(y))));
            del += mono * gD[i]; rev += mono * gV[i];
            if (i < 3) { dl += x; dr += y; } else { ul += x; ur += y; }
        }
        retD += (returnDelay - retD) * k; retV += (returnReverb - retV) * k;
        delayIn = del; reverbIn = rev; duckL = dl; duckR = dr; dryL = ul; dryR = ur;
    }
private:
    void update() {
        bool soloed = false; for (bool s : solo) soloed = soloed || s;
        for (size_t i = 0; i < CHANNELS; ++i) {
            const double on = !mute[i] && (!soloed || solo[i]) ? 1 : 0;
            tL[i] = on * std::min(1.0, 1 - pan[i]); tR[i] = on * std::min(1.0, 1 + pan[i]); tD[i] = on * delay[i]; tV[i] = on * reverb[i];
        }
    }
    double k = 0, returnDelay = 1, returnReverb = 1;
    std::array<bool, CHANNELS> mute{}, solo{}; std::array<double, CHANNELS> pan{}, delay{}, reverb{}, tL{}, tR{}, tD{}, tV{}, gL{}, gR{}, gD{}, gV{};
};

} // namespace acido

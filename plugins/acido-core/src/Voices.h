// Glitch, kick, drums, formant filter, reverb and bass. Line-by-line ports of apps/acido, allocation-free after construction.
#pragma once
#include "Session.h"
#include <vector>

namespace acido {

inline constexpr double TAU = 6.283185307179586, PI = 3.141592653589793;
inline int32_t nextNoise(int32_t x) { return int32_t(uint32_t(x) * 1664525u + 1013904223u); }

class Glitch {
public:
    explicit Glitch(double rate) : sr(rate), size(int(std::ceil(rate * 2.5))), buf(size_t(size)), loop(size_t(std::ceil(rate * .4))) {
        fadeCoef = 1 - std::exp(-1 / (.002 * sr)); declick = std::exp(-1 / (.0015 * sr)); reset();
    }
    void reset() {
        std::fill(buf.begin(), buf.end(), 0.f); std::fill(loop.begin(), loop.end(), 0.f);
        w = 0; mode = none; active = false; mix = 0; remaining = 0; held = false; sliceLen = 1; p = 0; revStart = 0; t = 0; readPos = 0; len = 1;
        crushPhase = 1; crushHeld = 0; rng = 0x5eed; lastWet = 0; offset = 0; jump = false;
    }
    void onStep(double stepLen, double probability, double slice) {
        if (held) return;
        const double r = rand(), kind = rand();
        if (!(probability > 0 && r < probability)) return;
        jump = mode != none;
        remaining = jsRound(stepLen);
        if (kind < .5) startStutter(stepLen, slice);
        else if (kind < .75) { mode = reverse; revStart = w; t = 0; active = true; }
        else { mode = tape; readPos = w - 1 < 0 ? size - 1 : w - 1; len = remaining; active = true; }
    }
    void hold(bool on, double stepLen, double slice) {
        if (on && !held) { held = true; remaining = std::numeric_limits<double>::infinity(); startStutter(stepLen, slice); }
        else if (!on && held) { held = false; active = false; }
    }
    double process(double x, double crush) {
        buf[size_t(w)] = float(x); if (++w >= size) w = 0;
        double y = x;
        if (mode != none) {
            if (active && --remaining <= 0) active = false;
            mix += ((active ? 1 : 0) - mix) * fadeCoef;
            double wet = read(x);
            if (jump) { offset = lastWet - wet; jump = false; }
            wet += offset; offset *= declick; lastWet = wet;
            y = x + (wet - x) * mix;
            if (!active && mix < 1e-4) { mode = none; mix = 0; offset = 0; }
        }
        if (crush > 1e-5) {
            const double bits = 16 - crush * 13, q = std::pow(2.0, bits - 1);
            crushPhase += std::pow(2.0, -crush * 5);
            if (crushPhase >= 1) { crushPhase -= 1; crushHeld = jsRound(y * q) / q; }
            y = crushHeld;
        } else crushPhase = 1;
        return y;
    }
private:
    enum Mode { none, stutter, reverse, tape };
    double rand() {
        rng += 0x6D2B79F5u; uint32_t x = rng;
        x = (x ^ x >> 15) * (x | 1u); x ^= x + (x ^ x >> 7) * (x | 61u);
        return double(x ^ x >> 14) / 4294967296.0;
    }
    void startStutter(double stepLen, double slice) {
        const int L = int(std::min(double(loop.size()), std::max(16.0, jsRound(stepLen * slice))));
        int s = w - L; if (s < 0) s += size;
        for (int i = 0; i < L; ++i) { loop[size_t(i)] = buf[size_t(s)]; if (++s >= size) s = 0; }
        mode = stutter; sliceLen = L; p = 0; active = true;
    }
    double read(double x) {
        if (mode == stutter) {
            const int L = sliceLen, F = std::min(64, L >> 2), at = p;
            const double g = std::min({1.0, double(at) / F, double(L - at) / F});
            if (++p >= L) p = 0;
            return loop[size_t(at)] * g;
        }
        if (mode == reverse) {
            int64_t i = int64_t(revStart) - 1 - t; i %= size; if (i < 0) i += size;
            ++t; return buf[size_t(i)];
        }
        if (mode == tape) {
            const double rate = active ? remaining / len : 0;
            double r = readPos; const int i0 = int(std::floor(r)), i1 = i0 + 1 >= size ? 0 : i0 + 1; const double f = r - i0;
            const double y = double(buf[size_t(i0)]) + (double(buf[size_t(i1)]) - double(buf[size_t(i0)])) * f;
            r += rate; if (r >= size) r -= size; readPos = r;
            return y;
        }
        return x;
    }
    double sr, fadeCoef = 0, declick = 0, mix = 0, remaining = 0, readPos = 0, len = 1, crushPhase = 1, crushHeld = 0, lastWet = 0, offset = 0;
    int size, w = 0, sliceLen = 1, p = 0, revStart = 0; int64_t t = 0; Mode mode = none; bool active = false, held = false, jump = false; uint32_t rng = 0x5eed;
    std::vector<float> buf, loop;
};

class Kick {
public:
    explicit Kick(double rate) : sr(rate) {
        pitchCoef = std::exp(-1 / (.028 * sr)); clickCoef = std::exp(-1 / (.004 * sr));
        duckAttack = 1 - std::exp(-1 / (.002 * sr)); duckRelease = 1 - std::exp(-1 / (.09 * sr)); reset();
    }
    void reset() { phase = amp = pitch = click = clickPhase = duck = ampCoef = 0; noise = 0x1234; }
    void trigger(double decay) { phase = 0; amp = 1; pitch = 1; click = 1; clickPhase = 0; ampCoef = std::exp(-6.9 / ((.15 + decay * .65) * sr)); }
    double process(double tune) {
        if (amp < 1e-5 && click < 1e-5) { duck += (0 - duck) * duckRelease; return 0; }
        const double base = 40 + tune * 30, f = base * (1 + 3.2 * pitch);
        phase += f / sr; if (phase >= 1) phase -= 1;
        const double body = std::sin(TAU * phase) * amp;
        noise = nextNoise(noise);
        clickPhase += 1800 / sr; if (clickPhase >= 1) clickPhase -= 1;
        const double hit = (noise / 2147483648.0 * .5 + std::sin(TAU * clickPhase) * .5) * click * .35;
        pitch *= pitchCoef; amp *= ampCoef; click *= clickCoef;
        duck += (amp - duck) * (amp > duck ? duckAttack : duckRelease);
        return sat((body + hit) * 1.5);
    }
    double duckGain(double amount) const { return 1 - amount * .85 * (duck > 1 ? 1 : duck); }
private:
    double sr, pitchCoef, clickCoef, duckAttack, duckRelease, phase = 0, amp = 0, pitch = 0, click = 0, clickPhase = 0, duck = 0, ampCoef = 0;
    int32_t noise = 0x1234;
};

class Drums {
public:
    double hatOut = 0, clapOut = 0, snareOut = 0;
    explicit Drums(double rate) : sr(rate) {
        static constexpr double metal[6] = {205.3, 304.4, 369.6, 522.7, 540, 800};
        for (int i = 0; i < 6; ++i) inc[size_t(i)] = metal[i] * 2.4 / sr;
        hpCoef = 1 - std::exp(-TAU * 7000 / sr);
        closedCoef = std::exp(-6.9 / (.055 * sr)); openCoef = std::exp(-6.9 / (.34 * sr));
        burstCoef = std::exp(-6.9 / (.012 * sr)); tailCoef = std::exp(-6.9 / (.19 * sr));
        b2 = int(jsRound(.011 * sr)); b3 = int(jsRound(.022 * sr)); b4 = int(jsRound(.033 * sr));
        bpG = std::tan(PI * 1300 / sr); bpK = 1 / 1.6; bpA1 = 1 / (1 + bpG * (bpG + bpK)); bpA2 = bpG * bpA1; bpA3 = bpG * bpA2;
        snBodyCoef = std::exp(-6.9 / (.09 * sr)); snNoiseCoef = std::exp(-6.9 / (.17 * sr)); snHp = 1 - std::exp(-TAU * 1800 / sr); snInc1 = 185 / sr; snInc2 = 330 / sr;
        reset();
    }
    void reset() {
        ph.fill(0); hatEnv = 0; hatCoef = closedCoef; lp1 = lp2 = 0; burst = 0; tail = 0; clapT = -1; ic1 = ic2 = 0; noise = 0x51ed; hatOut = clapOut = 0;
        snEnv = 0; snBody = 0; snPh1 = 0; snPh2 = 0; snLp = 0; snLevel = 1; snareOut = 0;
    }
    void hat(bool open) { hatEnv = 1; hatCoef = open ? openCoef : closedCoef; }
    void clap() { clapT = 0; burst = 1; tail = 0; }
    void snare(double level) { snEnv = 1; snBody = 1; snLevel = level; }
    void process() {
        hatOut = clapOut = snareOut = 0;
        if (hatEnv < 1e-5 && clapT < 0 && burst < 1e-5 && tail < 1e-5 && snEnv < 1e-5) return;
        noise = nextNoise(noise);
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
    double sr, hpCoef, closedCoef, openCoef, burstCoef, tailCoef, bpG, bpK, bpA1, bpA2, bpA3, snBodyCoef, snNoiseCoef, snHp, snInc1, snInc2;
    double hatEnv = 0, hatCoef = 0, lp1 = 0, lp2 = 0, burst = 0, tail = 0, ic1 = 0, ic2 = 0, snEnv = 0, snBody = 0, snPh1 = 0, snPh2 = 0, snLp = 0, snLevel = 1;
    std::array<double, 6> inc{}, ph{}; int b2 = 0, b3 = 0, b4 = 0, clapT = -1; int32_t noise = 0x51ed;
};

class Formant {
public:
    explicit Formant(double rate) : sr(rate) { for (size_t b = 0; b < 3; ++b) k[b] = 1 / Qs[b]; reset(); }
    void reset() { ic1.fill(0); ic2.fill(0); count = 0; }
    double process(double x, double pos, double mix) {
        if (mix <= 1e-5) { if (count != 0) reset(); return x; }
        if (--count <= 0) { count = 8; update(pos); }
        double out = 0;
        for (size_t b = 0; b < 3; ++b) {
            const double c1 = ic1[b], c2 = ic2[b], v3 = x - c2, v1 = a1[b] * c1 + a2[b] * v3, v2 = c2 + a2[b] * c1 + a3[b] * v3;
            ic1[b] = 2 * v1 - c1; ic2[b] = 2 * v2 - c2;
            out += v1 * k[b] * Gains[b];
        }
        return x + (out * 2.6 - x) * mix;
    }
private:
    static constexpr double Vowels[5][3] = {{730,1090,2440},{530,1840,2480},{270,2290,3010},{570,840,2410},{300,870,2240}};
    static constexpr double Gains[3] = {1, .62, .3}, Qs[3] = {8, 11, 13};
    void update(double pos) {
        const int i = std::min(4, std::max(0, int(std::floor(pos)))), j = std::min(4, i + 1);
        const double f = std::min(1.0, std::max(0.0, pos - i));
        for (size_t b = 0; b < 3; ++b) {
            const double hz = std::min(sr * .45, Vowels[i][b] * std::pow(Vowels[j][b] / Vowels[i][b], f));
            const double g = std::tan(PI * hz / sr), x = 1 / (1 + g * (g + k[b]));
            a1[b] = x; a2[b] = g * x; a3[b] = g * g * x;
        }
    }
    double sr; int count = 0; std::array<double, 3> ic1{}, ic2{}, a1{}, a2{}, a3{}, k{};
};

class Reverb {
public:
    double l = 0, r = 0;
    explicit Reverb(double sr) {
        static constexpr double times[4] = {.0297, .0371, .0411, .0437};
        for (size_t i = 0; i < 4; ++i) { len[i] = int(jsRound(times[i] * sr * 1.6)); buf[i].assign(size_t(len[i]), 0.f); }
        damp = 1 - std::exp(-TAU * 5200 / sr); reset();
    }
    void reset() { for (auto& b : buf) std::fill(b.begin(), b.end(), 0.f); pos.fill(0); lp.fill(0); l = r = 0; }
    void process(double x, double size) {
        const double fb = .72 + size * .23;
        const double a0 = buf[0][size_t(pos[0])], a1 = buf[1][size_t(pos[1])], a2 = buf[2][size_t(pos[2])], a3 = buf[3][size_t(pos[3])];
        l = (a0 + a2) * .5; r = (a1 + a3) * .5;
        const double m = (a0 + a1 + a2 + a3) * .5;
        for (size_t i = 0; i < 4; ++i) {
            const double raw = (i == 0 ? a0 : i == 1 ? a1 : i == 2 ? a2 : a3) - m;
            lp[i] += (raw - lp[i]) * damp;
            if (std::abs(lp[i]) < 1e-15) lp[i] = 0;
            buf[i][size_t(pos[i])] = float(lp[i] * fb + (i % 2 ? -x : x) * .35);
            if (++pos[i] >= len[i]) pos[i] = 0;
        }
    }
private:
    std::array<std::vector<float>, 4> buf; std::array<int, 4> len{}, pos{}; std::array<double, 4> lp{}; double damp = 0;
};

class Bass {
public:
    explicit Bass(double rate) : sr(rate) {
        attack = 1 - std::exp(-1 / (.002 * sr)); release = 1 - std::exp(-1 / (.012 * sr));
        glide = 1 - std::exp(-1 / (.025 * sr)); filterEnvCoef = std::exp(-6.9 / (.22 * sr)); reset();
    }
    void reset() { phase = 0; pitch = 36; target = 36; gate = false; amp = 0; body = 0; fenv = 0; ic1 = ic2 = 0; count = 0; a1 = 1; a2 = 0; a3 = 0; }
    void on(int note, bool tied) { target = note; if (!(tied && gate)) { pitch = note; body = 1; fenv = 1; } gate = true; }
    void off() { gate = false; }
    double process(double tone, double decay) {
        if (!gate && amp < 1e-5) { if (amp != 0) { amp = 0; ic1 = ic2 = 0; } return 0; }
        pitch += (target - pitch) * glide;
        const double hz = 440 * std::pow(2.0, (pitch - 69) / 12), dt = std::min(.45, hz / sr);
        phase += dt; if (phase >= 1) phase -= 1;
        const double x = (2 * phase - 1 - blep(phase, dt)) * .5 + std::sin(TAU * phase) * .6;
        if (--count <= 0) {
            count = 8;
            const double fc = std::min(sr * .42, 80 * std::pow(2.0, tone * 5 + fenv * 1.6)), g = std::tan(PI * fc / sr), k = 1.1;
            a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
            body *= std::exp(-6.9 * 8 / ((.15 + decay * 1.85) * sr));
            fenv *= std::pow(filterEnvCoef, 8);
        }
        const double v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        const double level = gate ? .35 + .65 * body : 0;
        amp += (level - amp) * (level > amp ? attack : release);
        return sat(v2 * 1.3) * amp;
    }
private:
    double sr, attack, release, glide, filterEnvCoef, phase = 0, pitch = 36, target = 36, amp = 0, body = 0, fenv = 0, ic1 = 0, ic2 = 0, a1 = 1, a2 = 0, a3 = 0;
    int count = 0; bool gate = false;
};

} // namespace acido

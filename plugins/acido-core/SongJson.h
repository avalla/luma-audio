// Reads and writes songs as JSON. All values are clamped because saved sessions are untrusted input.
#pragma once
#include "AcidoCore.h"
#include <juce_core/juce_core.h>

namespace acido {

inline int intIn(const juce::var& v, int lo, int hi, int fallback) {
    if (!(v.isInt() || v.isInt64() || v.isDouble() || v.isBool())) return fallback;
    const double x = double(v);
    return std::isfinite(x) ? std::clamp(int(std::clamp(x, -1e6, 1e6)), lo, hi) : fallback;
}
inline double unitValue(const juce::var& v, double fallback) {
    if (!(v.isInt() || v.isInt64() || v.isDouble())) return fallback;
    const double x = double(v);
    return std::isfinite(x) ? std::clamp(x, 0.0, 1.0) : fallback;
}
inline const std::array<const char*, 4>& laneIds() { static const std::array<const char*, 4> ids {{"cutoff", "resonance", "envMod", "decay"}}; return ids; }

inline void readPattern(const juce::var& v, Pattern& p) {
    p.length = intIn(v["length"], 1, STEPS, STEPS);
    if (const auto* steps = v["steps"].getArray()) {
        for (int i = 0; i < std::min(STEPS, steps->size()); ++i) {
            const auto& a = steps->getReference(i); auto& s = p.steps[size_t(i)];
            s.note = intIn(a[0], 0, 12, 0); s.gate = intIn(a[1], 0, 1, 0); s.accent = intIn(a[2], 0, 1, 0); s.slide = intIn(a[3], 0, 1, 0);
            s.octave = intIn(a[4], -1, 1, 0); s.gateLen = intIn(a[5], 0, 2, 0); s.hat = intIn(a[6], 0, 2, 0); s.clap = intIn(a[7], 0, 1, 0);
            s.vowel = intIn(a[8], -1, 4, -1); s.bass = intIn(a[9], -1, 12, -1); s.bassOct = intIn(a[10], -1, 1, 0); s.bassTie = s.bass >= 0 && intIn(a[11], 0, 1, 0); s.snare = intIn(a[12], 0, 2, 0);
        }
    }
    if (const auto* kicks = v["kicks"].getArray()) { p.hasKicks = true; for (int i = 0; i < std::min(STEPS, kicks->size()); ++i) p.kicks[size_t(i)] = intIn(kicks->getReference(i), 0, 1, 0) == 1; }
    const auto lanes = v["auto"];
    for (size_t l = 0; l < 4; ++l)
        if (const auto* lane = lanes[laneIds()[l]].getArray())
            for (int i = 0; i < std::min(STEPS, lane->size()); ++i) p.lanes[l][size_t(i)] = unitValue(lane->getReference(i), std::numeric_limits<double>::quiet_NaN());
}

inline bool readSong(const juce::var& v, SongData& out, std::array<double, paramCount>* params = nullptr) {
    if (!v.isObject() || v["patterns"].getArray() == nullptr) return false;
    out = SongData {};
    const double tempo = v["tempo"].isVoid() ? 124.0 : double(v["tempo"]), swing = v["swing"].isVoid() ? .5 : double(v["swing"]);
    out.tempo = std::isfinite(tempo) ? std::clamp(tempo, 60.0, 200.0) : 124; out.swing = std::isfinite(swing) ? std::clamp(swing, .5, .75) : .5;
    out.current = intIn(v["current"], 0, PATTERNS - 1, 0);
    if (const auto* scale = v["scale"].getArray()) { out.scaleCount = std::clamp(scale->size(), 1, 12); for (int i = 0; i < out.scaleCount; ++i) out.scale[size_t(i)] = intIn(scale->getReference(i), 0, 11, 0); }
    if (const auto* chain = v["chain"].getArray()) { out.chainCount = std::min(MAX_CHAIN, chain->size()); for (int i = 0; i < out.chainCount; ++i) out.chain[size_t(i)] = intIn(chain->getReference(i), 0, PATTERNS - 1, 0); }
    for (const auto& p : *v["patterns"].getArray()) { const int i = intIn(p["i"], -1, PATTERNS - 1, -1); if (i >= 0) readPattern(p, out.patterns[size_t(i)]); }
    const auto song = v["song"];
    if (const auto* sections = song["sections"].getArray()) {
        for (const auto& x : *sections) {
            if (out.song.count >= MAX_SECTIONS) break;
            const auto* list = x["patterns"].getArray(); if (list == nullptr || list->isEmpty()) continue;
            auto& sec = out.song.sections[size_t(out.song.count++)];
            x["name"].toString().substring(0, 24).copyToUTF8(sec.name.data(), sec.name.size());
            sec.count = std::min(MAX_SECTION_PATTERNS, list->size());
            for (int i = 0; i < sec.count; ++i) sec.patterns[size_t(i)] = std::uint8_t(intIn(list->getReference(i), 0, PATTERNS - 1, 0));
            sec.repeat = intIn(x["repeat"], 1, 16, 1);
            if (const auto* mute = x["mute"].getArray()) for (int i = 0; i < std::min(int(partCount), mute->size()); ++i) sec.mute[size_t(i)] = intIn(mute->getReference(i), 0, 1, 0) == 1;
        }
    }
    out.song.on = song["on"].isBool() && bool(song["on"]) && out.song.count > 0;
    if (params != nullptr) {
        const auto values = v["params"];
        for (size_t i = 0; i < paramCount; ++i) (*params)[i] = unitValue(values[paramInfo()[i].id], paramInfo()[i].value);
    }
    return true;
}

inline juce::var writeSong(const SongData& d) {
    auto* root = new juce::DynamicObject(); juce::var result(root);
    root->setProperty("tempo", d.tempo); root->setProperty("swing", d.swing); root->setProperty("current", d.current);
    juce::Array<juce::var> scale, chain, patterns, sections;
    for (int i = 0; i < d.scaleCount; ++i) scale.add(d.scale[size_t(i)]);
    for (int i = 0; i < d.chainCount; ++i) chain.add(d.chain[size_t(i)]);
    root->setProperty("scale", scale); root->setProperty("chain", chain);
    for (int at = 0; at < PATTERNS; ++at) {
        const auto& p = d.patterns[size_t(at)];
        auto* o = new juce::DynamicObject(); juce::var pattern(o); juce::Array<juce::var> steps;
        o->setProperty("i", at); o->setProperty("length", p.length);
        for (const auto& s : p.steps) {
            juce::Array<juce::var> x; for (int value : {s.note, int(s.gate), int(s.accent), int(s.slide), s.octave, s.gateLen, s.hat, int(s.clap), s.vowel, s.bass, s.bassOct, int(s.bassTie), s.snare}) x.add(value);
            steps.add(x);
        }
        o->setProperty("steps", steps);
        if (p.hasKicks) { juce::Array<juce::var> kicks; for (bool k : p.kicks) kicks.add(int(k)); o->setProperty("kicks", kicks); }
        auto* lanes = new juce::DynamicObject(); juce::var laneVar(lanes);
        for (size_t l = 0; l < 4; ++l) { juce::Array<juce::var> lane; bool used = false; for (double x : p.lanes[l]) { if (std::isfinite(x)) { lane.add(x); used = true; } else lane.add(juce::var()); } if (used) lanes->setProperty(laneIds()[l], lane); }
        o->setProperty("auto", laneVar);
        patterns.add(pattern);
    }
    root->setProperty("patterns", patterns);
    auto* song = new juce::DynamicObject(); juce::var songVar(song); song->setProperty("on", d.song.on);
    for (int s = 0; s < d.song.count; ++s) {
        const auto& x = d.song.sections[size_t(s)]; auto* o = new juce::DynamicObject(); juce::var section(o); juce::Array<juce::var> list, mute;
        o->setProperty("name", juce::String::fromUTF8(x.name.data())); o->setProperty("repeat", x.repeat);
        for (int i = 0; i < x.count; ++i) list.add(int(x.patterns[size_t(i)]));
        for (bool part : x.mute) mute.add(int(part));
        o->setProperty("patterns", list); o->setProperty("mute", mute); sections.add(section);
    }
    song->setProperty("sections", sections); root->setProperty("song", songVar);
    return result;
}

} // namespace acido

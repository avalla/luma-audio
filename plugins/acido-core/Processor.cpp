#include "Processor.h"
#include "BinaryData.h"
using namespace juce;

namespace {
const char* const channelIds[] = {"lead", "orbit", "bass", "kick", "snare", "hat", "clap"};
const char* const channelNames[] = {"Acido", "Orbit", "Bass", "Kick", "Snare", "Hi-hat", "Clap"};
const std::array<int, 8> orbitNotes {{0, 4, 2, 6, 4, 7, 2, 3}};

AudioProcessorValueTreeState::ParameterLayout layout() {
    AudioProcessorValueTreeState::ParameterLayout p;
    for (const auto& info : acido::paramInfo())
        p.add(std::make_unique<AudioParameterFloat>(ParameterID {info.id, 1}, info.name, NormalisableRange<float>(0, 1), float(info.value)));
    auto boolean = [&](const char* id, const char* name, bool initial) { p.add(std::make_unique<AudioParameterBool>(ParameterID {id, 1}, name, initial)); };
    auto unit = [&](const String& id, const String& name, float initial) { p.add(std::make_unique<AudioParameterFloat>(ParameterID {id, 1}, name, NormalisableRange<float>(0, 1), initial)); };
    boolean("run", "Play", false); boolean("sync", "DAW Sync", true); boolean("loop", "Loop Section", false); boolean("stutter", "Stutter", false); boolean("sequencer", "Sequencer", true);
    p.add(std::make_unique<AudioParameterFloat>(ParameterID {"bpm", 1}, "Tempo", NormalisableRange<float>(60, 200, 1), 124.f));
    p.add(std::make_unique<AudioParameterInt>(ParameterID {"key", 1}, "Key", -12, 12, 0));
#if LUMA_STUDIO
    unit("leadLevel", "Acido Level", .75f); unit("orbitLevel", "Orbit Level", .55f); unit("orbitTone", "Orbit Brightness", .62f); unit("orbitExplore", "Orbit Explore", .35f);
    unit("returnDelay", "Delay Return", 1); unit("returnReverb", "Reverb Return", 1);
    StringArray sounds; for (const auto* name : acido::OrbitLayer::soundNames()) sounds.add(name);
    p.add(std::make_unique<AudioParameterChoice>(ParameterID {"orbitSound", 1}, "Orbit Timbre", sounds, 0));
    p.add(std::make_unique<AudioParameterInt>(ParameterID {"orbitOctave", 1}, "Orbit Octave", -1, 1, 0));
    for (int i = 0; i < acido::Mixer::N; ++i) {
        const String id(channelIds[i]), name(channelNames[i]);
        p.add(std::make_unique<AudioParameterBool>(ParameterID {id + "Mute", 1}, name + " Mute", false));
        p.add(std::make_unique<AudioParameterBool>(ParameterID {id + "Solo", 1}, name + " Solo", false));
        p.add(std::make_unique<AudioParameterFloat>(ParameterID {id + "Pan", 1}, name + " Pan", NormalisableRange<float>(-1, 1), 0.f));
        unit(id + "Delay", name + " Delay", 0);
        unit(id + "Reverb", name + " Reverb", i == 1 ? .12f : 0.f);
    }
#else
    juce::ignoreUnused(unit);
#endif
    return p;
}
}

AcidoProcessor::AcidoProcessor() : AudioProcessor(BusesProperties().withOutput("Output", AudioChannelSet::stereo(), true)), state(*this, nullptr, "LumaAcido", layout()) {
    for (size_t i = 0; i < core.size(); ++i) core[i] = state.getRawParameterValue(acido::paramInfo()[i].id);
    run = state.getRawParameterValue("run"); sync = state.getRawParameterValue("sync"); bpm = state.getRawParameterValue("bpm"); key = state.getRawParameterValue("key");
    loop = state.getRawParameterValue("loop"); stutter = state.getRawParameterValue("stutter"); sequencerOn = state.getRawParameterValue("sequencer");
#if LUMA_STUDIO
    leadLevel = state.getRawParameterValue("leadLevel"); orbitLevel = state.getRawParameterValue("orbitLevel"); orbitTone = state.getRawParameterValue("orbitTone");
    orbitSound = state.getRawParameterValue("orbitSound"); orbitOctave = state.getRawParameterValue("orbitOctave"); orbitExplore = state.getRawParameterValue("orbitExplore");
    returnDelay = state.getRawParameterValue("returnDelay"); returnReverb = state.getRawParameterValue("returnReverb");
    for (size_t i = 0; i < strips.size(); ++i) {
        const String id(channelIds[i]);
        strips[i] = {state.getRawParameterValue(id + "Mute"), state.getRawParameterValue(id + "Solo"), state.getRawParameterValue(id + "Pan"), state.getRawParameterValue(id + "Delay"), state.getRawParameterValue(id + "Reverb")};
    }
#endif
    editData = std::make_unique<acido::SongData>(); activeData = std::make_unique<acido::SongData>(); nextData = std::make_unique<acido::SongData>();
    loadDemos();
    int start = 0;
    for (int i = 0; i < songCount(); ++i) if (demos[size_t(i)].name == "Coro di Mezzanotte") start = i;
    loadSong(start);
}

void AcidoProcessor::loadDemos() {
    const auto root = JSON::parse(String::fromUTF8(BinaryData::demos_json, BinaryData::demos_jsonSize));
    if (const auto* songs = root["songs"].getArray()) {
        demos.reserve(size_t(songs->size()));
        for (const auto& song : *songs) {
            Demo demo; demo.name = song["name"].toString().substring(0, 40);
            if (acido::readSong(song, demo.data, &demo.params)) demos.push_back(std::move(demo));
        }
    }
    if (demos.empty()) { Demo empty; empty.name = "Init"; for (size_t i = 0; i < empty.params.size(); ++i) empty.params[i] = acido::paramInfo()[i].value; demos.push_back(std::move(empty)); }
}

void AcidoProcessor::setParameter(const String& id, double plain) {
    if (auto* p = state.getParameter(id)) p->setValueNotifyingHost(p->convertTo0to1(float(plain)));
}

void AcidoProcessor::applySongSends(const std::array<double, acido::paramCount>& params) {
#if LUMA_STUDIO
    const auto apply = [&](const String& id, double v) { if (touched.count(id) == 0) setParameter(id, v); };
    apply("leadDelay", params[acido::delay]); apply("leadReverb", params[acido::reverb]); apply("snareReverb", params[acido::reverb] * .8); apply("clapReverb", params[acido::reverb] * .8);
#else
    juce::ignoreUnused(params);
#endif
}

void AcidoProcessor::loadSong(int index) {
    if (index < 0 || index >= songCount()) return;
    songIndex = index;
    const auto& demo = demos[size_t(index)];
    *editData = demo.data;
#if LUMA_STUDIO
    const int mixerOwned[] = {acido::bass, acido::kick, acido::snare, acido::hat, acido::clap, acido::duck, acido::volume};
#endif
    for (int i = 0; i < acido::paramCount; ++i) {
#if LUMA_STUDIO
        if (std::find(std::begin(mixerOwned), std::end(mixerOwned), i) != std::end(mixerOwned)) continue;
#endif
        setParameter(acido::paramInfo()[size_t(i)].id, demo.params[size_t(i)]);
    }
    setParameter("bpm", demo.data.tempo);
    applySongSends(demo.params);
    queuedSectionView.store(-1); pendingSection.store(-1);
#if LUMA_STUDIO
    phraseSeed = Random::getSystemRandom().nextInt(2147483647);
    acido::buildTimeline(*editData, orbitNotes, orbitExplore->load(), phraseSeed);
#endif
    publish();
}

void AcidoProcessor::newPhrase() {
#if LUMA_STUDIO
    phraseSeed = Random::getSystemRandom().nextInt(2147483647);
    acido::buildTimeline(*editData, orbitNotes, orbitExplore->load(), phraseSeed);
    publish();
#endif
}

void AcidoProcessor::newBeat(int style) {
    const auto seed = std::uint32_t(Random::getSystemRandom().nextInt(2147483647));
    int variation = 0;
    for (auto& p : editData->patterns) {
        bool melodic = false; for (const auto& s : p.steps) melodic = melodic || s.gate || s.bass >= 0;
        if (melodic && acido::hasDrums(p)) acido::applyDrums(p, acido::generateDrums(style, seed, variation++ % 4));
    }
    publish();
}

void AcidoProcessor::publish() {
    auto fresh = std::make_unique<acido::SongData>(*editData);
    { const SpinLock::ScopedLockType lock(swapLock); std::swap(nextData, fresh); nextReady.store(true); }
}

void AcidoProcessor::prepareToPlay(double sampleRate, int) {
    sampleRateHz = sampleRate;
    engine = std::make_unique<acido::Engine>(sampleRate); sequencer = std::make_unique<acido::Sequencer>(sampleRate);
    engine->sequence = sequencer.get();
#if LUMA_STUDIO
    layer = std::make_unique<acido::OrbitLayer>(sampleRate); mixer = std::make_unique<acido::Mixer>(sampleRate);
    engine->layer = layer.get(); engine->mixer = mixer.get();
#endif
    { const SpinLock::ScopedLockType lock(swapLock); *activeData = *editData; nextReady.store(false); }
    appliedKey = 1000; appliedHeld = 0; stutterOn = false; wasHost = false; heldNotes.fill(false); currentNote = -1;
    syncDsp();
    sequencer->configure(*activeData); sequencer->select(activeData->current);
    engine->tempo = sequencer->tempo; engine->reset();
#if LUMA_STUDIO
    layer->setPhrase(activeData->deg.data(), activeData->beats.data(), activeData->phraseLength);
#endif
}

void AcidoProcessor::syncDsp() {
    for (size_t i = 0; i < core.size(); ++i) engine->setParam(int(i), core[i]->load(std::memory_order_relaxed));
    const int k = int(key->load(std::memory_order_relaxed));
    if (k != appliedKey) {
        appliedKey = k; sequencer->transpose = k;
#if LUMA_STUDIO
        std::array<int, 12> scale {};
        for (int i = 0; i < activeData->scaleCount; ++i) scale[size_t(i)] = (activeData->scale[size_t(i)] + k + 24) % 12;
        layer->transpose = k; layer->setScale(scale, activeData->scaleCount);
#endif
    }
    sequencer->loopSec = loop->load(std::memory_order_relaxed) > .5f;
    const int mask = heldMask.load(std::memory_order_relaxed);
    if (mask != appliedHeld) { for (int i = 0; i < 4; ++i) if (((mask ^ appliedHeld) >> i) & 1) sequencer->hold(i, (mask >> i) & 1, *engine); appliedHeld = mask; }
    const bool wantStutter = stutter->load(std::memory_order_relaxed) > .5f;
    if (wantStutter != stutterOn) { stutterOn = wantStutter; engine->stutter(wantStutter); }
#if LUMA_STUDIO
    engine->leadLevel = leadLevel->load(std::memory_order_relaxed) / .75;
    layer->level = orbitLevel->load(std::memory_order_relaxed); layer->setTone(orbitTone->load(std::memory_order_relaxed));
    layer->setSound(int(orbitSound->load(std::memory_order_relaxed))); layer->octave = int(orbitOctave->load(std::memory_order_relaxed));
    mixer->setReturns(returnDelay->load(std::memory_order_relaxed), returnReverb->load(std::memory_order_relaxed));
    for (int i = 0; i < acido::Mixer::N; ++i) {
        const auto& s = strips[size_t(i)];
        mixer->setStrip(i, {s.mute->load(std::memory_order_relaxed) > .5f, s.solo->load(std::memory_order_relaxed) > .5f, s.pan->load(std::memory_order_relaxed), s.delay->load(std::memory_order_relaxed), s.reverb->load(std::memory_order_relaxed)});
    }
#endif
}

void AcidoProcessor::updateTransport(int samples) {
    bool playing = run->load(std::memory_order_relaxed) > .5f, usingHost = false, ppqValid = false;
    double tempo = bpm->load(std::memory_order_relaxed), ppq = 0;
    if (sync->load(std::memory_order_relaxed) > .5f && wrapperType != wrapperType_Standalone) {
        if (auto* head = getPlayHead()) if (auto info = head->getPosition()) {
            usingHost = true; playing = info->getIsPlaying();
            if (auto t = info->getBpm()) if (std::isfinite(*t) && *t > 0) tempo = *t;
            if (auto p = info->getPpqPosition()) if (std::isfinite(*p)) { ppq = std::max(0.0, *p); ppqValid = true; }
        }
    }
    hostControlled.store(usingHost, std::memory_order_relaxed);
    sequencer->setTempo(tempo); engine->tempo = sequencer->tempo;
    const bool active = playing && sequencerOn->load(std::memory_order_relaxed) > .5f;
    if (active) {
        const auto seek = [&] { const double sixteenths = ppq * 4, whole = std::floor(sixteenths); sequencer->seek(*engine, std::int64_t(whole), sixteenths - whole); };
        if (!sequencer->running) { if (usingHost && ppqValid) seek(); else sequencer->start(*engine); }
        else if (usingHost && ppqValid && wasHost && std::abs(ppq - expectedPpq) > .05) seek();
    } else if (sequencer->running) sequencer->stop(*engine);
    expectedPpq = ppq + samples * sequencer->tempo / (60 * sampleRateHz);
    wasHost = usingHost;
}

void AcidoProcessor::handleMidi(const MidiMessage& m) {
    if (m.isNoteOn()) {
        const int n = m.getNoteNumber(); const bool legato = currentNote >= 0;
        heldNotes[size_t(n)] = true; currentNote = n;
        engine->noteOn(n + appliedKey, m.getVelocity() >= 110, legato);
    } else if (m.isNoteOff()) {
        const int n = m.getNoteNumber(); heldNotes[size_t(n)] = false;
        if (n != currentNote) return;
        currentNote = -1; for (int i = 127; i >= 0; --i) if (heldNotes[size_t(i)]) { currentNote = i; break; }
        if (currentNote >= 0) engine->noteOn(currentNote + appliedKey, false, true); else engine->noteOff();
    } else if (m.isAllNotesOff() || m.isAllSoundOff()) { heldNotes.fill(false); currentNote = -1; engine->noteOff(); }
}

void AcidoProcessor::processBlock(AudioBuffer<float>& buffer, MidiBuffer& midi) {
    ScopedNoDenormals guard;
    buffer.clear();
    if (engine == nullptr || buffer.getNumChannels() < 2) { midi.clear(); return; }
    if (nextReady.load(std::memory_order_acquire)) {
        const SpinLock::ScopedTryLockType lock(swapLock);
        if (lock.isLocked()) {
            std::swap(activeData, nextData); nextReady.store(false);
            sequencer->configure(*activeData); appliedKey = 1000;
#if LUMA_STUDIO
            layer->setPhrase(activeData->deg.data(), activeData->beats.data(), activeData->phraseLength);
#endif
        }
    }
    syncDsp();
    const int jump = pendingSection.exchange(-2, std::memory_order_relaxed);
    if (jump >= -1) sequencer->queueSection(jump);
    const int n = buffer.getNumSamples();
    updateTransport(n);
    auto* left = buffer.getWritePointer(0); auto* right = buffer.getWritePointer(1);
    int at = 0;
    for (const auto event : midi) {
        const int position = jlimit(0, n, event.samplePosition);
        if (position > at) { engine->process(left + at, right + at, position - at); at = position; }
        if (!sequencer->running) handleMidi(event.getMessage());
    }
    if (n > at) engine->process(left + at, right + at, n - at);
    midi.clear();
    float master = 0;
    for (int i = 0; i < n; ++i) master = std::max({master, std::abs(left[i]), std::abs(right[i])});
    auto raise = [](std::atomic<float>& meter, float v) { auto now = meter.load(std::memory_order_relaxed); while (v > now && !meter.compare_exchange_weak(now, v, std::memory_order_relaxed)) {} };
    raise(meters[acido::Mixer::N], master);
#if LUMA_STUDIO
    for (size_t i = 0; i < size_t(acido::Mixer::N); ++i) { raise(meters[i], mixer->peak[i]); mixer->peak[i] = 0; }
#endif
    liveStep.store(sequencer->running ? sequencer->lastFired : -1, std::memory_order_relaxed);
    livePattern.store(sequencer->running ? sequencer->lastPat : -1, std::memory_order_relaxed);
    liveSection.store(sequencer->running && sequencer->songActive() ? sequencer->secI : -1, std::memory_order_relaxed);
}

void AcidoProcessor::getStateInformation(MemoryBlock& data) {
    auto tree = state.copyState();
    tree.setProperty("acidoSong", JSON::toString(acido::writeSong(*editData), true), nullptr);
    tree.setProperty("songIndex", songIndex, nullptr);
    tree.setProperty("phraseSeed", int(phraseSeed), nullptr);
    if (auto xml = tree.createXml()) copyXmlToBinary(*xml, data);
}

void AcidoProcessor::setStateInformation(const void* data, int size) {
    const auto xml = getXmlFromBinary(data, size);
    if (xml == nullptr || !xml->hasTagName(state.state.getType())) return;
    auto tree = ValueTree::fromXml(*xml);
    // Restoring a session must not start the standalone transport.
    tree.getChildWithProperty("id", "run").setProperty("value", 0, nullptr);
    tree.getChildWithProperty("id", "stutter").setProperty("value", 0, nullptr);
    const int savedSong = tree.getProperty("songIndex", songIndex);
    songIndex = jlimit(0, songCount() - 1, savedSong);
    const auto saved = JSON::parse(tree["acidoSong"].toString());
    auto restored = std::make_unique<acido::SongData>();
    if (acido::readSong(saved, *restored)) *editData = *restored;
    else *editData = demos[size_t(songIndex)].data;
#if LUMA_STUDIO
    phraseSeed = std::uint32_t(int(tree.getProperty("phraseSeed", 1)));
#endif
    state.replaceState(tree);
#if LUMA_STUDIO
    acido::buildTimeline(*editData, orbitNotes, orbitExplore->load(), phraseSeed);
#endif
    publish();
}

AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new AcidoProcessor(); }

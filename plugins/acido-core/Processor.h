// Shared audio processor. LUMA_STUDIO=1 adds the Orbit layer and the channel mixer.
#pragma once
#include "SongJson.h"
#include <juce_audio_utils/juce_audio_utils.h>
#include <atomic>
#include <memory>
#include <set>

#ifndef LUMA_STUDIO
 #define LUMA_STUDIO 0
#endif

class AcidoProcessor final : public juce::AudioProcessor {
public:
    using State = juce::AudioProcessorValueTreeState;
    static constexpr int meterCount = acido::Mixer::N + 1;
    AcidoProcessor();
    State state;
    std::atomic<int> liveSection {-1}, livePattern {-1}, liveStep {-1}, queuedSectionView {-1};
    std::array<std::atomic<float>, meterCount> meters {};
    std::atomic<bool> hostControlled {false};

    int songCount() const { return int(demos.size()); }
    juce::String songName(int i) const { return demos[size_t(i)].name; }
    int currentSong() const { return songIndex; }
    int sectionCount() const { return editData->song.count; }
    juce::String sectionName(int i) const { return juce::String::fromUTF8(editData->song.sections[size_t(i)].name.data()); }
    void loadSong(int index);
    void newBeat(int style);
    void newPhrase();
    void jumpToSection(int index) { queuedSectionView.store(index); pendingSection.store(index); }
    void setHeld(int lane, bool on) { auto mask = heldMask.load(); do {} while (!heldMask.compare_exchange_weak(mask, on ? mask | (1 << lane) : mask & ~(1 << lane))); }
    void markTouched(const juce::String& id) { touched.insert(id); }

    const juce::String getName() const override { return JucePlugin_Name; }
    void prepareToPlay(double, int) override;
    void releaseResources() override {}
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    bool isBusesLayoutSupported(const BusesLayout& l) const override { return l.getMainInputChannelSet().isDisabled() && l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo(); }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 3; }
    bool hasEditor() const override { return true; }
    juce::AudioProcessorEditor* createEditor() override;
    // Songs are chosen in the editor: a host program change could overwrite a restored session.
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return songName(songIndex); }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

private:
    struct Demo { juce::String name; acido::SongData data; std::array<double, acido::paramCount> params {}; };
    void loadDemos();
    void publish();
    void setParameter(const juce::String& id, double plainValue);
    void applySongSends(const std::array<double, acido::paramCount>&);
    void syncDsp();
    void handleMidi(const juce::MidiMessage&);
    void updateTransport(int samples);
    std::vector<Demo> demos;
    std::unique_ptr<acido::SongData> editData, activeData, nextData;
    juce::SpinLock swapLock;
    std::atomic<bool> nextReady {false};
    std::unique_ptr<acido::Engine> engine;
    std::unique_ptr<acido::Sequencer> sequencer;
    std::unique_ptr<acido::OrbitLayer> layer;
    std::unique_ptr<acido::Mixer> mixer;
    std::array<std::atomic<float>*, acido::paramCount> core {};
    std::atomic<float>* run = nullptr, *sync = nullptr, *bpm = nullptr, *key = nullptr, *loop = nullptr, *stutter = nullptr, *sequencerOn = nullptr;
    std::atomic<float>* leadLevel = nullptr, *orbitLevel = nullptr, *orbitTone = nullptr, *orbitSound = nullptr, *orbitOctave = nullptr, *orbitExplore = nullptr, *returnDelay = nullptr, *returnReverb = nullptr;
    struct StripParams { std::atomic<float>* mute, *solo, *pan, *delay, *reverb; };
    std::array<StripParams, acido::Mixer::N> strips {};
    std::atomic<int> pendingSection {-2}, heldMask {0};
    std::set<juce::String> touched;
    std::array<bool, 128> heldNotes {};
    int songIndex = 0, appliedKey = 0, currentNote = -1;
    int appliedHeld = 0;
    bool stutterOn = false, wasHost = false;
    double sampleRateHz = 44100, expectedPpq = 0;
    std::uint32_t phraseSeed = 1;
};

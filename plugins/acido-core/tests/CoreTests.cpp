// Native checks for Acido and Luma Studio. With an output folder it also renders the audio compared with the web engine.
#include "../Processor.h"
#include "BinaryData.h"
#include <iostream>
using namespace juce;

namespace {
int failures = 0;
void check(bool ok, const char* what) { if (!ok) { ++failures; std::cerr << "FAILED: " << what << "\n"; } }

void renderFile(const var& demo, const File& file, bool studio, int seconds) {
    constexpr double sr = 44100;
    auto data = std::make_unique<acido::SongData>();
    std::array<double, acido::paramCount> params {};
    check(acido::readSong(demo, *data, &params), "demo parses");
    acido::Engine e(sr); acido::Sequencer q(sr); acido::OrbitLayer layer(sr); acido::Mixer mixer(sr);
    e.sequence = &q;
    for (int i = 0; i < acido::paramCount; ++i) e.setParam(i, params[size_t(i)]);
    if (studio) {
        const std::array<int, 8> notes {{0, 4, 2, 6, 4, 7, 2, 3}};
        acido::buildTimeline(*data, notes, .35, 3);
        e.layer = &layer; e.mixer = &mixer; layer.level = .55; layer.setScale(data->scale, data->scaleCount); layer.setPhrase(data->deg.data(), data->beats.data(), data->phraseLength);
        mixer.setStrip(acido::Mixer::lead, {false, false, -.2, .3, .3}); mixer.setStrip(acido::Mixer::orbit, {false, false, .4, .1, .12});
        mixer.setStrip(acido::Mixer::snareChannel, {false, false, 0, 0, .24}); mixer.setStrip(acido::Mixer::clapChannel, {false, false, 0, 0, .24}); mixer.setStrip(acido::Mixer::hatChannel, {true, false, 0, 0, 0});
    }
    q.configure(*data); q.select(data->current); e.tempo = q.tempo; e.reset(); q.start(e);
    const int frames = int(sr) * seconds;
    const auto count = static_cast<size_t>(frames);
    std::vector<float> l(count), r(count), out(count * 2);
    for (int at = 0; at < frames; at += 128) { const int n = std::min(128, frames - at); e.process(l.data() + at, r.data() + at, n); }
    for (size_t i = 0; i < size_t(frames); ++i) { out[i * 2] = l[i]; out[i * 2 + 1] = r[i]; }
    check(file.replaceWithData(out.data(), out.size() * sizeof(float)), "render written");
}

float peakOf(const AudioBuffer<float>& b) { return b.getMagnitude(0, b.getNumSamples()); }
void setValue(AcidoProcessor& p, const char* id, float plain) { auto* x = p.state.getParameter(id); x->setValueNotifyingHost(x->convertTo0to1(plain)); }

void pluginChecks() {
    AcidoProcessor p; p.setPlayConfigDetails(0, 2, 48000, 256); p.prepareToPlay(48000, 256);
    check(p.songCount() == 15, "all demo songs are embedded");
    AudioBuffer<float> b(2, 256); MidiBuffer midi;
    auto run = [&](int blocks) { float peak = 0; for (int i = 0; i < blocks; ++i) { p.processBlock(b, midi); peak = std::max(peak, peakOf(b)); for (int c = 0; c < 2; ++c) for (int n = 0; n < 256; ++n) if (!std::isfinite(b.getSample(c, n)) || std::abs(b.getSample(c, n)) > .951f) { check(false, "output finite and limited"); return peak; } } return peak; };
    check(run(20) < 1e-4f, "stopped transport is silent");
    midi.addEvent(MidiMessage::noteOn(1, 48, uint8(100)), 10); const float note = run(20); midi.clear();
    check(note > .01f, "MIDI plays the lead when the sequencer is stopped");
    midi.addEvent(MidiMessage::noteOff(1, 48), 0); run(1); midi.clear(); run(300);
    setValue(p, "run", 1); check(run(400) > .05f, "play makes sound");
    for (int song = 0; song < p.songCount(); ++song) { p.loadSong(song); check(run(120) > .001f, "every song plays"); }
    p.newBeat(2); run(40); p.jumpToSection(p.sectionCount() - 1); run(500);
    check(p.liveSection.load() == p.sectionCount() - 1 || p.liveSection.load() == 0, "section jump lands");
    MemoryBlock saved; p.getStateInformation(saved);
    AcidoProcessor restored; restored.setStateInformation(saved.getData(), int(saved.getSize()));
    check(restored.state.getRawParameterValue("run")->load() < .5f, "restoring does not start playback");
    check(restored.currentSong() == p.currentSong(), "session restores the song");
    check(std::abs(restored.state.getRawParameterValue("cutoff")->load() - p.state.getRawParameterValue("cutoff")->load()) < 1e-5f, "session restores parameters");
    restored.setStateInformation("garbage", 7);
    const String hostile = "<LumaAcido acidoSong='{&quot;tempo&quot;:1e99,&quot;patterns&quot;:[{&quot;i&quot;:999},{&quot;i&quot;:0,&quot;length&quot;:-4,&quot;steps&quot;:[[99,1,1,1,9,9,9,1,9,99,9,1,9]]}],&quot;song&quot;:{&quot;on&quot;:true,&quot;sections&quot;:[{&quot;patterns&quot;:[999],&quot;repeat&quot;:-1}]}}' songIndex='9999' phraseSeed='-1'/>";
    MemoryBlock block; if (auto xml = parseXML(hostile)) AudioProcessor::copyXmlToBinary(*xml, block);
    restored.setPlayConfigDetails(0, 2, 48000, 256); restored.prepareToPlay(48000, 256); restored.setStateInformation(block.getData(), int(block.getSize()));
    setValue(restored, "run", 1); AudioBuffer<float> c(2, 256); MidiBuffer none; for (int i = 0; i < 300; ++i) restored.processBlock(c, none);
    check(std::isfinite(peakOf(c)), "hostile session stays safe");
#if LUMA_STUDIO
    p.loadSong(0); setValue(p, "run", 1); run(60);
    for (const char* id : {"leadMute", "orbitMute", "bassMute", "kickMute", "snareMute", "hatMute", "clapMute"}) setValue(p, id, 1);
    setValue(p, "returnDelay", 0); setValue(p, "returnReverb", 0); run(300);
    check(run(60) < 1e-3f, "muting all channels is silent");
    for (const char* id : {"leadMute", "orbitMute", "bassMute", "kickMute", "snareMute", "hatMute", "clapMute"}) setValue(p, id, 0);
    setValue(p, "kickSolo", 1); run(100); for (int i = 0; i < 2; ++i) p.meters[size_t(i)].store(0); run(300);
    check(p.meters[3].load() > .01f && p.meters[0].load() < 1e-3f, "solo keeps only the soloed channel");
#endif
}
}

int main(int argc, char** argv) {
    ScopedJuceInitialiser_GUI gui;
    if (argc > 2 && String(argv[1]) == "--snapshot") {
        AcidoProcessor p; p.setPlayConfigDetails(0, 2, 48000, 256); p.prepareToPlay(48000, 256);
        std::unique_ptr<AudioProcessorEditor> editor(p.createEditor());
        const auto image = editor->createComponentSnapshot(editor->getLocalBounds(), true, 1.0f);
        FileOutputStream out {File(String::fromUTF8(argv[2]))}; out.setPosition(0); out.truncate();
        check(out.openedOk() && PNGImageFormat().writeImageToStream(image, out), "editor snapshot");
    } else if (argc > 1) {
        const File dir(String::fromUTF8(argv[1])); dir.createDirectory();
        const auto root = JSON::parse(String::fromUTF8(BinaryData::demos_json, BinaryData::demos_jsonSize));
        const auto* songs = root["songs"].getArray();
        check(songs != nullptr, "demos load");
        if (songs != nullptr) for (int i = 0; i < songs->size(); ++i) renderFile(songs->getReference(i), dir.getChildFile(String(LUMA_STUDIO ? "studio-" : "acido-") + String(i) + ".f32"), LUMA_STUDIO != 0, 6);
    } else pluginChecks();
    if (failures == 0) std::cout << "PASS\n";
    return failures == 0 ? 0 : 1;
}

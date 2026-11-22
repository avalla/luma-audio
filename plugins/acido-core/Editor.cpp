#include "Processor.h"
using namespace juce;

namespace {
const Colour bg(0xff0f0f0d), panel(0xff1b1b18), panel2(0xff24241f), line(0xff34342d), ink(0xffecebe2), muted(0xffa9a89b), acid(0xffe9f23a), red(0xffff8a65);
using SliderAttachment = AudioProcessorValueTreeState::SliderAttachment;
using ButtonAttachment = AudioProcessorValueTreeState::ButtonAttachment;

struct Knob {
    Slider slider; Label label; std::unique_ptr<SliderAttachment> attachment;
    void setup(Component& owner, AcidoProcessor& p, const String& id, const String& name, Slider::SliderStyle style = Slider::RotaryHorizontalVerticalDrag) {
        slider.setSliderStyle(style); slider.setTextBoxStyle(Slider::NoTextBox, true, 0, 0); slider.setTitle(name); slider.setPopupDisplayEnabled(true, false, &owner);
        label.setText(name, dontSendNotification); label.setJustificationType(Justification::centred); label.setFont(FontOptions(12.f)); label.setColour(Label::textColourId, muted); label.setMinimumHorizontalScale(.7f);
        owner.addAndMakeVisible(slider); owner.addAndMakeVisible(label);
        attachment = std::make_unique<SliderAttachment>(p.state, id, slider);
    }
    void place(Rectangle<int> r) { label.setBounds(r.removeFromBottom(18)); slider.setBounds(r); }
};

class Meter final : public Component {
public:
    void setLevel(float peak) {
        const float db = 20 * std::log10(std::max(peak, 1e-5f)), next = jlimit(0.f, 1.f, 1 + db / 48);
        level = next >= level ? next : level * .82f + next * .18f;
        repaint();
    }
    void paint(Graphics& g) override {
        const auto r = getLocalBounds().toFloat();
        g.setColour(bg); g.fillRoundedRectangle(r, 3);
        g.setColour(acid); g.fillRoundedRectangle(r.withTrimmedTop(r.getHeight() * (1 - level)), 3);
    }
private:
    float level = 0;
};

#if LUMA_STUDIO
struct StripView {
    Label name; TextButton mute {"M"}, solo {"S"}; Meter meter; Knob fader, pan, delay, reverb;
    std::unique_ptr<ButtonAttachment> muteAttachment, soloAttachment;
};
#endif
}

class AcidoEditor final : public AudioProcessorEditor, private Timer {
public:
    explicit AcidoEditor(AcidoProcessor& owner) : AudioProcessorEditor(owner), p(owner) {
        theme.setColour(Slider::rotarySliderFillColourId, acid); theme.setColour(Slider::rotarySliderOutlineColourId, line); theme.setColour(Slider::thumbColourId, acid);
        theme.setColour(Slider::trackColourId, acid); theme.setColour(Slider::backgroundColourId, line); theme.setColour(ComboBox::backgroundColourId, panel2); theme.setColour(ComboBox::outlineColourId, line);
        theme.setColour(ComboBox::textColourId, ink); theme.setColour(PopupMenu::backgroundColourId, panel2); theme.setColour(PopupMenu::textColourId, ink); theme.setColour(PopupMenu::highlightedBackgroundColourId, acid); theme.setColour(PopupMenu::highlightedTextColourId, bg);
        theme.setColour(TextButton::buttonColourId, panel2); theme.setColour(TextButton::buttonOnColourId, acid); theme.setColour(TextButton::textColourOffId, ink); theme.setColour(TextButton::textColourOnId, bg);
        theme.setColour(Label::textColourId, ink); theme.setColour(Slider::textBoxTextColourId, ink); theme.setColour(Slider::textBoxBackgroundColourId, panel2); theme.setColour(Slider::textBoxOutlineColourId, line);
        setLookAndFeel(&theme);
        title.setText(JucePlugin_Name, dontSendNotification); title.setFont(FontOptions(22.f, Font::bold)); title.setColour(Label::textColourId, acid); addAndMakeVisible(title);
        setupToggle(play, "run"); setupToggle(syncButton, "sync"); setupToggle(loopButton, "loop"); setupToggle(sequencerButton, "sequencer");
        syncButton.setVisible(p.wrapperType != AudioProcessor::wrapperType_Standalone);
        stutterButton.setTitle("Stutter"); addAndMakeVisible(stutterButton);
        stutterButton.onStateChange = [this] { const bool down = stutterButton.isDown(); if (down != stutterDown) { stutterDown = down; if (auto* q = p.state.getParameter("stutter")) q->setValueNotifyingHost(down ? 1.f : 0.f); } };
        setupNumber(tempo, tempoAttachment, "bpm", "Tempo"); setupNumber(key, keyAttachment, "key", "Key");
        for (int i = 0; i < p.songCount(); ++i) songBox.addItem(p.songName(i), i + 1);
        songBox.setSelectedId(p.currentSong() + 1, dontSendNotification); songBox.setTitle("Song");
        songBox.onChange = [this] { const int i = songBox.getSelectedId() - 1; if (i >= 0 && i != p.currentSong()) { p.loadSong(i); rebuildSections(); } };
        addAndMakeVisible(songBox);
        for (size_t i = 0; i < acido::styleNames().size(); ++i) beatBox.addItem(acido::styleNames()[i], int(i) + 1);
        beatBox.setSelectedId(1, dontSendNotification); beatBox.setTitle("Drum style"); addAndMakeVisible(beatBox);
        newBeat.onClick = [this] { p.newBeat(beatBox.getSelectedId() - 1); }; addAndMakeVisible(newBeat);
        const std::array<std::pair<const char*, const char*>, 12> sound {{{"cutoff","Cutoff"},{"resonance","Resonance"},{"envMod","Env Mod"},{"decay","Decay"},{"accent","Accent"},{"drive","Drive"},{"distortion","Distortion"},{"crush","Crush"},{"glitch","Glitch"},{"formant","Formant"},{"fill","Fill"},{"waveform","Wave"}}};
        for (size_t i = 0; i < sound.size(); ++i) {
            knobs[i].setup(*this, p, sound[i].first, sound[i].second);
            if (i < 4) { auto& s = knobs[i].slider; const int lane = int(i); s.onDragStart = [this, lane] { p.setHeld(lane, true); }; s.onDragEnd = [this, lane] { p.setHeld(lane, false); }; }
        }
#if LUMA_STUDIO
        orbitTimbre.addItemList([] { StringArray a; for (const auto* n : acido::OrbitLayer::soundNames()) a.add(n); return a; }(), 1); orbitTimbre.setTitle("Orbit timbre"); addAndMakeVisible(orbitTimbre);
        orbitTimbreAttachment = std::make_unique<AudioProcessorValueTreeState::ComboBoxAttachment>(p.state, "orbitSound", orbitTimbre);
        orbitTone.setup(*this, p, "orbitTone", "Brightness"); orbitExplore.setup(*this, p, "orbitExplore", "Explore"); orbitExplore.slider.onDragEnd = [this] { p.newPhrase(); };
        setupNumber(octave, octaveAttachment, "orbitOctave", "Octave");
        newPhrase.onClick = [this] { p.newPhrase(); }; addAndMakeVisible(newPhrase);
        const char* ids[] = {"lead", "orbit", "bass", "kick", "snare", "hat", "clap"}, *names[] = {"Acido", "Orbit", "Bass", "Kick", "Snare", "Hi-hat", "Clap"}, *levels[] = {"leadLevel", "orbitLevel", "bass", "kick", "snare", "hat", "clap"};
        for (size_t i = 0; i < strips.size(); ++i) {
            auto& s = strips[i]; const String id(ids[i]), name(names[i]);
            s.name.setText(name, dontSendNotification); s.name.setFont(FontOptions(13.f, Font::bold)); s.name.setJustificationType(Justification::centred); addAndMakeVisible(s.name);
            for (auto* b : {&s.mute, &s.solo}) { b->setClickingTogglesState(true); addAndMakeVisible(*b); }
            s.mute.setColour(TextButton::buttonOnColourId, red); s.mute.setTitle(name + " mute"); s.solo.setTitle(name + " solo");
            s.muteAttachment = std::make_unique<ButtonAttachment>(p.state, id + "Mute", s.mute); s.soloAttachment = std::make_unique<ButtonAttachment>(p.state, id + "Solo", s.solo);
            addAndMakeVisible(s.meter);
            s.fader.setup(*this, p, levels[i], name, Slider::LinearVertical); s.fader.label.setVisible(false);
            s.pan.setup(*this, p, id + "Pan", "Pan", Slider::LinearHorizontal); s.delay.setup(*this, p, id + "Delay", "Delay", Slider::LinearHorizontal); s.reverb.setup(*this, p, id + "Reverb", "Reverb", Slider::LinearHorizontal);
            s.delay.slider.onDragStart = [this, id] { p.markTouched(id + "Delay"); }; s.reverb.slider.onDragStart = [this, id] { p.markTouched(id + "Reverb"); };
            s.pan.slider.setDoubleClickReturnValue(true, 0);
        }
        masterName.setText("Master", dontSendNotification); masterName.setFont(FontOptions(13.f, Font::bold)); masterName.setColour(Label::textColourId, acid); masterName.setJustificationType(Justification::centred); addAndMakeVisible(masterName);
        addAndMakeVisible(masterMeter); master.setup(*this, p, "volume", "Master", Slider::LinearVertical); master.label.setVisible(false);
        duck.setup(*this, p, "duck", "Sidechain", Slider::LinearHorizontal); delayReturn.setup(*this, p, "returnDelay", "Delay", Slider::LinearHorizontal); reverbReturn.setup(*this, p, "returnReverb", "Reverb", Slider::LinearHorizontal);
        setSize(1120, 780);
#else
        const std::array<std::pair<const char*, const char*>, 8> extra {{{"delay","Delay"},{"reverb","Reverb"},{"bass","Bass"},{"kick","Kick"},{"snare","Snare"},{"hat","Hi-hat"},{"clap","Clap"},{"volume","Volume"}}};
        for (size_t i = 0; i < extra.size(); ++i) mix[i].setup(*this, p, extra[i].first, extra[i].second);
        addAndMakeVisible(masterMeter);
        setSize(920, 560);
#endif
        rebuildSections();
        startTimerHz(24);
    }
    ~AcidoEditor() override { stopTimer(); setLookAndFeel(nullptr); }
    void paint(Graphics& g) override {
        g.fillAll(bg);
        for (const auto& r : panels) { g.setColour(panel); g.fillRoundedRectangle(r.toFloat(), 8); g.setColour(line); g.drawRoundedRectangle(r.toFloat().reduced(.5f), 8, 1); }
    }
    void resized() override {
        panels.clear();
        auto r = getLocalBounds().reduced(14);
        auto top = r.removeFromTop(44);
        title.setBounds(top.removeFromLeft(200));
        play.setBounds(top.removeFromLeft(84).reduced(2)); if (syncButton.isVisible()) syncButton.setBounds(top.removeFromLeft(84).reduced(2)); sequencerButton.setBounds(top.removeFromLeft(100).reduced(2));
        tempo.setBounds(top.removeFromRight(92).reduced(2)); tempoLabel.setBounds(top.removeFromRight(52)); key.setBounds(top.removeFromRight(84).reduced(2)); keyLabel.setBounds(top.removeFromRight(36));
        songBox.setBounds(top.reduced(6, 4));
        r.removeFromTop(8);
        auto sec = r.removeFromTop(58); panels.add(sec); sec = sec.reduced(10);
        loopButton.setBounds(sec.removeFromRight(96).reduced(1));
        const int count = sections.size();
        if (count > 0) { const int w = sec.getWidth() / count; for (auto* b : sections) b->setBounds(sec.removeFromLeft(w).reduced(2)); }
        r.removeFromTop(8);
#if LUMA_STUDIO
        auto instruments = r.removeFromTop(236);
        auto acidoPanel = instruments.removeFromLeft(int(instruments.getWidth() * .68f)); instruments.removeFromLeft(8);
        panels.add(acidoPanel); panels.add(instruments);
        layoutAcido(acidoPanel.reduced(10), 6);
        auto o = instruments.reduced(10); auto row = o.removeFromTop(34); orbitTimbre.setBounds(row.reduced(0, 2)); o.removeFromTop(4);
        auto k = o.removeFromTop(110); orbitTone.place(k.removeFromLeft(k.getWidth() / 2)); orbitExplore.place(k);
        auto b = o.removeFromTop(38); octaveLabel.setBounds(b.removeFromLeft(54)); octave.setBounds(b.removeFromLeft(84).reduced(2)); newPhrase.setBounds(b.reduced(4, 2));
        r.removeFromTop(8); panels.add(r);
        auto strip = r.reduced(8); const int width = strip.getWidth() / int(strips.size() + 1);
        for (auto& s : strips) {
            auto c = strip.removeFromLeft(width).reduced(3);
            s.name.setBounds(c.removeFromTop(22)); auto ms = c.removeFromTop(34); s.mute.setBounds(ms.removeFromLeft(ms.getWidth() / 2).reduced(2)); s.solo.setBounds(ms.reduced(2));
            auto bottom = c.removeFromBottom(150); s.pan.place(bottom.removeFromTop(50)); auto sends = bottom.removeFromTop(100); s.delay.place(sends.removeFromTop(50)); s.reverb.place(sends);
            auto f = c.reduced(8, 4); s.meter.setBounds(f.removeFromLeft(9)); s.fader.slider.setBounds(f);
        }
        auto c = strip.reduced(3); masterName.setBounds(c.removeFromTop(22)); c.removeFromTop(34);
        auto bottom = c.removeFromBottom(150); duck.place(bottom.removeFromTop(50)); auto sends = bottom.removeFromTop(100); delayReturn.place(sends.removeFromTop(50)); reverbReturn.place(sends);
        auto f = c.reduced(8, 4); masterMeter.setBounds(f.removeFromLeft(9)); master.slider.setBounds(f);
#else
        auto a = r.removeFromTop(240); panels.add(a); layoutAcido(a.reduced(10), 6);
        r.removeFromTop(8); panels.add(r); auto m = r.reduced(10); masterMeter.setBounds(m.removeFromRight(12)); m.removeFromRight(8);
        const int w = m.getWidth() / int(mix.size()); for (auto& x : mix) x.place(m.removeFromLeft(w).reduced(3));
#endif
        auto drumRow = drumBounds; beatBox.setBounds(drumRow.removeFromLeft(130).reduced(2)); newBeat.setBounds(drumRow.removeFromLeft(110).reduced(2)); stutterButton.setBounds(drumRow.removeFromLeft(100).reduced(2));
        repaint();
    }
private:
    void setupToggle(TextButton& b, const char* id) {
        b.setClickingTogglesState(true); addAndMakeVisible(b);
        toggles.add(new ButtonAttachment(p.state, id, b));
    }
    void setupNumber(Slider& s, std::unique_ptr<SliderAttachment>& a, const char* id, const char* name) {
        s.setSliderStyle(Slider::IncDecButtons); s.setTextBoxStyle(Slider::TextBoxLeft, false, 44, 26); s.setTitle(name); addAndMakeVisible(s);
        a = std::make_unique<SliderAttachment>(p.state, id, s);
        auto& l = String(id) == "bpm" ? tempoLabel : String(id) == "key" ? keyLabel : octaveLabel;
        l.setText(name, dontSendNotification); l.setFont(FontOptions(12.f)); l.setColour(Label::textColourId, muted); l.setJustificationType(Justification::centredRight); addAndMakeVisible(l);
    }
    void layoutAcido(Rectangle<int> area, int columns) {
        drumBounds = area.removeFromBottom(38);
        const int rows = int(knobs.size()) / columns, h = area.getHeight() / rows, w = area.getWidth() / columns;
        for (size_t i = 0; i < knobs.size(); ++i) knobs[i].place(Rectangle<int>(area.getX() + int(i) % columns * w, area.getY() + int(i) / columns * h, w, h).reduced(2));
    }
    void rebuildSections() {
        sections.clear();
        for (int i = 0; i < p.sectionCount(); ++i) {
            auto* b = sections.add(new TextButton(p.sectionName(i)));
            b->onClick = [this, i] { p.jumpToSection(i); }; addAndMakeVisible(b);
        }
        if (getWidth() > 0) resized();
    }
    void timerCallback() override {
        if (songBox.getSelectedId() != p.currentSong() + 1) { songBox.setSelectedId(p.currentSong() + 1, dontSendNotification); rebuildSections(); }
        if (sections.size() != p.sectionCount()) rebuildSections();
        const int now = p.liveSection.load(), queued = p.queuedSectionView.load();
        if (now >= 0 && now == queued) p.queuedSectionView.store(-1);
        for (int i = 0; i < sections.size(); ++i) {
            auto* b = sections[i]; const bool active = i == now;
            b->setToggleState(active, dontSendNotification);
            b->setColour(TextButton::buttonColourId, i == queued && !active ? line : panel2);
        }
        const bool host = p.hostControlled.load(); tempo.setEnabled(!host); play.setEnabled(!host);
        const auto take = [this](int i) { return p.meters[size_t(i)].exchange(0.f); };
#if LUMA_STUDIO
        for (size_t i = 0; i < strips.size(); ++i) strips[i].meter.setLevel(take(int(i)));
#endif
        masterMeter.setLevel(take(AcidoProcessor::meterCount - 1));
    }
    AcidoProcessor& p;
    LookAndFeel_V4 theme;
    Label title, tempoLabel, keyLabel, octaveLabel;
    TextButton play {"Play"}, syncButton {"DAW Sync"}, loopButton {"Loop"}, sequencerButton {"Sequencer"}, stutterButton {"Stutter"}, newBeat {"New beat"}, newPhrase {"New phrase"};
    OwnedArray<ButtonAttachment> toggles;
    Slider tempo, key, octave;
    std::unique_ptr<SliderAttachment> tempoAttachment, keyAttachment, octaveAttachment;
    ComboBox songBox, beatBox, orbitTimbre;
    std::unique_ptr<AudioProcessorValueTreeState::ComboBoxAttachment> orbitTimbreAttachment;
    OwnedArray<TextButton> sections;
    std::array<Knob, 12> knobs;
    Meter masterMeter;
    Array<Rectangle<int>> panels;
    Rectangle<int> drumBounds;
    bool stutterDown = false;
#if LUMA_STUDIO
    std::array<StripView, acido::Mixer::N> strips;
    Knob orbitTone, orbitExplore, master, duck, delayReturn, reverbReturn;
    Label masterName;
#else
    std::array<Knob, 8> mix;
#endif
};

AudioProcessorEditor* AcidoProcessor::createEditor() { return new AcidoEditor(*this); }

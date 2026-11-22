/* Monophonic acid bass voice. DOM-free, allocation-free per sample, written to port 1:1 to C++.
   Chain: polyBLEP saw/square -> 2x oversampled 4-pole ladder (tanh feedback, high-passed feedback path)
   -> VCA with accent -> drive -> DC block -> ping-pong delay -> soft clip. */
(function(root){
 const S=typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession;
 const G=typeof module!=='undefined'&&module.exports?require('./glitch.js'):root.AcidoGlitch;
 const K=typeof module!=='undefined'&&module.exports?require('./kick.js'):root.AcidoKick;
 const D=typeof module!=='undefined'&&module.exports?require('./drums.js'):root.AcidoDrums;
 const F=typeof module!=='undefined'&&module.exports?require('./formant.js'):root.AcidoFormant;
 const V=typeof module!=='undefined'&&module.exports?require('./reverb.js'):root.AcidoReverb;
 const B=typeof module!=='undefined'&&module.exports?require('./bass.js'):root.AcidoBass;
 const TAU=Math.PI*2;
 const BASE_NOTE=36; // step note 0 at octave 0 = C2
 function sat(x){if(x>3)return 1;if(x<-3)return -1;const x2=x*x;return x*(27+x2)/(27+9*x2);}
 function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
 // Distortion curves. Overdrive: asymmetric soft (even harmonics). Pedale: cubic hard knee. Fuzz: driven + rectified (octave-up grit).
 const OD_BIAS=sat(.3);
 function hard(x){if(x>=1.5)return 1;if(x<=-1.5)return -1;return x-.148148*x*x*x;}
 function shape(x,w0,w1,w2){return w0*(sat(x+.3)-OD_BIAS)+w1*hard(x)+w2*(.9*sat(2.5*x)+.42*Math.abs(sat(1.5*x)));}
 const t60=(seconds,sr)=>Math.exp(-6.9/(seconds*sr));
 const onePole=(seconds,sr)=>1-Math.exp(-1/(seconds*sr));
 const SMOOTHED=['tuning','cutoff','resonance','envMod','accent','drive','delay','volume','waveform','distortion','distTone','crush','formant','vowel','reverb'];

 class Engine{
  constructor(sr){
   this.sr=sr;this.fsOS=sr*2;this.tempo=124;this.sequence=null;this.layer=null;this.mixer=null;this.leadLevel=1; // layer and mixer: optional, used by Luma Studio
   this.target={...S.defaults};this.value={...S.defaults};
   this.smooth=onePole(.012,sr);
   this.slideCoef=onePole(.02,sr); // ~60 ms to land, constant time like the original circuit
   this.attackCoef=onePole(.0015,sr);this.releaseCoef=onePole(.006,sr);
   this.vegDecay=t60(4,sr);this.accentDecay=t60(.2,sr);
   this.capCharge=onePole(.04,sr);this.capDischarge=onePole(.25,sr);
   this.fbHp=1/(1+TAU*90/this.fsOS);
   this.dcR=1-TAU*20/sr;
   this.dlLp=onePole(1/(TAU*3200),sr);
   this.dlSize=Math.ceil(sr*2)+1;this.dlL=new Float32Array(this.dlSize);this.dlR=new Float32Array(this.dlSize);
   this.glitch=new G.Glitch(sr);this.kick=new K.Kick(sr);
   this.drums=new D.Drums(sr);this.formant=new F.Formant(sr);this.reverb=new V.Reverb(sr);this.bassVoice=new B.Bass(sr);
   this.vowelCoef=onePole(.03,sr); // vowels glide, so sequenced steps sound like talking
   this.auto={cutoff:-1,resonance:-1,envMod:-1,decay:-1}; // per-step automation, -1 = follow the knob
   this.reset();
  }
  stepLen(){return this.sr*60/this.tempo/4;}
  // Sequencer steps drive glitch events; when it is stopped a free-running 16th clock does.
  onStep(len){this.glitch.onStep(len,this.target.glitch,S.glitchSlice(this.target.glitchSize));}
  // Four-on-the-floor hit from the sequencer; level 0 = kick off.
  kickHit(){if(this.target.kick>1e-4)this.kick.trigger(this.target.kickDecay);}
  drumHit(hat,clap,snare=0){
   if(hat&&this.target.hat>1e-4)this.drums.hat(hat===2);
   if(clap&&this.target.clap>1e-4)this.drums.clap();
   if(snare&&this.target.snare>1e-4)this.drums.snare(snare===2?.38:1);
  }
  bassOn(note,tied){if(this.target.bass>1e-4)this.bassVoice.on(note,tied);else this.bassVoice.off();}
  bassOff(){this.bassVoice.off();}
  setAuto(id,v){
   if(!(id in this.auto))return;
   this.auto[id]=v;
   if(id==='decay')this.value.decay=v>=0?v:this.target.decay; // read by noteOn, which follows in the same step
  }
  stutter(on){this.glitch.hold(on,this.stepLen(),S.glitchSlice(this.target.glitchSize));}
  reset(){
   this.phase=0;this.pitch=BASE_NOTE;this.targetPitch=BASE_NOTE;
   this.gate=false;this.noteAccent=false;
   this.fenv=0;this.fenvCoef=this.accentDecay;this.veg=0;this.amp=0;this.ampTarget=0;this.cap=0;
   this.s1=this.s2=this.s3=this.s4=0;this.hpX=this.hpY=0;this.prevIn=0;
   this.distPrev=0;this.distLp=0;this.dw=[0,0,0];this.dw[Math.round(this.target.distType*2)]=1;
   this.dcX=this.dcY=0;this.dlW=0;this.dlLpL=this.dlLpR=0;
   this.dlL.fill(0);this.dlR.fill(0);
   this.glitch.reset();this.clock=0;this.kick.reset();
   if(this.layer)this.layer.reset();if(this.mixer)this.mixer.reset();this.drums.reset();this.formant.reset();this.reverb.reset();this.bassVoice.reset();this.stepVowel=-1;
   for(const id in this.auto)this.auto[id]=-1;
   for(const id of SMOOTHED)this.value[id]=this.target[id];
  }
  setParam(id,v){if(id in this.target&&Number.isFinite(v))this.target[id]=Math.min(1,Math.max(0,v));}
  setParams(p){for(const id in p)this.setParam(id,p[id]);}
  // slide=true keeps envelopes running and glides pitch, as a held 303-style slide.
  noteOn(note,accent,slide){
   this.targetPitch=note;
   if(!(slide&&this.gate)){
    this.pitch=note;this.fenv=1;this.veg=1;
    this.fenvCoef=accent?this.accentDecay:t60(S.decaySeconds(this.value.decay),this.sr);
   }
   this.noteAccent=accent===true;this.gate=true;
  }
  noteOff(){this.gate=false;}
  panic(){if(this.sequence)this.sequence.running=false;this.reset();}
  process(outL,outR,n){
   const v=this.value,t=this.target,k=this.smooth,seq=this.sequence,a=this.auto,m=this.mixer;
   const dlLen=Math.min(this.dlSize-1,Math.max(1,Math.round(this.sr*60/this.tempo*.75)));
   v.decay=a.decay>=0?a.decay:t.decay;
   const dType=Math.round(t.distType*2);
   for(let i=0;i<n;i++){
    if(seq&&seq.running)seq.tick(this);
    else if(t.glitch>0&&--this.clock<=0){const L=this.stepLen();this.clock+=L;this.onStep(L);}
    v.tuning+=(t.tuning-v.tuning)*k;v.cutoff+=((a.cutoff>=0?a.cutoff:t.cutoff)-v.cutoff)*k;v.resonance+=((a.resonance>=0?a.resonance:t.resonance)-v.resonance)*k;
    v.formant+=(t.formant-v.formant)*k;v.reverb+=(t.reverb-v.reverb)*k;v.vowel+=((this.stepVowel>=0?this.stepVowel/4:t.vowel)-v.vowel)*this.vowelCoef;
    v.envMod+=((a.envMod>=0?a.envMod:t.envMod)-v.envMod)*k;v.accent+=(t.accent-v.accent)*k;v.drive+=(t.drive-v.drive)*k;
    v.delay+=(t.delay-v.delay)*k;v.volume+=(t.volume-v.volume)*k;v.waveform+=((t.waveform<.5?0:1)-v.waveform)*k;
    v.distortion+=(t.distortion-v.distortion)*k;v.distTone+=(t.distTone-v.distTone)*k;
    const dw=this.dw;dw[0]+=((dType===0?1:0)-dw[0])*k;dw[1]+=((dType===1?1:0)-dw[1])*k;dw[2]+=((dType===2?1:0)-dw[2])*k;
    // Pitch and oscillator.
    this.pitch+=(this.targetPitch-this.pitch)*this.slideCoef;
    const hz=440*Math.pow(2,(this.pitch+(v.tuning-.5)*24-69)/12);
    const dt=Math.min(.45,hz/this.sr);
    this.phase+=dt;if(this.phase>=1)this.phase-=1;
    const p=this.phase;
    const saw=2*p-1-blep(p,dt);
    const p2=p+.5>=1?p-.5:p+.5;
    const sq=(p<.5?1:-1)+blep(p,dt)-blep(p2,dt);
    const osc=saw+(sq*.6-saw)*v.waveform;
    // Envelopes: filter env (MEG), accent sweep capacitor, amp env (VEG).
    this.fenv*=this.fenvCoef;
    const accentOn=this.noteAccent&&this.gate;
    if(accentOn)this.cap+=(this.fenv-this.cap)*this.capCharge;else this.cap-=this.cap*this.capDischarge;
    this.veg*=this.vegDecay;
    this.ampTarget=this.gate?this.veg*(this.noteAccent?1+v.accent*.9:1):0;
    this.amp+=(this.ampTarget-this.amp)*(this.ampTarget>this.amp?this.attackCoef:this.releaseCoef);
    // Cutoff in octaves: env mod adds sweep and lowers the floor; accent adds the capacitor sweep.
    const mod=v.envMod*(this.fenv*4.6-1.1)+this.cap*v.accent*(1.2+v.envMod*2.4);
    let fc=S.cutoffHz(v.cutoff)*Math.pow(2,mod);
    if(fc>16000)fc=16000;if(fc>this.fsOS*.42)fc=this.fsOS*.42;if(fc<20)fc=20;
    const wc=TAU*fc/this.fsOS,g=wc/(1+wc);
    const kRes=v.resonance*4.15;
    // 2x oversampled ladder with linear input interpolation.
    const x=osc*.55;
    let y=0;
    for(let o=0;o<2;o++){
     const xi=o===0?(this.prevIn+x)*.5:x;
     this.hpY=this.fbHp*(this.hpY+this.s4-this.hpX);this.hpX=this.s4;
     const u=sat(xi-kRes*this.hpY);
     this.s1+=g*(u-this.s1);this.s2+=g*(this.s1-this.s2);this.s3+=g*(this.s2-this.s3);this.s4+=g*(this.s3-this.s4);
     y+=this.s4;
    }
    this.prevIn=x;
    y*=.5*this.amp;
    // Drive with loudness compensation, then DC block.
    const dg=1+v.drive*11;
    y=sat(y*1.6*dg)/(1+v.drive*1.8)*.75;
    y=this.formant.process(y,v.vowel*4,v.formant);
    // Distortion pedal: 2x oversampled curves crossfaded by type, tone low-pass, level-matched; bypassed exactly at 0.
    const da=v.distortion,dry=y;
    if(da>1e-5){
     const pg=1+da*da*60,dw=this.dw;
     const d=(shape((this.distPrev+y)*.5*pg,dw[0],dw[1],dw[2])+shape(y*pg,dw[0],dw[1],dw[2]))*.5;
     this.distLp+=(d-this.distLp)*(1-Math.exp(-TAU*S.distToneHz(v.distTone)/this.sr));
     const wet=da*6<1?da*6:1;
     y+=(this.distLp*.42/(1+da*.5)-y)*wet;
    }else this.distLp=0;
    this.distPrev=dry;
    const dc=y-this.dcX+this.dcR*this.dcY;this.dcX=y;this.dcY=dc;y=dc;
    // Glitch (stutter / reverse / tape stop) then bitcrusher; before the delay so echoes repeat the glitches.
    y=this.glitch.process(y,v.crush);
    // Ping-pong delay, dotted eighth.
    let r=this.dlW-dlLen;if(r<0)r+=this.dlSize;
    const dl=this.dlL[r],dr=this.dlR[r];
    this.dlLpL+=(dl-this.dlLpL)*this.dlLp;this.dlLpR+=(dr-this.dlLpR)*this.dlLp;
    this.dlL[this.dlW]=(m?m.delayIn:y)+this.dlLpR*.45;this.dlR[this.dlW]=this.dlLpL*.45;
    if(++this.dlW>=this.dlSize)this.dlW=0;
    const mix=v.delay*.7,vol=v.volume*v.volume*1.3;
    // Kick is mixed after the bass chain (no delay/glitch on it); the bass and its echoes duck under it.
    const kk=this.kick.process(t.kickTune)*t.kick*1.15,duck=this.kick.duckGain(t.duck);
    this.drums.process();
    const hh=this.drums.hatOut*t.hat*.5,cl=this.drums.clapOut*t.clap*.7+this.drums.snareOut*t.snare*.6;
    // Reverb on bass and clap; the kick and hats stay dry. Silent and exactly bypassed at 0.
    const layer=this.layer,ll=this.leadLevel;let xl=0,xr=0,xs=0;
    if(layer){layer.process();xl=layer.l;xr=layer.r;xs=(xl+xr)*.5*layer.send;}
    const send=v.reverb*8<1?v.reverb*8:1;
    this.reverb.process(m?m.reverbIn:(y*ll+cl*.8+xs)*send,t.reverbSize);
    const wet=v.reverb*.9,bs=this.bassVoice.process(t.bassTone,t.bassDecay)*t.bass*.8; // dry and centered, ducked with the lead
    if(m){ // Studio: every channel has its own strip, and the delay and reverb are shared send buses
     m.process(y*ll,xl,xr,bs,kk,this.drums.snareOut*t.snare*.6,hh,this.drums.clapOut*t.clap*.7);
     outL[i]=.95*sat(((m.duckL+dl*.7*m.retD+this.reverb.l*.9*m.retV)*duck+m.dryL)*vol);
     outR[i]=.95*sat(((m.duckR+dr*.7*m.retD+this.reverb.r*.9*m.retV)*duck+m.dryR)*vol);
     continue;
    }
    outL[i]=.95*sat(((y*ll+bs+dl*ll*mix+this.reverb.l*wet+xl)*duck+kk+hh+cl)*vol);
    outR[i]=.95*sat(((y*ll+bs+dr*ll*mix+this.reverb.r*wet+xr)*duck+kk+hh+cl)*vol);
   }
  }
 }
 const api={Engine,BASE_NOTE};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoDSP=api;
})(globalThis);

import './session.js';
import './glitch.js';
import './kick.js';
import './drums.js';
import './formant.js';
import './reverb.js';
import './bass.js';
import './engine.js';
import './beats.js';
import './sequencer.js';
import './orbit-layer.js';
import './mixer.js';
/* One engine, one sequencer: Orbit is a layer of the Acido engine, so the two cannot drift apart. */
class StudioProcessor extends AudioWorkletProcessor{
 constructor(){
  super();
  this.engine=new globalThis.AcidoDSP.Engine(sampleRate);
  this.seq=new globalThis.AcidoSequencer.Sequencer(sampleRate);
  this.layer=new globalThis.LumaOrbitLayer.OrbitLayer(sampleRate);
  this.mixer=new globalThis.LumaMixer.Mixer(sampleRate);
  this.engine.sequence=this.seq;this.engine.layer=this.layer;this.engine.mixer=this.mixer;
  this.meterAt=0;this.meterLive=false;this.meterMsg={type:'meters',peaks:this.mixer.peak};
  this.stepMsg={type:'step',step:-1,pattern:0,section:-1};
  this.port.onmessage=({data:m})=>{
   switch(m.type){
    case 'load':{
     const was=this.seq.running;
     if(was)this.seq.stop(this.engine);
     this.seq.qSec=-1;this.engine.setParams(m.params);this.seq.configure(m);this.engine.tempo=this.seq.tempo;this.seq.select(0);this.layer.transpose=m.transpose;this.layer.setScale(m.scale);
     if(was)this.seq.start(this.engine);
     break;
    }
    case 'param':this.engine.setParam(m.id,m.value);break;
    case 'pattern':this.seq.configure(m);if(Number.isFinite(m.tempo))this.engine.tempo=this.seq.tempo;this.layer.transpose=m.transpose;this.layer.setScale(m.scale);break;
    case 'hold':this.seq.hold(m.id,m.on,this.engine);break;
    case 'section':this.seq.queueSection(m.i);break;
    case 'loop':this.seq.loopSec=m.on===true;break;
    case 'stutter':this.engine.stutter(m.on===true);break;
    case 'octave':this.layer.octave=Math.min(1,Math.max(-1,m.value|0));break;
    case 'phrase':this.layer.setPhrase(m.deg,m.beats);break;
    case 'sound':this.layer.setSound(m.id);break;
    case 'tone':this.layer.setTone(m.value);break;
    case 'strip':this.mixer.setStrip(m.i,m);break;
    case 'returns':this.mixer.setReturns(m.delay,m.reverb);break;
    case 'orbit':this.layer.level=m.value;break;
    case 'lead':this.engine.leadLevel=m.value;break;
    case 'play':this.seq.start(this.engine);break;
    case 'stop':this.seq.stop(this.engine);break;
   }
  };
 }
 // About 20 meter updates per second, and one last update when everything is silent.
 meter(l,r){
  const p=this.mixer.peak,M=globalThis.LumaMixer.MASTER;
  for(let i=0;i<l.length;i++){const a=Math.abs(l[i]),b=Math.abs(r[i]);if(a>p[M])p[M]=a;if(b>p[M])p[M]=b;}
  this.meterAt+=l.length;if(this.meterAt<sampleRate/20)return;this.meterAt=0;
  let live=false;for(let i=0;i<p.length;i++)if(p[i]>1e-4)live=true;
  if(live||this.meterLive)this.port.postMessage(this.meterMsg);
  this.meterLive=live;p.fill(0);
 }
 process(inputs,outputs){
  const out=outputs[0];
  if(out?.length>=2){this.engine.process(out[0],out[1],out[0].length);this.meter(out[0],out[1]);}
  if(this.seq.changed){this.seq.changed=false;this.stepMsg.step=this.seq.lastFired;this.stepMsg.pattern=this.seq.lastPat;this.stepMsg.section=this.seq.songActive()?this.seq.secI:-1;this.port.postMessage(this.stepMsg);}
  return true;
 }
}
registerProcessor('luma-studio',StudioProcessor);

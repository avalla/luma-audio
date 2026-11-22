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
/* One engine, one sequencer: Orbit is a layer of the Acido engine, so the two cannot drift apart. */
class StudioProcessor extends AudioWorkletProcessor{
 constructor(){
  super();
  this.engine=new globalThis.AcidoDSP.Engine(sampleRate);
  this.seq=new globalThis.AcidoSequencer.Sequencer(sampleRate);
  this.layer=new globalThis.LumaOrbitLayer.OrbitLayer(sampleRate);
  this.engine.sequence=this.seq;this.engine.layer=this.layer;
  this.stepMsg={type:'step',step:-1,pattern:0,section:-1};
  this.port.onmessage=({data:m})=>{
   switch(m.type){
    case 'load':{
     const was=this.seq.running;
     if(was)this.seq.stop(this.engine);
     this.engine.setParams(m.params);this.seq.configure(m);this.engine.tempo=this.seq.tempo;this.seq.select(0);this.layer.setScale(m.scale);
     if(was)this.seq.start(this.engine);
     break;
    }
    case 'param':this.engine.setParam(m.id,m.value);break;
    case 'pattern':this.seq.configure(m);if(Number.isFinite(m.tempo))this.engine.tempo=this.seq.tempo;break;
    case 'phrase':this.layer.setPhrase(m.deg,m.beats);break;
    case 'sound':this.layer.setSound(m.id);break;
    case 'tone':this.layer.setTone(m.value);break;
    case 'send':this.layer.send=m.value;break;
    case 'orbit':this.layer.level=m.value;break;
    case 'lead':this.engine.leadLevel=m.value;break;
    case 'play':this.seq.start(this.engine);break;
    case 'stop':this.seq.stop(this.engine);break;
   }
  };
 }
 process(inputs,outputs){
  const out=outputs[0];
  if(out?.length>=2)this.engine.process(out[0],out[1],out[0].length);
  if(this.seq.changed){this.seq.changed=false;this.stepMsg.step=this.seq.lastFired;this.stepMsg.pattern=this.seq.lastPat;this.stepMsg.section=this.seq.songActive()?this.seq.secI:-1;this.port.postMessage(this.stepMsg);}
  return true;
 }
}
registerProcessor('luma-studio',StudioProcessor);

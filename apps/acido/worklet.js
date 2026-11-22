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
class AcidoProcessor extends AudioWorkletProcessor{
 constructor(){
  super();
  this.engine=new globalThis.AcidoDSP.Engine(sampleRate);
  this.seq=new globalThis.AcidoSequencer.Sequencer(sampleRate);
  this.engine.sequence=this.seq;this.stepMsg={type:'step',step:-1,pattern:0,queued:-1,section:-1};
  this.port.onmessage=({data:m})=>{
   switch(m.type){
    case 'param':this.engine.setParam(m.id,m.value);break;
    case 'params':this.engine.setParams(m.params);break;
    case 'pattern':this.seq.configure(m);if(Number.isFinite(m.tempo))this.engine.tempo=this.seq.tempo;break;
    case 'auto':this.seq.setAuto(m.pattern,m.step,m.id,m.value);break;
    case 'hold':this.seq.hold(m.id,m.on,this.engine);break;
    case 'select':this.seq.select(m.index);break;
    case 'play':this.seq.start(this.engine);break;
    case 'stop':this.seq.stop(this.engine);break;
    case 'on':this.engine.noteOn(m.note,m.accent===true,m.slide===true);break;
    case 'off':this.engine.noteOff();break;
    case 'bassOn':this.engine.bassOn(m.note,false);break;
    case 'bassOff':this.engine.bassOff();break;
    case 'stutter':this.engine.stutter(m.on===true);break;
    case 'panic':this.engine.panic();this.seq.lastFired=-1;this.seq.changed=true;break;
   }
  };
 }
 process(inputs,outputs){
  const out=outputs[0];
  if(out?.length>=2)this.engine.process(out[0],out[1],out[0].length);
  if(this.seq.changed){this.seq.changed=false;this.stepMsg.step=this.seq.lastFired;this.stepMsg.pattern=this.seq.lastPat;this.stepMsg.queued=this.seq.queued;this.stepMsg.section=this.seq.songActive()?this.seq.secI:-1;this.port.postMessage(this.stepMsg);}
  return true;
 }
}
registerProcessor('acido',AcidoProcessor);

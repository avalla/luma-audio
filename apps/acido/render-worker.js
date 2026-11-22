/* Renders the WAV off the main thread so the interface and live audio keep running. */
importScripts('session.js','glitch.js','kick.js','drums.js','formant.js','reverb.js','bass.js','engine.js','sequencer.js','render.js');
self.onmessage=({data})=>{
 try{
  const state=self.AcidoSession.validate(data.state);
  const {L,R,sampleRate}=self.AcidoRender.renderState(state,{sampleRate:data.sampleRate,loops:data.loops,onProgress:p=>self.postMessage({type:'progress',value:p})});
  const wav=self.AcidoRender.encodeWav(L,R,sampleRate);
  self.postMessage({type:'done',wav},[wav]);
 }catch(err){self.postMessage({type:'error',message:err.message});}
};

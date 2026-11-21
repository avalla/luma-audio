/* Offline render with the same engine and sequencer used live, plus a 24-bit WAV encoder. DOM-free. */
(function(root){
 const node=typeof module!=='undefined'&&module.exports;
 const {Engine}=node?require('./engine.js'):root.AcidoDSP;
 const {Sequencer}=node?require('./sequencer.js'):root.AcidoSequencer;
 const MAX_SECONDS=600,TAIL=2,FADE=.02,BLOCK=128;
 function musicFrames(state,loops,sr){
  const order=state.song?.on?state.song.sections.flatMap(x=>Array.from({length:x.repeat},()=>x.patterns).flat()):state.chain.length?state.chain:[state.current];
  const steps=order.reduce((n,p)=>n+state.patterns[p].length,0)*loops;
  const unit=sr*60/state.tempo/4;
  let total=0;
  for(let c=0;c<steps;c++)total+=unit*2*(c%2===0?state.swing:1-state.swing);
  return Math.round(total);
 }
 function renderState(state,{sampleRate=48000,loops=4,onProgress}={}){
  const music=musicFrames(state,loops,sampleRate),frames=music+Math.round(TAIL*sampleRate);
  if(frames>MAX_SECONDS*sampleRate)throw new Error('TOO_LONG');
  const e=new Engine(sampleRate),q=new Sequencer(sampleRate);e.sequence=q;
  e.setParams(state.params);q.configure({...state,patterns:JSON.parse(JSON.stringify(state.patterns))});q.select(state.current);
  e.tempo=q.tempo;e.reset();q.start(e);
  const L=new Float32Array(frames),R=new Float32Array(frames);
  let done=0,nextReport=sampleRate;
  while(done<frames){
   let n=Math.min(BLOCK,frames-done);
   if(done<music)n=Math.min(n,music-done);
   e.process(L.subarray(done,done+n),R.subarray(done,done+n),n);
   done+=n;
   if(done===music)q.stop(e);
   if(onProgress&&done>=nextReport){nextReport+=sampleRate;onProgress(done/frames);}
  }
  const fade=Math.round(FADE*sampleRate);
  for(let i=0;i<fade;i++){const g=i/fade,k=frames-1-i;L[k]*=g;R[k]*=g;}
  return {L,R,sampleRate};
 }
 function encodeWav(L,R,sampleRate){
  const data=L.length*6,buf=new ArrayBuffer(44+data),v=new DataView(buf);
  const tag=(o,s)=>{for(let i=0;i<4;i++)v.setUint8(o+i,s.charCodeAt(i));};
  tag(0,'RIFF');v.setUint32(4,36+data,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*6,true);
  v.setUint16(32,6,true);v.setUint16(34,24,true);tag(36,'data');v.setUint32(40,data,true);
  let o=44;
  for(let i=0;i<L.length;i++)for(const x of [L[i],R[i]]){
   const s=Math.round(Math.min(1,Math.max(-1,x))*8388607);
   v.setUint8(o++,s&255);v.setUint8(o++,s>>8&255);v.setUint8(o++,s>>16&255);
  }
  return buf;
 }
 const api={renderState,encodeWav,musicFrames,MAX_SECONDS};
 if(node)module.exports=api;else root.AcidoRender=api;
})(globalThis);

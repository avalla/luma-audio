/* Orbit as a voice inside the Acido engine, so both share one sample clock, one reverb and one sidechain.
   process() and step() do not allocate. Phrases are prepared on the main thread by buildTimeline. */
(function(root){
 const TAU=Math.PI*2,SIZE=2048,VOICES=8,MAKEUP=8; // makeup: at the default fader Orbit sits about 7 dB under the Acido lead
 // Harmonic amplitudes and [attack, decay] in seconds, matching the Orbit timbres.
 const TIMBRES={glass:[[1],.006,.5],rubber:[[1,0,-1/9,0,1/25],.006,.19],mist:[[1,.5,.33,.25,.2,.17,.14,.12],.08,.75],keys:[[.75,.25],.006,.5],bell:[[1,.5,0,.3,0,.2],.006,1.2],organ:[[.55,.3,.15],.015,1],velvet:[[.8,0,.2],.12,1.4],prism:[[.6,.25,0,.15],.006,.7]};
 const SOUNDS=Object.keys(TIMBRES);
 const TABLES=SOUNDS.map(id=>{
  const h=TIMBRES[id][0],t=new Float32Array(SIZE+1);let peak=0;
  for(let i=0;i<SIZE;i++){let x=0;for(let n=0;n<h.length;n++)x+=h[n]*Math.sin(TAU*(n+1)*i/SIZE);t[i]=x;peak=Math.max(peak,Math.abs(x));}
  for(let i=0;i<SIZE;i++)t[i]/=peak;t[SIZE]=t[0];return t;
 });
 class OrbitLayer{
  constructor(sr){
   this.sr=sr;this.on=new Uint8Array(VOICES);this.phase=new Float64Array(VOICES);this.inc=new Float64Array(VOICES);this.env=new Float64Array(VOICES);
   this.peak=new Float64Array(VOICES);this.rise=new Float64Array(VOICES);this.fall=new Float64Array(VOICES);this.rising=new Uint8Array(VOICES);this.table=TABLES[0];
   this.deg=new Int8Array(0);this.beats=new Uint8Array(0);this.pitches=new Int16Array(8);this.pcs=new Int8Array(12);this.nPcs=0;
   this.level=.7;this.send=.25;this.transpose=0;this.octave=0;this.sound=0;this.lp=1;this.lpL=0;this.lpR=0;this.l=0;this.r=0;this.next=0;this.root=-1;
   this.fast=Math.exp(-6.9/(.012*sr));this.setTone(.6);
  }
  setTone(v){const fc=Math.min(this.sr*.45,300+v*v*12000);this.lp=1-Math.exp(-TAU*fc/this.sr);}
  setSound(id){const i=SOUNDS.indexOf(id);if(i>=0){this.sound=i;this.table=TABLES[i];}}
  // scale: pitch classes starting from the tonic.
  setScale(scale){
   const n=Math.min(12,scale.length);this.nPcs=n;for(let i=0;i<n;i++)this.pcs[i]=scale[i];
   let last=60+scale[0];if(last>66)last-=12;this.pitches[0]=last;
   for(let d=1;d<8;d++){const pc=scale[d%n],up=((pc-last%12)%12+12)%12;last+=up||12;this.pitches[d]=last;}
  }
  setPhrase(deg,beats){this.deg=deg;this.beats=beats;}
  restart(){this.root=-1;}
  stop(){for(let i=0;i<VOICES;i++)if(this.on[i]){this.rising[i]=0;this.fall[i]=this.fast;}}
  reset(){this.on.fill(0);this.env.fill(0);this.lpL=this.lpR=this.l=this.r=0;this.root=-1;}
  // Strong pulses move to the nearest note of the chord built on the current bass note.
  chordTone(p){
   if(this.root<0||!this.nPcs)return p;
   let at=-1;for(let i=0;i<this.nPcs;i++)if(this.pcs[i]===this.root){at=i;break;}
   if(at<0)return p;
   const a=this.pcs[at],b=this.pcs[(at+2)%this.nPcs],c=this.pcs[(at+4)%this.nPcs];
   for(let d=0;d<7;d++){
    for(let s=0;s<2;s++){const x=s?p+d:p-d,pc=(x%12+12)%12;if(pc===a||pc===b||pc===c)return x;}
   }
   return p;
  }
  // Called by the sequencer on every step: one Orbit pulse is two steps.
  step(count,len,s,muted){
   if(s&&s.bass>=0)this.root=((36+(s.bassOct||0)*12+s.bass+this.transpose)%12+12)%12;
   if(count%2)return;
   const n=this.deg.length;if(!n)return;
   const pulse=(count/2)%n,d=this.deg[pulse];
   if(d<0||muted)return;
   const base=this.pitches[d],strong=pulse%4===0;
   this.noteOn((strong?this.chordTone(base):base)+this.octave*12,strong?.23:.12,this.beats[pulse]>1?1.4:1);
  }
  noteOn(pitch,gain,hold){
   const i=this.next;this.next=(i+1)%VOICES;
   const def=TIMBRES[SOUNDS[this.sound]];
   this.on[i]=1;this.rising[i]=1;this.phase[i]=0;this.inc[i]=440*Math.pow(2,(pitch-69)/12)/this.sr*SIZE;this.peak[i]=gain;
   this.rise[i]=gain/Math.max(1,def[1]*this.sr);this.fall[i]=Math.exp(Math.log(1e-4)/(def[2]*hold*this.sr));
  }
  process(){
   let a=0,b=0;
   const tab=this.table;
   for(let i=0;i<VOICES;i++){
    if(!this.on[i])continue;
    let p=this.phase[i]+this.inc[i];if(p>=SIZE)p-=SIZE;this.phase[i]=p;
    const k=p|0,f=p-k,x=(tab[k]+(tab[k+1]-tab[k])*f)*this.env[i];
    if(i%2){a+=x*.82;b+=x*.58;}else{a+=x*.58;b+=x*.82;}
    if(this.rising[i]){this.env[i]+=this.rise[i];if(this.env[i]>=this.peak[i]){this.env[i]=this.peak[i];this.rising[i]=0;}}
    else{this.env[i]*=this.fall[i];if(this.env[i]<1e-5){this.env[i]=0;this.on[i]=0;}}
   }
   this.lpL+=(a-this.lpL)*this.lp;this.lpR+=(b-this.lpR)*this.lp;
   this.l=this.lpL*this.level*MAKEUP;this.r=this.lpR*this.level*MAKEUP;
  }
 }
 const rng=seed=>{let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
 // Flattens evolving Orbit phrases into one loop of pulses (-1 = silent), aligned to whole bars of eight pulses.
 function buildTimeline(flow,{notes,amount,seed,phrases=8}){
  const r=rng(seed),deg=[],beats=[],locks=Array(8).fill(false);
  let current=[...notes];
  for(let n=0;n<phrases;n++){
   const next=flow.createPhrase(current,locks,amount,r);current=next.notes;
   for(const e of next.events){deg.push(e.rest?-1:current[e.index]);beats.push(e.beats);for(let j=1;j<e.beats;j++){deg.push(-1);beats.push(1);}}
   while(deg.length%8){deg.push(-1);beats.push(1);}
  }
  return {deg:Int8Array.from(deg),beats:Uint8Array.from(beats)};
 }
 const api={OrbitLayer,SOUNDS,buildTimeline};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LumaOrbitLayer=api;
})(globalThis);

/* Turns the current Orbit phrase into an Acido session link. One Orbit pulse (an eighth) is two Acido steps.
   The session travels in the URL fragment, which browsers never send to a server. */
(function(root){
 const SCALES={minor:[57,59,60,62,64,65,67,69],major:[60,62,64,65,67,69,71,72],pentatonic:[57,60,62,64,67,69,72,74]};
 const STEPS=16,MAX_PATTERNS=32;
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const blank=()=>({note:0,gate:false,accent:false,slide:false,octave:0,hat:0,clap:false,bass:-1,bassOct:0,bassTie:false});
 // Acido stores a pitch as an octave (-1..1) plus a note (0..12) around MIDI 36.
 const place=p=>{const n=p-36,octave=n<0?-1:n>=12?1:0;return {note:n-12*octave,octave};};
 function convert(p){
  const c=p.controls,scale=SCALES[p.scale],pulses=p.phrase.reduce((n,e)=>n+e.beats,0),total=pulses*2,steps=Array.from({length:total},blank);
  let pulse=0,accent=0;
  for(const e of p.phrase){
   if(!e.rest){
    // Tuning +12 puts the line one octave under Orbit, the register of an acid bassline.
    const pitch=place(scale[p.notes[e.index]]-24),held=e.beats*2-1,at=pulse*2,strong=accent%c['accent-length']===0;
    for(let j=0;j<held;j++){
     const s=steps[at+j];s.note=pitch.note;s.octave=pitch.octave;s.gate=true;s.slide=j<held-1;s.accent=j===0&&strong;
     if(c.bass>0){s.bass=pitch.note;s.bassOct=pitch.octave;s.bassTie=j<held-1;}
    }
   }
   pulse+=e.beats;accent+=e.beats;
  }
  const kicks=Array(total).fill(false);
  if(p.drumsEnabled)for(let i=0;i<pulses;i++){
   const h=p.drumPattern[i%16],s=steps[i*2];
   kicks[i*2]=h.kick&&p.drumEnabled.kick;
   s.hat=h.hat&&p.drumEnabled.hat?1:0;s.clap=h.clap&&p.drumEnabled.clap;
  }
  const patterns=[];
  for(let at=0;at<total&&patterns.length<MAX_PATTERNS;at+=STEPS){
   const part=steps.slice(at,at+STEPS),length=part.length;
   while(part.length<STEPS)part.push(blank());
   patterns.push({l:length,k:Array.from({length:STEPS},(_,i)=>+(kicks[at+i]===true)),u:{},s:part.map(s=>[s.note,+s.gate,+s.accent,+s.slide,s.octave,0,s.hat,+s.clap,-1,s.bass,s.bassOct,+s.bassTie,0])});
  }
  const drums=c['drum-volume']/100;
  return {v:2,n:'Orbit',t:Math.round(clamp(c.bpm,60,200)),w:clamp(.5+c.swing/100*.25,.5,.75),c:0,h:patterns.length>1?patterns.map((_,i)=>i):[],g:{on:false,sections:[]},a:patterns,
   p:{tuning:1,cutoff:clamp(.2+c.tone/100*.55,0,1),resonance:.5,envMod:.45,decay:.35,accent:.55,drive:.2,delay:c['delay-mix']/100*.7,reverb:c['room-mix']/100*.6,reverbSize:c['room-size']/100,glitch:c.fragmentation/100*.5,bass:c.bass>0?clamp(.3+c.bass/100*.5,0,1):0,kick:clamp(drums*1.3,0,1),hat:clamp(drums*.9,0,1),clap:clamp(drums*.9,0,1),fill:.35}};
 }
 async function encode(payload){
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  const out=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  let s='';for(const b of out)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 function target(loc){return ['localhost','127.0.0.1'].includes(loc.hostname)?`${loc.protocol}//${loc.hostname}:8767/`:'https://acido.avalla.dev/';}
 async function link(preset,loc){return `${target(loc)}#s=${await encode(convert(preset))}`;}
 const api={convert,encode,link,target};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.OrbitToAcido=api;
})(globalThis);

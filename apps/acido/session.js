/* Single source of parameters, patterns and validation. Values are normalized 0..1 so they map 1:1 to plugin parameters later. */
(function(root){
 const params=[
  {id:'tuning',label:'Tuning',value:.5,format:v=>`${v>=.5?'+':''}${((v-.5)*24).toFixed(1)} st`},
  {id:'cutoff',label:'Cutoff',value:.32,format:v=>`${Math.round(cutoffHz(v))} Hz`},
  {id:'resonance',label:'Reso',value:.72,format:pct},
  {id:'envMod',label:'Env Mod',value:.55,format:pct},
  {id:'decay',label:'Decay',value:.35,format:v=>`${Math.round(decaySeconds(v)*1000)} ms`},
  {id:'accent',label:'Accent',value:.65,format:pct},
  {id:'drive',label:'Drive',value:.25,format:pct},
  {id:'delay',label:'Delay',value:.18,format:pct},
  {id:'volume',label:'Volume',value:.75,format:pct},
  {id:'waveform',label:'Wave',value:0,format:v=>v<.5?'Saw':'Square'},
  {id:'distortion',label:'Dist',value:0,format:pct},
  {id:'distTone',label:'Tone',value:.55,format:v=>`${(distToneHz(v)/1000).toFixed(1)} kHz`},
  {id:'distType',label:'Carattere',value:0,format:v=>DIST_TYPES[Math.round(v*2)]},
  {id:'crush',label:'Crush',value:0,format:v=>v<1e-3?'off':`${Math.round(16-v*13)} bit ÷${Math.round(Math.pow(2,v*5))}`},
  {id:'glitch',label:'Glitch',value:0,format:pct},
  {id:'glitchSize',label:'Size',value:.4,format:v=>SLICE_NAMES[Math.round(v*4)]},
  {id:'kick',label:'Kick',value:.75,format:v=>v<1e-3?'off':pct(v)},
  {id:'kickTune',label:'Tune',value:.35,format:v=>`${Math.round(40+v*30)} Hz`},
  {id:'kickDecay',label:'Coda',value:.35,format:v=>`${Math.round((.15+v*.65)*1000)} ms`},
  {id:'duck',label:'Duck',value:.45,format:pct},
  {id:'formant',label:'Formant',value:0,format:v=>v<1e-3?'off':pct(v)},
  {id:'vowel',label:'Vocale',value:0,format:v=>VOWEL_NAMES[Math.round(v*4)]},
  {id:'reverb',label:'Reverb',value:0,format:v=>v<1e-3?'off':pct(v)},
  {id:'reverbSize',label:'Room',value:.5,format:pct},
  {id:'hat',label:'Hat',value:.55,format:v=>v<1e-3?'off':pct(v)},
  {id:'clap',label:'Clap',value:.5,format:v=>v<1e-3?'off':pct(v)},
  {id:'snare',label:'Snare',value:.6,format:v=>v<1e-3?'off':pct(v)},
  {id:'fill',label:'Fill',value:0,format:v=>v<1e-3?'off':pct(v)},
  {id:'bass',label:'Bass',value:.65,format:v=>v<1e-3?'off':pct(v)},
  {id:'bassTone',label:'Tone',value:.3,format:v=>`${Math.round(80*Math.pow(2,v*5))} Hz`},
  {id:'bassDecay',label:'Decay',value:.45,format:v=>`${Math.round((.15+v*1.85)*1000)} ms`}
 ];
 const VOWEL_NAMES='AEIOU';
 const AUTO_PARAMS=['cutoff','resonance','envMod','decay'];
 const SLICE_NAMES=['1/16','1/32','1/64','1/128','1/256'];
 // Stutter slice as a fraction of one 16th step.
 function glitchSlice(v){return Math.pow(2,-Math.round(Math.min(1,Math.max(0,v))*4));}
 function distToneHz(v){return 800*Math.pow(2,v*3.9);}
 function pct(v){return `${Math.round(v*100)}%`;}
 function cutoffHz(v){return 60*Math.pow(2,v*6.4);}
 function decaySeconds(v){return .2+v*v*2.3;}
 const defaults=Object.fromEntries(params.map(p=>[p.id,p.value]));
 const DIST_TYPES=['Overdrive','Pedale','Fuzz'];
 const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B','C\''];
 const STEPS=16,BANK=8,BANKS=4,PATTERNS=BANK*BANKS,MAX_CHAIN=32,MAX_SECTIONS=16,MAX_SECTION_PATTERNS=128;
 const LETTERS='ABCDEFGH';
 // Bank 1 keeps the historic names A..H; the others are A2..H4.
 const PATTERN_NAMES=Array.from({length:PATTERNS},(_,i)=>LETTERS[i%BANK]+(i<BANK?'':Math.floor(i/BANK)+1));
 const MUTES=['lead','bass','kick','hat','clap','snare'];
 const GATE_NAMES=['normale','corta','lunga'];
 const step=(note=0,{gate=true,accent=false,slide=false,octave=0,gateLen=0,hat=0,clap=false,vowel=-1,bass=-1,bassOct=0,bassTie=false,snare=0}={})=>({note,gate,accent,slide,octave,gateLen,hat,clap,vowel,bass,bassOct,bassTie,snare});
 const rest=()=>step(0,{gate:false});
 const emptyPattern=()=>({length:STEPS,steps:Array.from({length:STEPS},rest),auto:{},kicks:null});

 function clamp01(v,fallback){return Number.isFinite(v)?Math.min(1,Math.max(0,v)):fallback;}
 function validStep(s){
  if(!s||typeof s!=='object')return rest();
  const note=Number.isInteger(s.note)?Math.min(12,Math.max(0,s.note)):0;
  const octave=[-1,0,1].includes(s.octave)?s.octave:0;
  const gateLen=[0,1,2].includes(s.gateLen)?s.gateLen:0;
  const hat=[0,1,2].includes(s.hat)?s.hat:0;
  const vowel=Number.isInteger(s.vowel)&&s.vowel>=0&&s.vowel<VOWEL_NAMES.length?s.vowel:-1;
  const bass=Number.isInteger(s.bass)&&s.bass>=0&&s.bass<=12?s.bass:-1;
  const bassOct=[-1,0,1].includes(s.bassOct)?s.bassOct:0;
  return {note,gate:s.gate===true,accent:s.accent===true,slide:s.slide===true,octave,gateLen,hat,clap:s.clap===true,vowel,bass,bassOct,bassTie:bass>=0&&s.bassTie===true,snare:[0,1,2].includes(s.snare)?s.snare:0};
 }
 // Automation: one lane per parameter, null = the step follows the knob. Empty lanes are dropped.
 function validAuto(a){
  const out={};
  if(!a||typeof a!=='object')return out;
  for(const id of AUTO_PARAMS){
   if(!Array.isArray(a[id]))continue;
   const lane=Array.from({length:STEPS},(_,i)=>Number.isFinite(a[id][i])?Math.min(1,Math.max(0,a[id][i])):null);
   if(lane.some(v=>v!==null))out[id]=lane;
  }
  return out;
 }
 function validPattern(p){
  if(!p||typeof p!=='object')return emptyPattern();
  const steps=Array.isArray(p.steps)?p.steps:[];
  return {length:Number.isInteger(p.length)?Math.min(STEPS,Math.max(1,p.length)):STEPS,steps:Array.from({length:STEPS},(_,i)=>validStep(steps[i])),auto:validAuto(p.auto),kicks:Array.isArray(p.kicks)?Array.from({length:STEPS},(_,i)=>p.kicks[i]===true):null};
 }
 // Song: ordered sections, each a list of patterns with repeats and part mutes.
 function validSong(song){
  const out={on:false,sections:[]};
  if(!song||typeof song!=='object'||!Array.isArray(song.sections))return out;
  for(const x of song.sections.slice(0,MAX_SECTIONS)){
   if(!x||typeof x!=='object'||!Array.isArray(x.patterns))continue;
   const list=x.patterns.filter(i=>Number.isInteger(i)&&i>=0&&i<PATTERNS).slice(0,MAX_SECTION_PATTERNS);
   if(!list.length)continue;
   const mute={};for(const id of MUTES)mute[id]=x.mute?.[id]===true;
   out.sections.push({name:typeof x.name==='string'?x.name.slice(0,24):'',patterns:list,repeat:Number.isInteger(x.repeat)?Math.min(16,Math.max(1,x.repeat)):1,mute});
  }
  out.on=song.on===true&&out.sections.length>0;
  return out;
 }
 function validate(state){
  if(!state||typeof state!=='object')throw new Error('Stato non valido');
  const out={name:typeof state.name==='string'?state.name.slice(0,40):'',params:{...defaults},tempo:124,swing:.5,current:0,chain:[],patterns:[],song:{on:false,sections:[]}};
  const p=state.params&&typeof state.params==='object'?state.params:{};
  for(const id of Object.keys(defaults))out.params[id]=clamp01(p[id],defaults[id]);
  if(Number.isFinite(state.tempo))out.tempo=Math.round(Math.min(200,Math.max(60,state.tempo)));
  if(Number.isFinite(state.swing))out.swing=Math.min(.75,Math.max(.5,state.swing));
  // Version 1 had a single pattern stored as {length, steps}: it becomes pattern A.
  const src=Array.isArray(state.patterns)?state.patterns:Array.isArray(state.steps)?[{length:state.length,steps:state.steps}]:[];
  for(let i=0;i<PATTERNS;i++)out.patterns.push(validPattern(src[i]));
  if(Number.isInteger(state.current)&&state.current>=0&&state.current<PATTERNS)out.current=state.current;
  if(Array.isArray(state.chain))out.chain=state.chain.filter(i=>Number.isInteger(i)&&i>=0&&i<PATTERNS).slice(0,MAX_CHAIN);
  out.song=validSong(state.song);
  return out;
 }
 // "A A2 B H4" <-> [0,8,1,31]. Unknown characters are ignored; a letter alone is bank 1.
 function parseChain(text,max=MAX_CHAIN){return[...String(text).toUpperCase().matchAll(/([A-H])([1-4])?/g)].map(x=>LETTERS.indexOf(x[1])+BANK*((+x[2]||1)-1)).slice(0,max);}
 function formatChain(chain){return chain.map(i=>PATTERN_NAMES[i]).join(' ');}
 // Deterministic RNG so a seed reproduces the same random pattern.
 function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 const SCALES={minor:[0,3,5,7,10,12],phrygian:[0,1,3,5,7,8,10,12]};
 function randomPattern(seed,scale='minor'){
  const r=rng(seed),notes=SCALES[scale]||SCALES.minor,steps=[];
  for(let i=0;i<STEPS;i++){
   const downbeat=i%4===0;
   const gate=r()<(downbeat?.92:.7);
   const note=r()<.45?0:notes[Math.floor(r()*notes.length)];
   const o=r();
   const slide=gate&&r()<.22,g=r();
   steps.push(step(note,{gate,accent:gate&&r()<(downbeat?.45:.22),slide,octave:o<.15?1:o<.25?-1:0,gateLen:slide?0:g<.15?1:g<.25?2:0}));
  }
  return steps;
 }
 const s=step,R=rest;
 const presets=[
  {name:'Squelch classico',params:{...defaults},tempo:124,swing:.56,patterns:[
   {length:16,steps:[s(0,{accent:true}),s(0),s(12,{slide:true}),s(0),R(),s(0,{accent:true}),s(3,{slide:true}),s(5),s(0),s(0,{octave:1,accent:true}),R(),s(7,{slide:true}),s(10),s(0,{accent:true}),s(3,{octave:1,slide:true}),s(0)]},
   {length:16,steps:[s(0,{accent:true,gateLen:2}),R(),s(0,{gateLen:1}),s(12,{slide:true}),s(10),s(0,{accent:true,gateLen:1}),s(0,{gateLen:1}),s(3,{octave:1,slide:true}),s(5,{octave:1}),s(0,{accent:true}),R(),s(7,{gateLen:1}),s(7,{octave:1,accent:true,slide:true}),s(5,{octave:1}),s(3,{slide:true}),s(0,{gateLen:2})]}
  ]},
  {name:'Rave gommoso',params:{...defaults,cutoff:.22,resonance:.85,envMod:.75,decay:.5,accent:.8,drive:.55,delay:.25},tempo:134,length:16,steps:[s(0,{accent:true,slide:true}),s(0),s(0,{octave:1}),s(0,{slide:true}),s(1),s(0,{accent:true}),R(),s(0,{octave:-1,slide:true}),s(0),s(8,{accent:true,slide:true}),s(7),s(0),s(0,{octave:1,accent:true}),s(0,{slide:true}),s(3),R()]},
  {name:'Quadra profonda',params:{...defaults,waveform:1,cutoff:.18,resonance:.6,envMod:.45,decay:.65,accent:.5,drive:.15,delay:.35},tempo:118,length:16,steps:[s(0,{octave:-1,accent:true}),R(),s(0,{octave:-1}),s(7,{slide:true}),s(5),R(),s(0,{octave:-1,accent:true}),s(3,{slide:true}),s(0),R(),s(10,{octave:-1,slide:true}),s(0),s(0,{accent:true}),R(),s(5,{slide:true}),s(3)]},
  {name:'Glitch rotto',params:{...defaults,cutoff:.3,resonance:.78,envMod:.6,decay:.25,accent:.7,drive:.35,delay:.15,distortion:.35,distType:1,distTone:.6,crush:.28,glitch:.32,glitchSize:.5},tempo:140,swing:.54,patterns:[{length:16,steps:[s(0,{accent:true,gateLen:1}),s(0,{gateLen:1}),s(12,{slide:true}),s(10),s(0,{accent:true}),R(),s(3,{gateLen:1}),s(3,{octave:1,gateLen:1}),s(0,{accent:true,slide:true}),s(7),s(0,{gateLen:2}),R(),s(0,{octave:1,accent:true,gateLen:1}),s(1,{slide:true}),s(0),s(12,{gateLen:1})]}]},
  {name:'Pedale acido',params:{...defaults,cutoff:.26,resonance:.8,envMod:.65,decay:.3,accent:.75,drive:.1,delay:.2,distortion:.7,distTone:.45,distType:.5},tempo:128,length:16,steps:[s(0,{accent:true}),s(0,{slide:true}),s(12),s(0),s(3,{accent:true,slide:true}),s(5),R(),s(0,{octave:1}),s(0,{accent:true}),s(7,{slide:true}),s(10),s(0),s(0,{octave:1,accent:true,slide:true}),s(3,{octave:1}),s(0),s(5,{slide:true})]}
 ];
 // Preset drum groove: off-beat open hat, closed 16ths, clap on 2 and 4.
 function groove(p){
  for(const x of p.patterns){
   if(!x.steps.some(st=>st.gate))continue;
   x.steps.forEach((st,i)=>{st.hat=i%4===2?2:i%2===1?1:0;st.clap=i%8===4;});
  }
  p.params.fill=.4;
  return p;
 }
 const api={params,defaults,AUTO_PARAMS,VOWEL_NAMES,NOTE_NAMES,DIST_TYPES,STEPS,BANK,BANKS,PATTERNS,PATTERN_NAMES,MUTES,MAX_SECTIONS,MAX_SECTION_PATTERNS,GATE_NAMES,validate,parseChain,formatChain,emptyPattern,randomPattern,cutoffHz,decaySeconds,distToneHz,glitchSlice,presets:presets.map(validate).map(groove),rng};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoSession=api;
})(globalThis);

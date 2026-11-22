/* Drum language: automatic fills played by the sequencer and a seeded beat generator.
   fillIndex and hasDrums run on the audio thread and do not allocate. */
(function(root){
 const SNARE={'.':0,'1':1,'2':2},HAT={'.':0,c:1,o:2};
 const fill=(from,s,k,h)=>{
  const out={from,s:new Uint8Array(16),k:new Uint8Array(16),h:new Uint8Array(16)};
  for(let i=0;i<s.length;i++){out.s[from+i]=SNARE[s[i]];out.k[from+i]=k[i]==='x'?1:0;out.h[from+i]=HAT[h[i]];}
  return out;
 };
 // Short fills take the last beat, long ones the last half bar. Snare: 1 full, 2 ghost.
 const SHORT=[fill(12,'1111','....','...o'),fill(12,'2.11','x...','..c.'),fill(12,'.211','x...','c...'),fill(12,'1.11','..x.','.c..')];
 const LONG=[fill(8,'22221111','x.......','.......o'),fill(8,'1.21.211','..x..x..','.c..c..o'),fill(8,'.2.21212','x..x....','c.c.c...'),fill(8,'1..1..11','.x..x...','c.c.c.co'),fill(8,'2121.111','....x...','....c..o')];
 const FILLS=[...SHORT,...LONG];
 // More Fill means more frequent and longer fills; every eighth bar always gets one.
 function fillIndex(bar,amount,pos){
  if(!(amount>.001))return -1;
  const n=bar+1;
  let long;
  if(n%8===0)long=true;
  else if(n%4===0&&amount>=.25)long=amount>=.6;
  else if(n%2===0&&amount>=.75)long=false;
  else return -1;
  const hash=Math.imul(n,0x9E3779B1)>>>16,i=long?SHORT.length+hash%LONG.length:hash%SHORT.length;
  return pos>=FILLS[i].from?i:-1;
 }
 // Breaks with no drums stay silent: a fill must not appear inside them.
 function hasDrums(p){
  if(!p)return false;
  if(!p.kicks)return true;
  for(let i=0;i<16;i++){const s=p.steps[i];if(p.kicks[i]===true||(s&&(s.hat||s.clap||s.snare)))return true;}
  return false;
 }
 const STYLES={
  techno:{kick:['x...x...x...x...','x...x...x...x.x.','x...x...x..xx...'],snare:['....2.......1..2','.......2....1...','..2.....2...1...'],clap:['....x.......x...'],hat:['..o...o...o...o.','c.o.c.o.c.o.c.oc','ccoccocccco.ccoc']},
  rave:{kick:['x..x..x...x.x...','x..x..x..x..x...','x.x...x..x..x...'],snare:['....1..2....1..2','....1.......1.11','....1..2.2..1...'],clap:['....x.......x...','............x...'],hat:['..o...o...o...o.','c.occ.o.c.occ.oc']},
  breakbeat:{kick:['x.x.......x..x..','x.....x...x.....','x..x......xx....'],snare:['....1..2.2..1...','....1.....2.1..2','....1..2....1.2.'],clap:['................','............x...'],hat:['c.c.c.c.c.c.c.co','c.c.o.c.c.c.o.c.','ccc.ccc.ccc.ccco']},
  jungle:{kick:['x.........x.....','x.x.......x.....','x.....x...x..x..'],snare:['....1..2.2..1.2.','....1.2..2..1..2','..2.1..2.2.21...'],clap:['................'],hat:['ccccccccccccccco','c.ccc.ccc.ccc.co','cc.ccc.ccc.ccc.c']},
  electro:{kick:['x..x..x...x..x..','x.....x.x.....x.','x..x....x.x.....'],snare:['....1.......1...','....1.......1..2','....1..2....1...'],clap:['....x.......x...','................'],hat:['c.c.c.c.c.c.c.c.','ccc.ccc.ccc.ccc.']}
 };
 const STYLE_NAMES=Object.keys(STYLES);
 const rng=seed=>{let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};};
 const pick=(list,r)=>list[Math.floor(r()*list.length)];
 // The seed picks the groove; variation changes small details, so patterns of one song stay related.
 function generate(style,seed,variation=0){
  const def=STYLES[style]||STYLES.techno,base=rng(seed),kickLine=pick(def.kick,base),snareLine=pick(def.snare,base),clapLine=pick(def.clap,base),hatLine=pick(def.hat,base);
  const r=rng(seed+Math.imul(variation+1,7919));
  const kicks=[...kickLine].map(c=>c==='x'),snares=[...snareLine].map(c=>SNARE[c]),claps=[...clapLine].map(c=>c==='x'),hats=[...hatLine].map(c=>HAT[c]);
  if(variation>0){
   const g=[3,9,13][variation%3];snares[g]=snares[g]===0?2:0; // every variation differs from the base
   for(const i of [6,7,10,11,14,15]){ // never the slot changed above
    if(r()<.22&&!kicks[i]&&i%4!==0)kicks[i]=true;
    if(r()<.3&&!snares[i])snares[i]=2;
    if(r()<.25)hats[i]=hats[i]===2?1:hats[i]===0?1:0;
   }
  }
  kicks[0]=true;
  return {kicks,snares,claps,hats};
 }
 function applyDrums(pattern,d){
  pattern.kicks=d.kicks.slice();
  pattern.steps.forEach((s,i)=>{s.hat=d.hats[i];s.clap=d.claps[i];s.snare=d.snares[i];});
  return pattern;
 }
 const api={FILLS,STYLE_NAMES,fillIndex,hasDrums,generate,applyDrums};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoBeats=api;
})(globalThis);

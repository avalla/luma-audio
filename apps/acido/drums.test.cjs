const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./session.js'),B=require('./beats.js'),T=require('./tools.js'),{Engine}=require('./engine.js'),{Sequencer}=require('./sequencer.js'),{renderState}=require('./render.js'),{demos}=require('./demos.js');
const hits=(state,bars)=>{
 const log=[],q=new Sequencer(48000),e={target:{fill:state.params.fill},kickHit(){log.push({t:q.count,k:1});},drumHit(h,c,s){log.push({t:q.count-1,h,c,s});},noteOn(){},noteOff(){},bassOn(){},bassOff(){}};
 q.configure(JSON.parse(JSON.stringify(state)));q.select(state.current);q.start(e);
 while(q.count<bars*16)q.tick(e);
 return {snares:log.filter(x=>x.s).map(x=>x.t),kicks:log.filter(x=>x.k).map(x=>x.t),log};
};
const beat=(fill,mut)=>{const s=S.validate({params:{fill},patterns:[{length:16,steps:Array.from({length:16},(_,i)=>({gate:false,hat:i%2?1:0,clap:i%8===4}))}]});if(mut)mut(s);return s;};
const level=(hit)=>{const e=new Engine(48000);e.setParams({...S.defaults,kick:0,bass:0});hit(e);const L=new Float32Array(9600),R=new Float32Array(9600);e.process(L,R,9600);let x=0;for(const v of L){assert.ok(Number.isFinite(v));x+=v*v;}return Math.sqrt(x/9600);};

test('snare sounds, ghost is quieter, level zero is silent',()=>{
 const full=level(e=>e.drumHit(0,false,1)),ghost=level(e=>e.drumHit(0,false,2));
 assert.ok(full>.01,`${full}`);assert.ok(ghost<full*.6&&ghost>0,`${ghost}`);
 const e=new Engine(48000);e.setParams({...S.defaults,kick:0,bass:0,snare:0});e.drumHit(0,false,1);const L=new Float32Array(4800),R=new Float32Array(4800);e.process(L,R,4800);assert.ok(L.every(v=>Math.abs(v)<1e-6));
});
test('fill off keeps the programmed drums unchanged',()=>{
 const r=hits(beat(0),8);assert.equal(r.snares.length,0);assert.equal(r.kicks.length,32);
});
test('fills land at the end of the phrase and repeat identically',()=>{
 const a=hits(beat(.55),8),b=hits(beat(.55),8);assert.deepEqual(a.log,b.log);
 assert.ok(a.snares.length>0);assert.ok(a.snares.every(t=>t%16>=8),a.snares.join());
 assert.ok(a.snares.some(t=>t>=112),'eighth bar has a fill');assert.ok(a.snares.some(t=>t>=48&&t<64),'fourth bar has a fill');
 assert.ok(!a.snares.some(t=>t<16),'first bar stays clean');
});
test('more fill means more rolls',()=>{assert.ok(hits(beat(1),16).snares.length>hits(beat(.1),16).snares.length);});
test('a drumless break stays silent and section mutes silence fills',()=>{
 const brk=hits(beat(1,s=>{s.patterns[0]=S.emptyPattern();s.patterns[0].kicks=Array(16).fill(false);}),8);assert.equal(brk.snares.length,0);assert.equal(brk.kicks.length,0);
 const muted=hits(beat(1,s=>{s.song={on:true,sections:[{name:'x',patterns:[0],repeat:1,mute:{snare:true}}]};Object.assign(s,S.validate(s));}),8);assert.equal(muted.snares.length,0);
});
test('every style generates valid, varied beats',()=>{
 for(const style of B.STYLE_NAMES){
  const seen=new Set();
  for(let seed=1;seed<=30;seed++){
   const d=B.generate(style,seed);assert.equal(d.kicks.length,16);assert.ok(d.kicks[0],style);assert.ok(d.snares.every(v=>[0,1,2].includes(v))&&d.hats.every(v=>[0,1,2].includes(v)),style);
   seen.add(JSON.stringify(d));
  }
  assert.ok(seen.size>3,`${style} ${seen.size}`);
  assert.deepEqual(B.generate(style,7,2),B.generate(style,7,2));assert.notDeepEqual(B.generate(style,7,0),B.generate(style,7,3));
 }
 const brk=B.generate('breakbeat',3);assert.ok(!(brk.kicks[0]&&brk.kicks[4]&&brk.kicks[8]&&brk.kicks[12]),'breakbeat is not four on the floor');assert.equal(brk.snares[4],1);
});
test('snare survives validation and share links, old links load without it',async()=>{
 const s=S.validate(beat(0));B.applyDrums(s.patterns[0],B.generate('jungle',5));
 const back=await T.decodeState(await T.encodeState(s));assert.deepEqual(back.patterns[0].steps.map(x=>x.snare),s.patterns[0].steps.map(x=>x.snare));
 assert.equal(S.validate({patterns:[{length:16,steps:[{gate:true,note:1}]}]}).patterns[0].steps[0].snare,0);
 assert.equal(S.validate({patterns:[{length:16,steps:[{snare:9}]}]}).patterns[0].steps[0].snare,0);
});
test('demo songs with fills and random beats stay clean',()=>{
 for(const d of demos.slice(0,2)){
  assert.ok(d.params.fill>0,d.name);
  const x=JSON.parse(JSON.stringify(d));x.patterns.forEach((p,i)=>{if(p.steps.some(s=>s.gate)&&B.hasDrums(p))B.applyDrums(p,B.generate('breakbeat',9,i%4));});
  const {L}=renderState(S.validate(x),{sampleRate:22050,loops:1});let peak=0;for(const v of L){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));}assert.ok(peak<=.95,`${peak}`);
 }
});

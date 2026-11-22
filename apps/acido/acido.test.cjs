const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('./session.js');
const {Engine}=require('./engine.js');
const {Sequencer}=require('./sequencer.js');

function render(sr,state,seconds,setup){
 const e=new Engine(sr),q=new Sequencer(sr);e.sequence=q;
 e.setParams(state.params);q.configure(state);e.tempo=q.tempo;e.reset();
 if(setup)setup(e,q);else q.start(e);
 const n=Math.round(sr*seconds),L=new Float32Array(n),R=new Float32Array(n);
 for(let i=0;i<n;i+=128){const m=Math.min(128,n-i);e.process(L.subarray(i,i+m),R.subarray(i,i+m),m);}
 return {L,R,e,q};
}
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
const peak=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);

test('presets render finite, bounded, audible output at 44.1 and 48 kHz',()=>{
 for(const sr of [44100,48000])for(const p of S.presets){
  const {L,R}=render(sr,p,2);
  assert.ok(L.every(Number.isFinite)&&R.every(Number.isFinite),p.name);
  assert.ok(peak(L)<=.95&&peak(R)<=.95,p.name);
  assert.ok(rms(L)>.02,`${p.name} rms ${rms(L)}`);
 }
});

test('extreme parameters stay finite and bounded',()=>{
 for(const v of [0,1]){
  const params=Object.fromEntries(Object.keys(S.defaults).map(k=>[k,v]));
  const {L,R}=render(48000,{...S.presets[0],params},1.5);
  assert.ok(L.every(Number.isFinite)&&peak(L)<=.95&&peak(R)<=.95);
 }
});

test('rendering is deterministic',()=>{
 const a=render(48000,S.presets[1],1).L,b=render(48000,S.presets[1],1).L;
 assert.deepEqual(a,b);
});

test('steps are sample-accurate without drift',()=>{
 const sr=48000,state=S.validate({tempo:130,steps:Array.from({length:16},()=>({gate:true,note:0}))});
 const ons=[];
 render(sr,state,10,(e,q)=>{const on=e.noteOn.bind(e);let t=0;const tick=q.tick.bind(q);q.tick=eng=>{t++;tick(eng);};e.noteOn=(...a)=>{ons.push(t);on(...a);};q.start(e);});
 const stepLen=sr*60/130/4;
 ons.forEach((t,i)=>assert.ok(Math.abs(t-i*stepLen)<=1,`step ${i} at ${t}`));
 assert.equal(ons.length,Math.floor(10*sr/stepLen)+1);
});

test('slide holds the gate and glides without retriggering envelopes',()=>{
 const steps=[{gate:true,note:0,slide:true},{gate:true,note:12},...Array(14).fill({gate:false})];
 const state=S.validate({tempo:120,steps});
 const sr=48000,stepLen=sr*60/120/4;
 const {e}=render(sr,state,0,(e,q)=>q.start(e));
 const L=new Float32Array(1),R=new Float32Array(1);
 const fenvs=[],gates=[],pitches=[];
 // The slide target is a normal step: its gate closes at half step (1.5 steps from start).
 for(let i=0;i<stepLen*1.5-10;i++){e.process(L,R,1);fenvs.push(e.fenv);gates.push(e.gate);pitches.push(e.pitch);}
 assert.ok(gates.every(Boolean),'gate stays high through slide');
 for(let i=1;i<fenvs.length;i++)assert.ok(fenvs[i]<=fenvs[i-1],'filter env never retriggers');
 for(let i=0;i<20;i++)e.process(L,R,1);
 assert.equal(e.gate,false,'gate closes after the slide target');
 const into=Math.round(stepLen*1.02),end=pitches.length-1;
 assert.ok(pitches[into]<40,'glide starts from the previous pitch');
 assert.ok(pitches[end]>36+11.3,`pitch lands on the target (${pitches[end]})`);
});

test('accent is louder and decays the filter faster',()=>{
 const one=accent=>S.validate({tempo:120,params:{kick:0},steps:[{gate:true,note:0,accent},...Array(15).fill({gate:false})]});
 const a=render(48000,one(true),.12).L,b=render(48000,one(false),.12).L;
 assert.ok(rms(a)>rms(b)*1.2,`${rms(a)} vs ${rms(b)}`);
});

test('distortion: exact bypass at 0, bounded on every type, adds harmonics',()=>{
 const base=S.presets[0],withP=over=>({...base,params:{...base.params,delay:0,...over}});
 const off=render(48000,withP({distortion:0,distType:0,distTone:.1}),1).L;
 const off2=render(48000,withP({distortion:0,distType:1,distTone:.9}),1).L;
 assert.deepEqual(off,off2,'tone/type have no effect when distortion is 0');
 // High-frequency share: energy of the first difference relative to the signal energy.
 const bright=a=>{let d=0,s=0;for(let i=1;i<a.length;i++){d+=(a[i]-a[i-1])**2;s+=a[i]*a[i];}return d/s;};
 for(const distType of [0,.5,1]){
  const {L,R}=render(48000,withP({distortion:.8,distType,distTone:1}),1.5);
  assert.ok(L.every(Number.isFinite)&&peak(L)<=.95&&peak(R)<=.95,`type ${distType}`);
  assert.ok(bright(L)>bright(off)*1.5,`type ${distType} brighter: ${bright(L)} vs ${bright(off)}`);
  assert.ok(rms(L)>rms(off)*.6&&rms(L)<rms(off)*1.6,`type ${distType} level-matched`);
 }
 const dark=render(48000,withP({distortion:.8,distType:.5,distTone:0}),1.5).L;
 const open=render(48000,withP({distortion:.8,distType:.5,distTone:1}),1.5).L;
 assert.ok(bright(dark)<bright(open),'tone darkens');
});

// Records sequencer events (noteOn/noteOff with sample time and pattern) without rendering audio.
function trace(state,samples,during){
 const q=new Sequencer(48000),ev=[];let t=0;
 const eng={noteOn:(note,accent,slide)=>ev.push({t,on:true,note,slide,pat:q.pat,step:q.step}),noteOff:()=>ev.push({t,on:false})};
 q.configure(state);q.start(eng);
 for(;t<samples;t++){if(during)during(t,q);q.tick(eng);}
 return {ev,q,ons:ev.filter(e=>e.on)};
}
const all=(over={})=>Array.from({length:16},()=>({gate:true,note:0,...over}));

test('swing delays odd steps and keeps each pair on the straight grid',()=>{
 const sw=.66,state=S.validate({tempo:120,swing:sw,patterns:[{steps:all()}]});
 const L=48000*60/120/4,{ons}=trace(state,L*16);
 ons.slice(0,16).forEach((e,i)=>{
  const expected=Math.floor(i/2)*2*L+(i%2?2*L*sw:0);
  assert.ok(Math.abs(e.t-expected)<=1,`step ${i} at ${e.t}, expected ${expected}`);
 });
});

test('per-step gate length: corta, normale, lunga',()=>{
 const L=48000*60/120/4;
 for(const [gateLen,frac] of [[1,.22],[0,.5],[2,.92]]){
  const {ev}=trace(S.validate({tempo:120,patterns:[{steps:[{gate:true,note:0,gateLen},...Array(15).fill({gate:false})]}]}),L);
  const off=ev.find(e=>!e.on);
  assert.ok(Math.abs(off.t-L*frac)<=1,`gateLen ${gateLen}: off at ${off.t}`);
 }
});

test('a queued pattern starts at the end of the loop, not immediately',()=>{
 const state=S.validate({tempo:120,patterns:[{length:4,steps:all({note:0})},{length:4,steps:all({note:7})}]});
 const L=48000*60/120/4;
 const {ons}=trace(state,L*12,(t,q)=>{if(t===Math.round(L*1.5))q.select(1);});
 assert.deepEqual(ons.slice(0,12).map(e=>e.pat),[0,0,0,0,1,1,1,1,1,1,1,1]);
});

test('the chain plays patterns in order and loops; a selection jumps into it',()=>{
 const p=n=>({length:2,steps:all({note:n})});
 const state=S.validate({tempo:120,chain:[0,0,1,2],patterns:[p(0),p(1),p(2)]});
 const L=48000*60/120/4;
 assert.deepEqual(trace(state,L*16).ons.slice(0,16).map(e=>e.pat),[0,0,0,0,1,1,2,2,0,0,0,0,1,1,2,2]);
 const {ons}=trace(state,L*10,(t,q)=>{if(t===1)q.select(2);});
 assert.deepEqual(ons.slice(0,10).map(e=>e.pat),[0,0,2,2,0,0,0,0,1,1],'after the jump the chain continues from that entry');
});

test('a slide on the last step glides into the next pattern',()=>{
 const state=S.validate({tempo:120,patterns:[{length:2,steps:[{gate:true,note:0},{gate:true,note:0,slide:true}]},{length:2,steps:[{gate:true,note:7},{gate:false}]}]});
 const L=48000*60/120/4;
 const {ev}=trace(state,L*3,(t,q)=>{if(t===1)q.select(1);});
 const ons=ev.filter(e=>e.on);
 assert.equal(ons[2].pat,1);assert.equal(ons[2].slide,true);
 assert.ok(!ev.some(e=>!e.on&&e.t>L&&e.t<ons[2].t),'gate held across the pattern change');
});

test('version 1 state migrates to pattern A',()=>{
 const v=S.validate({tempo:130,length:12,steps:[{gate:true,note:5,slide:true}]});
 assert.equal(v.patterns[0].length,12);assert.equal(v.patterns[0].steps[0].note,5);assert.equal(v.patterns[0].steps[0].slide,true);
 assert.equal(v.swing,.5);assert.deepEqual(v.chain,[]);
 assert.deepEqual(S.parseChain('a a, b-h x'),[0,0,1,7]);assert.equal(S.formatChain([0,0,1]),'A A B');
});

test('glitch: exact bypass at 0, bounded and deterministic when active',()=>{
 const base=S.presets[0],withP=over=>({...base,params:{...base.params,delay:0,...over}});
 const off=render(48000,withP({glitch:0,crush:0,glitchSize:0}),1).L;
 const off2=render(48000,withP({glitch:0,crush:0,glitchSize:1}),1).L;
 assert.deepEqual(off,off2,'size has no effect with glitch and crush at 0');
 const on=withP({glitch:.6,crush:.5,glitchSize:.5});
 const a=render(48000,on,2),b=render(48000,on,2);
 assert.deepEqual(a.L,b.L,'same seed, same glitches');
 assert.ok(a.L.every(Number.isFinite)&&peak(a.L)<=.95&&peak(a.R)<=.95);
 assert.notDeepEqual(a.L.subarray(0,48000),off);
});

test('glitch events: stutter loops a slice, reverse plays backwards, tape stop slows down',()=>{
 const {Glitch,STUTTER,REVERSE,TAPE}=require('./glitch.js');
 const sr=48000,L=1000,ramp=i=>(i%5000)/5000;
 const feed=(g,from,n)=>{const out=[];for(let i=from;i<from+n;i++)out.push(g.process(ramp(i),0));return out;};
 // Stutter: after the fade, output repeats with the slice period and the buffer stays frozen.
 let g=new Glitch(sr);feed(g,0,3000);
 g.hold(true,L,.25);assert.equal(g.mode,STUTTER);
 const st=feed(g,3000,4000);
 for(let i=3000;i<3200;i++)assert.ok(Math.abs(st[i]-st[i+250])<1e-6,`period 250 at ${i}`);
 g.hold(false);feed(g,7000,2000);assert.equal(g.mode,0,'returns to dry after release');
 // Reverse: a rising ramp comes back falling.
 g=new Glitch(sr);feed(g,0,3000);g.mode=REVERSE;g.revStart=g.w;g.t=0;g.active=true;g.remaining=L;g.mix=1;
 const rv=feed(g,3000,500);for(let i=1;i<500;i++)assert.ok(rv[i]<=rv[i-1]+1e-9,'reverse decreases');
 // Tape stop: the read head advances less and less.
 g=new Glitch(sr);feed(g,0,3000);g.onStep(L,1,.5);
 let guard=0;while(g.mode!==TAPE&&guard++<50){feed(g,3000,L*2);g.onStep(L,1,.5);}
 assert.equal(g.mode,TAPE);
 const p0=g.readPos;feed(g,0,L/4);const d1=g.readPos-p0;const p1=g.readPos;feed(g,0,L/4);const d2=g.readPos-p1;
 assert.ok(d2<d1&&d1<L/4,'head slows down');
});

test('crush reduces bit depth and sample rate',()=>{
 const {Glitch}=require('./glitch.js');
 const g=new Glitch(48000),out=[];
 for(let i=0;i<4800;i++)out.push(g.process(Math.sin(i*.01)*.8,1));
 const levels=new Set(out.map(x=>x.toFixed(6)));
 assert.ok(levels.size<=9,`3-bit: ${levels.size} levels`);
 let runs=0;for(let i=1;i<out.length;i++)if(out[i]!==out[i-1])runs++;
 assert.ok(runs<=4800/32+2,'held for 32 samples');
});

test('glitch runs on a free clock when the sequencer is stopped',()=>{
 const e=new Engine(48000);e.setParams({glitch:1});e.reset();
 let steps=0;const on=e.onStep.bind(e);e.onStep=l=>{steps++;on(l);};
 const L=new Float32Array(128),R=new Float32Array(128);
 for(let i=0;i<48000/128;i++)e.process(L,R,128);
 assert.ok(Math.abs(steps-Math.round(48000/e.stepLen()))<=1,`${steps} steps in 1 s`);
});

test('kick: four on the floor from Play, also with odd pattern lengths',()=>{
 const q=new Sequencer(48000),hits=[];let t=0;
 const eng={noteOn(){},noteOff(){},kickHit:()=>hits.push(t)};
 q.configure(S.validate({tempo:120,swing:.62,patterns:[{length:5,steps:all()}]}));q.start(eng);
 const L=48000*60/120/4;
 for(;t<L*16-2;t++)q.tick(eng); // the 5th beat lands on sample 16L-1: stop just before it
 assert.deepEqual(hits.map(h=>Math.round(h/(4*L))),[0,1,2,3],'one hit per beat');
 hits.forEach((h,i)=>assert.ok(Math.abs(h-i*4*L)<=1,`beat ${i} on the straight grid despite swing`));
});

test('kick: level 0 is silent, the hit is low and loud, duck lowers the bass under it',()=>{
 const base=S.presets[0],withP=over=>({...base,params:{...base.params,delay:0,...over}});
 const lowShare=a=>{let lp=0,lo=0,all=0;const c=1-Math.exp(-2*Math.PI*150/48000);for(const x of a){lp+=(x-lp)*c;lo+=lp*lp;all+=x*x;}return lo/all;};
 // Kick alone: a pattern of rests.
 const rests=over=>S.validate({tempo:128,params:{delay:0,...over},patterns:[{steps:[]}]});
 const alone=render(48000,rests({kick:1}),2).L;
 assert.equal(peak(render(48000,rests({kick:0}),1).L),0,'level 0 = silent');
 assert.ok(peak(alone)>.6&&peak(alone)<=.95,`kick is loud: ${peak(alone)}`);
 assert.ok(lowShare(alone)>.6,`kick energy is mostly below 150 Hz: ${lowShare(alone)}`);
 // With the kick off, duck has nothing to follow.
 assert.deepEqual(render(48000,withP({kick:0,duck:1}),2).L,render(48000,withP({kick:0,duck:0}),2).L,'with the kick off, duck does nothing');
 const k=new (require('./kick.js').Kick)(48000);k.trigger(.35);
 for(let i=0;i<480;i++)k.process(.35);
 assert.ok(k.duckGain(1)<.4&&k.duckGain(0)===1,'duck gain drops right after the hit');
});

test('panic silences immediately and stops the sequencer',()=>{
 const {e,q}=render(48000,S.presets[0],.5);
 e.panic();
 const L=new Float32Array(256),R=new Float32Array(256);e.process(L,R,256);
 assert.equal(q.running,false);assert.equal(peak(L),0);
});

test('validation clamps, defaults and roundtrips',()=>{
 const v=S.validate({params:{cutoff:3,resonance:'x'},tempo:999,swing:2,chain:[0,99,1,-1],current:99,patterns:[{length:40,steps:[{note:99,octave:5,gate:true,accent:1,gateLen:7}]}]});
 assert.equal(v.params.cutoff,1);assert.equal(v.params.resonance,S.defaults.resonance);
 assert.equal(v.tempo,200);assert.equal(v.swing,.75);assert.deepEqual(v.chain,[0,1]);assert.equal(v.current,0);
 assert.equal(v.patterns.length,S.PATTERNS);assert.equal(v.patterns[0].length,16);assert.equal(v.patterns[0].steps.length,16);
 assert.deepEqual(v.patterns[0].steps[0],{note:12,gate:true,accent:false,slide:false,octave:0,gateLen:0,hat:0,clap:false,vowel:-1,bass:-1,bassOct:0,bassTie:false,snare:0});
 assert.ok(v.patterns[31].steps.every(s=>!s.gate));
 assert.deepEqual(S.validate(JSON.parse(JSON.stringify(v))),v);
 assert.throws(()=>S.validate(null));
 assert.deepEqual(S.randomPattern(7),S.randomPattern(7));
});

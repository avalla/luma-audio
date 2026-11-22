const assert=require('node:assert/strict');
const O=require('./to-acido.js'),T=require('../acido/tools.js'),{Sequencer}=require('../acido/sequencer.js');
const SCALE=[57,59,60,62,64,65,67,69];
const preset=(phrase,over={})=>({format:'luma-orbit',version:2,base:[0,1,2,3,4,5,6,7],notes:[0,1,2,3,4,5,6,7],locks:Array(8).fill(false),sound:'glass',scale:'minor',flow:false,phrase,
 drumPattern:Array.from({length:16},(_,i)=>({kick:i%4===0,clap:i===4,hat:i%2===0,velocity:1})),drumsEnabled:true,drumEnabled:{kick:true,clap:true,hat:true},
 controls:{bpm:128,amount:35,tone:62,bass:30,volume:20,density:45,depth:65,'drum-volume':55,'synth-volume':100,'delay-mix':10,'delay-feedback':35,'room-mix':20,'room-size':50,'delay-division':0,'accent-length':5,swing:0,probability:100,energy:50,body:35,fragmentation:0},...over});
const events=n=>Array.from({length:n},(_,i)=>({index:i%8,rest:false,beats:1}));
const played=state=>{
 const log=[],q=new Sequencer(48000),e={target:{fill:0},noteOn(n,a,slide){if(!slide)log.push({t:q.count-1,n,a});},noteOff(){},kickHit(){},drumHit(){},bassOn(){},bassOff(){}};
 q.configure(JSON.parse(JSON.stringify(state)));q.select(state.current);q.start(e);
 const total=(state.chain.length?state.chain:[state.current]).reduce((n,i)=>n+state.patterns[i].length,0);
 while(q.count<total)q.tick(e);
 return log;
};
(async()=>{
 const one=await T.decodeState(await O.encode(O.convert(preset(events(8)))));
 assert.equal(one.tempo,128);assert.equal(one.params.tuning,1);assert.equal(one.patterns[0].length,16);
 const notes=played(one);
 assert.deepEqual(notes.map(x=>x.t),[0,2,4,6,8,10,12,14],'one pulse is two steps');
 assert.deepEqual(notes.map(x=>x.n),SCALE.map(m=>m-24),'pitches and intervals survive');
 assert.deepEqual(notes.filter(x=>x.a).map(x=>x.t),[0,10],'accent cycle of five pulses');
 assert.deepEqual(one.patterns[0].kicks.map((k,i)=>k?i:-1).filter(i=>i>=0),[0,8],'kicks land on pulses');
 assert.equal(one.patterns[0].steps[8].clap,true);assert.equal(one.patterns[0].steps[0].bass,one.patterns[0].steps[0].note);

 const held=await T.decodeState(await O.encode(O.convert(preset([{index:0,rest:false,beats:2},{index:3,rest:true,beats:1},{index:4,rest:false,beats:1},...events(4)]))));
 const s=held.patterns[0].steps;
 assert.ok(s[0].gate&&s[0].slide&&s[1].slide&&s[2].gate&&!s[2].slide&&!s[3].gate,'a long note holds without retrigger');
 assert.ok(!s[4].gate&&!s[5].gate&&s[6].gate,'rests stay silent');assert.equal(played(held).length,6);

 const long=preset(Array.from({length:16},(_,i)=>({index:i%8,rest:false,beats:2})));
 const many=await T.decodeState(await O.encode(O.convert(long)));
 assert.deepEqual(many.chain,[0,1,2,3],'a long phrase becomes a chain');assert.equal(played(many).length,16);

 const odd=await T.decodeState(await O.encode(O.convert(preset(events(12)))));
 assert.deepEqual(odd.chain,[0,1]);assert.equal(odd.patterns[1].length,8,'the last pattern keeps the phrase length');assert.equal(played(odd).length,12);

 for(const scale of ['minor','major','pentatonic']){const x=await T.decodeState(await O.encode(O.convert(preset(events(8),{scale}))));assert.ok(x.patterns[0].steps.every(st=>st.note>=0&&st.note<=12&&[-1,0,1].includes(st.octave)),scale);assert.equal(played(x).length,8);}
 const off=await T.decodeState(await O.encode(O.convert(preset(events(8),{drumsEnabled:false}))));
 assert.ok(off.patterns[0].kicks.every(k=>!k)&&off.patterns[0].steps.every(x=>!x.hat&&!x.clap),'disabled drums stay off');
 const noBass=O.convert(preset(events(8),{controls:{...preset([]).controls,bass:0}}));assert.equal(noBass.p.bass,0);assert.ok(noBass.a[0].s.every(x=>x[9]===-1));

 assert.equal(O.target({hostname:'orbit.avalla.dev',protocol:'https:'}),'https://acido.avalla.dev/');assert.equal(O.target({hostname:'127.0.0.1',protocol:'http:'}),'http://127.0.0.1:8767/');
 console.log('PASS: Orbit phrase to Acido: pitch, timing, holds, rests, accents, drums, chains and link');
})().catch(e=>{console.error(e);process.exit(1);});

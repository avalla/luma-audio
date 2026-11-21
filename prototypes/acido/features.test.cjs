const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./session.js'),{Engine}=require('./engine.js'),{Sequencer}=require('./sequencer.js');
const {renderState,encodeWav,musicFrames}=require('./render.js'),T=require('./tools.js');
const {Formant}=require('./formant.js'),{Reverb}=require('./reverb.js'),{Drums}=require('./drums.js');
const SR=48000,rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),peak=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const base=(params={})=>{const st=S.validate({params:{...S.defaults,kick:0,delay:0,...params},tempo:120});st.patterns[0].steps.forEach((s,i)=>{s.gate=i%2===0;});return st;};
function run(st,seconds=1){
 const e=new Engine(SR),q=new Sequencer(SR);e.sequence=q;e.setParams(st.params);q.configure(JSON.parse(JSON.stringify(st)));e.tempo=q.tempo;e.reset();q.start(e);
 const n=Math.round(SR*seconds),L=new Float32Array(n),R=new Float32Array(n);
 for(let i=0;i<n;i+=128){const m=Math.min(128,n-i);e.process(L.subarray(i,i+m),R.subarray(i,i+m),m);}
 return {L,R,e,q};
}
const band=(a,hz)=>{let re=0,im=0;for(let i=0;i<a.length;i++){const p=2*Math.PI*hz*i/SR;re+=a[i]*Math.cos(p);im+=a[i]*Math.sin(p);}return Math.hypot(re,im)/a.length;};

test('new parameters at their defaults leave a session without drums unchanged',()=>{
 const a=run(base()).L,st=base();st.params.formant=0;st.params.reverb=0;
 assert.deepEqual(run(st).L,a);
});
test('old saved steps migrate with no drums, vowels or automation',()=>{
 const v=S.validate({patterns:[{length:16,steps:[{note:3,gate:true}],auto:{cutoff:'x',volume:[1]}}]});
 assert.deepEqual([v.patterns[0].steps[0].hat,v.patterns[0].steps[0].clap,v.patterns[0].steps[0].vowel],[0,false,-1]);
 assert.deepEqual(v.patterns[0].auto,{});
});
test('formant filter: exact bypass at 0, vowels differ, stable while morphing',()=>{
 const f=new Formant(SR);assert.equal(f.process(.37,0,0),.37);
 const tone=pos=>{const g=new Formant(SR),o=new Float64Array(9600);for(let i=0;i<o.length;i++){const p=i*110/SR%1;o[i]=g.process((2*p-1)*.5,pos,1);}return o.subarray(4800);};
 const a=tone(0),i=tone(2);
 assert.ok(band(a,770)>band(i,770)*2,'A has more energy near its first formant');
 assert.ok(band(i,2310)>band(a,2310)*1.5,'I has more energy near its second formant');
 const g=new Formant(SR);let m=0;for(let n=0;n<SR;n++){const x=g.process(Math.sin(n*.05),2+2*Math.sin(n*.01),1);assert.ok(Number.isFinite(x));m=Math.max(m,Math.abs(x));}
 assert.ok(m<4);
});
test('step vowels change the sound only when the formant filter is on',()=>{
 const st=base({formant:1});const off=run(st).L;
 st.patterns[0].steps.forEach(s=>{s.vowel=2;});
 assert.notDeepEqual(run(st).L,off);
 const dry=base();const a=run(dry).L;dry.patterns[0].steps.forEach(s=>{s.vowel=2;});
 assert.deepEqual(run(dry).L,a);
});
test('reverb leaves a decaying stereo tail and stays stable at maximum size',()=>{
 const r=new Reverb(SR);r.process(1,1);let e1=0,e2=0,diff=0;
 for(let i=0;i<SR*4;i++){r.process(0,1);assert.ok(Number.isFinite(r.l));if(i<SR/2)e1+=r.l*r.l;if(i>SR*3.5)e2+=r.l*r.l;diff+=Math.abs(r.l-r.r);}
 assert.ok(e1>0&&e2<e1*.05,`${e1} ${e2}`);assert.ok(diff>0);
 const st=base({reverb:1,reverbSize:1});assert.ok(peak(run(st,2).L)<=.95);
});
test('hat and clap sound on their steps, closed hat is shorter than open',()=>{
 const tail=open=>{const d=new Drums(SR);d.hat(open);let e=0;for(let i=0;i<SR*.5;i++){d.process();if(i>SR*.1)e+=d.hatOut*d.hatOut;}return e;};
 assert.ok(tail(true)>tail(false)*10);
 const st=base();st.patterns[0].steps.forEach(s=>{s.gate=false;});
 assert.equal(peak(run(st,.5).L),0);
 st.patterns[0].steps[0].hat=1;assert.ok(peak(run(st,.2).L)>.02);
 st.patterns[0].steps[0].hat=0;st.patterns[0].steps[0].clap=true;assert.ok(peak(run(st,.2).L)>.02);
 st.params.clap=0;assert.equal(peak(run(st,.2).L),0);
});
test('automation overrides the knob on its step, empty steps follow it, stop clears it',()=>{
 const st=base({cutoff:.2});st.patterns[0].auto={cutoff:Array(16).fill(null)};st.patterns[0].auto.cutoff[1]=.9;
 const e=new Engine(SR),q=new Sequencer(SR);e.sequence=q;e.setParams(st.params);q.configure(st);e.tempo=q.tempo;e.reset();q.start(e);
 const L=new Float32Array(128),R=new Float32Array(128),adv=()=>{for(let i=0;i<Math.ceil(q.stepLen/128);i++)e.process(L,R,128);};
 assert.equal(e.auto.cutoff,-1);adv();assert.equal(q.step,1);assert.equal(e.auto.cutoff,.9);
 q.hold('cutoff',true,e);assert.equal(e.auto.cutoff,-1);q.hold('cutoff',false,e);
 adv();assert.equal(e.auto.cutoff,-1);
 q.setAuto(0,3,'cutoff',.4);q.setAuto(0,3,'volume',.4);assert.equal(st.patterns[0].auto.cutoff[3],.4);assert.equal(st.patterns[0].auto.volume,undefined);
 q.patterns[0].auto.cutoff[q.step]=.5;q.applyAuto(e,0,q.step);assert.equal(e.auto.cutoff,.5);q.stop(e);assert.equal(e.auto.cutoff,-1);
});
test('automated decay reaches the next note',()=>{
 const st=base({decay:0});st.patterns[0].auto={decay:Array(16).fill(1)};
 const {e}=run(st,.05);assert.equal(e.value.decay,1);
});
test('undo history coalesces one gesture, redoes and is bounded',()=>{
 const h=new T.History(3);
 h.mark('a','k',0);h.mark('b','k',100);assert.equal(h.past.length,1);
 h.mark('c','k',5000);assert.equal(h.past.length,2);
 assert.equal(h.undo('d'),'c');assert.equal(h.redo('c'),'d');
 h.undo('d');h.mark('x');assert.equal(h.canRedo,false);
 for(const s of ['1','2','3','4'])h.mark(s);assert.equal(h.past.length,3);assert.equal(h.past[0],'2');
 assert.equal(new T.History().undo('z'),null);
});
test('share link round-trips the session, stays short and rejects bad input',async()=>{
 const st=S.presets[0];st.patterns[0].auto={cutoff:Array(16).fill(null)};st.patterns[0].auto.cutoff[2]=.5;st.patterns[0].steps[1].vowel=3;
 const code=await T.encodeState(st);
 assert.match(code,/^[\w-]+$/);assert.ok(code.length<2000,`length ${code.length}`);
 const back=await T.decodeState(code);
 assert.deepEqual(back.patterns,S.validate(st).patterns);assert.equal(back.tempo,st.tempo);assert.ok(Math.abs(back.params.cutoff-st.params.cutoff)<1e-4);
 delete st.patterns[0].auto.cutoff;st.patterns[0].steps[1].vowel=-1;
 await assert.rejects(T.decodeState('not valid!'));await assert.rejects(T.decodeState('AAAA'));await assert.rejects(T.decodeState('x'.repeat(70000)));
});
test('offline render matches the musical length and the WAV header is valid',()=>{
 const st=S.validate(S.presets[0]);st.chain=[0,1];
 const music=musicFrames(st,2,SR);assert.equal(music,Math.round(SR*60/st.tempo/4*64));
 const {L,R}=renderState(st,{sampleRate:SR,loops:2});
 assert.equal(L.length,music+SR*2);assert.ok(rms(L.subarray(0,music))>.02);assert.ok(peak(L)<=.95&&peak(R)<=.95);
 assert.equal(L[L.length-1],0);assert.deepEqual(renderState(st,{sampleRate:SR,loops:2}).L,L);
 const v=new DataView(encodeWav(L.subarray(0,10),R.subarray(0,10),SR));
 assert.equal(v.byteLength,44+60);assert.equal(v.getUint32(0),0x52494646);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),SR);assert.equal(v.getUint16(34,true),24);assert.equal(v.getUint32(40,true),60);
 const long=S.validate({tempo:60,chain:Array(32).fill(0)});assert.throws(()=>renderState(long,{loops:16}),/TOO_LONG/);
});

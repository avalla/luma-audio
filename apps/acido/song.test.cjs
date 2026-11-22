const test=require('node:test'),assert=require('node:assert/strict');
const S=require('./session.js'),{Engine}=require('./engine.js'),{Sequencer}=require('./sequencer.js');
const {Bass}=require('./bass.js'),{renderState,musicFrames}=require('./render.js'),T=require('./tools.js'),M=require('./midi.js');
const SR=48000,peak=a=>a.reduce((m,x)=>Math.max(m,Math.abs(x)),0);
const NONE={lead:false,bass:false,kick:false,hat:false,clap:false,snare:false};
function stub(){const e={log:[],kicks:[],bass:[],noteOn(n,a,sl){e.log.push({n,sl});},noteOff(){},kickHit(){e.kicks.push(q.count);},drumHit(h,c){if(h||c)e.drums=(e.drums||0)+1;},bassOn(n,t){e.bass.push({n,t,at:q.count-1});},bassOff(){e.bassOffs=(e.bassOffs||0)+1;}};let q=null;e.bind=x=>{q=x;};return e;}
function seq(state){const q=new Sequencer(SR),e=stub();e.bind(q);q.configure(JSON.parse(JSON.stringify(state)));return {q,e};}
const runSteps=(q,e,n)=>{while(q.count<n)q.tick(e);};
const marked=note=>{const p=S.emptyPattern();p.steps[0]={...p.steps[0],gate:true,note};return p;};

test('old sessions and links keep their data with the new fields',()=>{
 const v=S.validate({patterns:[{length:8,steps:[{note:3,gate:true}]}],chain:[0,1]});
 assert.equal(v.patterns.length,32);assert.equal(v.patterns[0].kicks,null);assert.equal(v.patterns[0].steps[0].bass,-1);
 assert.deepEqual(v.song,{on:false,sections:[]});assert.deepEqual(S.parseChain('a b h4 C2'),[0,1,31,10]);assert.equal(S.formatChain([0,8,31]),'A A2 H4');
 assert.deepEqual(S.validate(JSON.parse(JSON.stringify(v))),v);
});
test('song validation drops invalid sections and clamps values',()=>{
 const v=S.validate({song:{on:true,sections:[{patterns:[]},{name:'x'.repeat(40),patterns:[0,99,3],repeat:99,mute:{kick:true,evil:true}},null]}});
 assert.equal(v.song.sections.length,1);assert.deepEqual(v.song.sections[0].patterns,[0,3]);assert.equal(v.song.sections[0].repeat,16);assert.equal(v.song.sections[0].name.length,24);
 assert.deepEqual(v.song.sections[0].mute,{...NONE,kick:true});
 assert.equal(S.validate({song:{on:true,sections:[]}}).song.on,false);
});
test('song plays sections in order with repeats and loops',()=>{
 const patterns=[0,1,2].map(marked);
 const st=S.validate({tempo:120,patterns,song:{on:true,sections:[{patterns:[0],repeat:2},{patterns:[1,2],repeat:1}]}});
 const {q,e}=seq(st);q.start(e);runSteps(q,e,16*8);
 assert.deepEqual(e.log.slice(0,8).map(x=>x.n-36),[0,0,1,2,0,0,1,2]);
 q.select(2);assert.equal(q.queued,-1,'a selection never jumps inside a song');
});
test('section mutes silence each part',()=>{
 const p=S.emptyPattern();p.steps[0]={...p.steps[0],gate:true,bass:0,hat:1,clap:true};
 const st=S.validate({tempo:120,patterns:[p],song:{on:true,sections:[{patterns:[0],repeat:1,mute:{lead:true,bass:true,kick:true,hat:true,clap:true}}]}});
 const {q,e}=seq(st);q.start(e);runSteps(q,e,8);
 assert.equal(e.log.length,0);assert.equal(e.bass.length,0);assert.equal(e.kicks.length,0);assert.equal(e.drums||0,0);
});
test('programmed kick replaces the automatic 4/4 only on that pattern',()=>{
 const a=S.emptyPattern(),b=S.emptyPattern();a.kicks=Array(16).fill(false);a.kicks[3]=true;a.kicks[6]=true;
 const st=S.validate({tempo:120,patterns:[a,b],chain:[0,1]});
 const {q,e}=seq(st);q.start(e);runSteps(q,e,32);
 assert.deepEqual(e.kicks,[3,6,16,20,24,28]);
});
test('bass voice: tied notes glide without retrigger, plays with the lead, silent when idle',()=>{
 const b=new Bass(SR);assert.equal(b.process(.3,.5),0);
 b.on(36,false);let m=0;for(let i=0;i<4800;i++)m=Math.max(m,Math.abs(b.process(.3,.5)));assert.ok(m>.1);
 const body=b.body;b.on(43,true);assert.equal(b.body,body,'a tie keeps the envelope');assert.ok(b.pitch<37);
 b.off();for(let i=0;i<SR/2;i++)b.process(.3,.5);assert.equal(b.process(.3,.5),0);
 const p=S.emptyPattern();p.steps[0]={...p.steps[0],bass:0,bassOct:-1,bassTie:true};p.steps[1]={...p.steps[1],bass:7,bassOct:-1};
 const st=S.validate({tempo:120,patterns:[p]}),{q,e}=seq(st);q.start(e);runSteps(q,e,3);
 assert.deepEqual(e.bass.slice(0,2),[{n:24,t:false,at:0},{n:31,t:true,at:1}]);
 const noBass=S.validate({params:{...S.defaults,kick:0,delay:0},tempo:120});noBass.patterns[0].steps[0].gate=true;
 const full=JSON.parse(JSON.stringify(noBass));full.patterns[0].steps[0].bass=0;
 const r=s=>renderState(S.validate(s),{sampleRate:SR,loops:1}).L;
 assert.notDeepEqual(r(full),r(noBass));assert.ok(peak(r(full))<=.95);
});
test('render length follows the whole song',()=>{
 const st=S.validate({tempo:120,patterns:[marked(0),marked(1)],song:{on:true,sections:[{patterns:[0],repeat:3},{patterns:[1],repeat:1}]}});
 assert.equal(musicFrames(st,2,SR),Math.round(SR*60/120/4*16*8));
});
test('share link keeps bass, kicks and song; old v2 links still load',async()=>{
 const st=S.validate(S.presets[0]);st.patterns[9]=marked(4);st.patterns[9].steps[0].bass=5;st.patterns[9].steps[0].bassOct=1;st.patterns[9].steps[0].bassTie=true;st.patterns[9].kicks=Array(16).fill(true);
 st.song={on:true,sections:[{name:'Drop',patterns:[0,9],repeat:2,mute:{...NONE,hat:true}}]};
 const back=await T.decodeState(await T.encodeState(st));
 assert.deepEqual(back.patterns,st.patterns);assert.deepEqual(back.song,st.song);
 const payload={v:2,n:'',p:{cutoff:.5},t:130,w:.5,c:0,h:[],a:[{l:16,s:[[3,1,0,0,0,0,1,0,-1]],u:{}}]};
 const raw=new Uint8Array(await new Response(new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
 const oldLink=Buffer.from(raw).toString('base64url');
 const old=await T.decodeState(oldLink);assert.equal(old.tempo,130);assert.equal(old.song.sections.length,0);assert.equal(old.patterns[0].steps[0].note,3);assert.equal(old.patterns[0].steps[0].bass,-1);
});
test('user presets save, overwrite, delete and survive bad storage',()=>{
 const mem=new Map(),st={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
 assert.deepEqual(T.readPresets(st),[]);
 let list=T.upsertPreset([],' Mio ',S.presets[1]);assert.equal(list[0].name,'Mio');
 list=T.upsertPreset(list,'mio',S.presets[2]);assert.equal(list.length,1);assert.equal(list[0].state.tempo,S.presets[2].tempo);
 T.writePresets(st,list);const back=T.readPresets(st);assert.equal(back[0].name,'mio');assert.deepEqual(back[0].state.patterns,S.validate(S.presets[2]).patterns);
 assert.equal(T.removePreset(list,'MIO').length,0);assert.throws(()=>T.upsertPreset([],'  ',S.presets[0]));
 let many=[];for(let i=0;i<T.MAX_PRESETS;i++)many=T.upsertPreset(many,`p${i}`,S.presets[0]);assert.throws(()=>T.upsertPreset(many,'x',S.presets[0]),/FULL/);
 mem.set('acido.presets.v1','{broken');assert.deepEqual(T.readPresets(st),[]);
 mem.set('acido.presets.v1','[{"name":"ok","data":{"v":9}},7]');assert.deepEqual(T.readPresets(st),[]);
 assert.deepEqual(T.readPresets({getItem(){throw new Error('blocked');}}),[]);
});
// Builds a small type-1 MIDI file from synthetic notes.
function smf(notes,{ppq=96,bpm=120}={}){
 const vlq=v=>{const o=[v&127];while(v>>=7)o.unshift(v&127|128);return o;};
 const ev=[];for(const [p,s,l,ch=0] of notes){ev.push([s,[0x90|ch,p,100]],[s+l,[0x80|ch,p,0]]);}
 ev.sort((a,b)=>a[0]-b[0]||a[1][0]-b[1][0]);
 const us=Math.round(6e7/bpm),data=[0,0xFF,0x51,3,us>>16&255,us>>8&255,us&255];let t=0;
 for(const [at,e] of ev){data.push(...vlq(at-t),...e);t=at;}
 data.push(0,0xFF,0x2F,0);
 const u32=v=>[v>>>24,v>>16&255,v>>8&255,v&255];
 return Uint8Array.from([0x4d,0x54,0x68,0x64,...u32(6),0,1,0,1,ppq>>8,ppq&255,0x4d,0x54,0x72,0x6b,...u32(data.length),...data]);
}
test('MIDI import splits lead and bass, ties held notes and reuses repeated blocks',()=>{
 const notes=[];for(let bar=0;bar<4;bar++){const t=bar*384;notes.push([72,t,48],[67,t,48],[36,t,192],[74,t+96,24],[99,t+192,24,9]);}
 const m=M.parseMidi(smf(notes));assert.equal(M.analyze(m).bars,4);assert.equal(M.analyze(m).bpm,120);
 const r=M.convert(m,{bars:4,double:false});
 assert.equal(r.patterns.length,1,'identical bars share a pattern');assert.deepEqual(r.order,[0,0,0,0]);assert.equal(r.tempo,120);
 const s=r.patterns[0].steps,pitch=x=>36+x.octave*12+x.note,b=x=>36+x.bassOct*12+x.bass;
 assert.equal(pitch(s[0]),48,'top note 74 needs one octave down: sequencer -24, Tuning +12');assert.equal(r.tuning,1);
 assert.ok(s[0].gate&&s[0].slide&&!s[1].slide);assert.equal(pitch(s[4]),50);
 assert.equal(b(s[0]),36);assert.ok(s[0].bassTie&&s[6].bassTie&&!s[7].bassTie);assert.equal(s[8].bass,-1);
 assert.ok(r.song.on,'the import turns song mode on');assert.deepEqual(S.validate({patterns:r.patterns,song:r.song}).song.sections[0].patterns,[0,0,0,0]);
});
test('MIDI import: double time, range limits and pattern capacity',()=>{
 const low=M.parseMidi(smf([[60,0,24],[60,96,24]],{bpm:65}));
 assert.equal(M.analyze(low).suggestDouble,true);
 const d=M.convert(low,{bars:1});assert.equal(d.tempo,130);assert.equal(d.order.length,2);assert.ok(d.patterns[0].steps[0].gate);assert.ok(d.patterns[0].steps[8].gate);
 const wide=M.parseMidi(smf([[108,0,24],[60,96,24],[21,192,24]]));
 for(const p of M.convert(wide,{bars:1,double:false,split:40}).patterns)for(const s of p.steps){const n=36+s.octave*12+s.note;assert.ok(n>=24&&n<=60);}
 const many=[];for(let b=0;b<40;b++)for(let i=0;i<16;i++)if((b>>(i%6))&1)many.push([60+i+b%5,b*384+i*24,24]);
 const r=M.convert(M.parseMidi(smf(many)),{bars:40,double:false});assert.ok(r.patterns.length<=S.PATTERNS);assert.ok(r.order.every(i=>i<r.patterns.length));assert.equal(r.stats.bars,r.order.length);
});
test('MIDI parser rejects corrupt input without hanging',()=>{
 const good=smf([[60,0,24],[64,96,24]]);
 for(const bad of [new Uint8Array(0),new Uint8Array(20),good.subarray(0,20),Uint8Array.from([...good.subarray(0,14),0x4d,0x54,0x72,0x6b,255,255,255,255])])assert.throws(()=>M.parseMidi(bad),/BAD_MIDI/);
 let x=12345;for(let n=0;n<300;n++){const f=good.slice();for(let k=0;k<4;k++){x=x*1103515245+12345&0x7fffffff;f[14+x%(f.length-14)]=x>>8&255;}try{const m=M.parseMidi(f);M.analyze(m);M.convert(m,{bars:1});}catch(e){assert.equal(e.message,'BAD_MIDI');}}
});

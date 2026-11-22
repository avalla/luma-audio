/* Standard MIDI File reader and conversion to Acido patterns. DOM-free. Input is untrusted: every read is bounded.
   Conversion: highest notes above the split become the lead, lowest notes below it the bass, on a 16th grid.
   Identical 16-step blocks share one pattern, and the order becomes a song section.
   arrange() imports a whole song instead: every MIDI part gets a role, drums included. */
(function(root){
 const S=typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession;
 const MAX_BYTES=4*1024*1024,MAX_NOTES=100000,DRUM_CHANNEL=9,MAX_SECTION=128,MAX_BLOCKS=1024,MAX_ORBIT_NOTES=24000;
 function parseMidi(input){
  const b=input instanceof Uint8Array?input:new Uint8Array(input);
  if(b.length<14||b.length>MAX_BYTES)throw new Error('BAD_MIDI');
  let o=0;
  const need=n=>{if(o+n>b.length)throw new Error('BAD_MIDI');};
  const u8=()=>{need(1);return b[o++];};
  const u16=()=>{need(2);const v=b[o]<<8|b[o+1];o+=2;return v;};
  const u32=()=>{need(4);const v=b[o]*16777216+(b[o+1]<<16|b[o+2]<<8|b[o+3]);o+=4;return v;};
  const tag=()=>{need(4);const s=String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]);o+=4;return s;};
  if(tag()!=='MThd')throw new Error('BAD_MIDI');
  const headerLen=u32();if(headerLen<6)throw new Error('BAD_MIDI');
  const format=u16(),nTracks=u16(),division=u16();
  if(division===0||division&0x8000)throw new Error('BAD_MIDI');
  need(headerLen-6);o+=headerLen-6;
  const tracks=[],parts=[],tempos=[];let total=0;
  for(let t=0;t<nTracks&&o+8<=b.length;t++){
   const id=tag(),len=u32();
   if(o+len>b.length)throw new Error('BAD_MIDI');
   const end=o+len;
   if(id!=='MTrk'){o=end;continue;}
   let tick=0,run=0,name='';const open=new Map(),notes=[],byChannel=new Map(),program=new Int8Array(16).fill(-1);
   const vlq=()=>{let v=0;for(let i=0;i<4;i++){if(o>=end)throw new Error('BAD_MIDI');const c=b[o++];v=v*128+(c&127);if(!(c&128))return v;}throw new Error('BAD_MIDI');};
   while(o<end){
    tick+=vlq();
    if(o>=end)throw new Error('BAD_MIDI');
    let st=b[o];
    if(st&0x80){o++;if(st<0xF0)run=st;}else{if(!run)throw new Error('BAD_MIDI');st=run;}
    if(st===0xFF){
     const type=u8(),l=vlq();if(o+l>end)throw new Error('BAD_MIDI');
     if(type===3)name=String.fromCharCode(...b.subarray(o,o+Math.min(l,40))).replace(/[^\x20-\x7e]/g,'');
     if(type===0x51&&l===3){const us=b[o]<<16|b[o+1]<<8|b[o+2];if(us>0)tempos.push({tick,bpm:6e7/us});}
     o+=l;
    }else if(st===0xF0||st===0xF7){const l=vlq();if(o+l>end)throw new Error('BAD_MIDI');o+=l;}
    else if(st>=0xF1)throw new Error('BAD_MIDI');
    else{
     const hi=st&0xF0,ch=st&15,a=u8(),v=hi===0xC0||hi===0xD0?0:u8(),key=ch*128+(a&127);
     if(hi===0xC0&&program[ch]<0)program[ch]=a&127;
     if(hi===0x90&&v>0){if(!open.has(key))open.set(key,[]);open.get(key).push({tick,vel:v});}
     else if(hi===0x80||hi===0x90){
      const q=open.get(key);
      if(q&&q.length){
       const n=q.shift(),x={pitch:a&127,start:n.tick,end:Math.max(tick,n.tick+1),vel:n.vel};
       if(++total>MAX_NOTES)throw new Error('BAD_MIDI');
       if(ch!==DRUM_CHANNEL)notes.push(x);
       if(!byChannel.has(ch))byChannel.set(ch,[]);byChannel.get(ch).push(x);
      }
     }
    }
   }
   o=end;
   notes.sort((x,y)=>x.start-y.start||y.pitch-x.pitch);
   tracks.push({name,notes});
   for(const [ch,list] of [...byChannel].sort((x,y)=>x[0]-y[0])){list.sort((x,y)=>x.start-y.start||y.pitch-x.pitch);parts.push({track:t,channel:ch,name,program:Math.max(0,program[ch]),drum:ch===DRUM_CHANNEL,notes:list});}
  }
  if(!total)throw new Error('BAD_MIDI');
  tempos.sort((x,y)=>x.tick-y.tick);
  return {format,ppq:division,tracks,parts,bpm:tempos.length?tempos[0].bpm:120};
 }
 function analyze(m){
  let last=0;for(const t of m.parts)for(const n of t.notes)if(n.end>last)last=n.end;
  return {bars:Math.max(1,Math.ceil(last/(m.ppq*4))),bpm:m.bpm,suggestDouble:m.bpm<90,tracks:m.tracks.map((t,i)=>({index:i,name:t.name,notes:t.notes.length})).filter(t=>t.notes>0),parts:m.parts.map((p,i)=>({index:i,name:p.name,channel:p.channel,drum:p.drum,notes:p.notes.length}))};
 }
 // Builds one held voice: each onset lasts until its end or the next onset.
 function voice(notes,n,stepTicks,startTick,pick){
  const on=new Array(n).fill(null);
  for(const x of notes){
   const i=Math.round((x.start-startTick)/stepTicks);
   if(i<0||i>=n)continue;
   if(!on[i]||pick(x.pitch,on[i].pitch))on[i]={pitch:x.pitch,vel:x.vel,len:Math.max(1,Math.round((x.end-x.start)/stepTicks))};
  }
  const out=new Array(n).fill(null);
  for(let i=0;i<n;i++){
   if(!on[i])continue;
   for(let j=i;j<n&&j<i+on[i].len;j++){if(j>i&&on[j])break;out[j]={...on[i],head:j===i};}
  }
  return out;
 }
 const pitches=v=>v.filter(x=>x&&x.head).map(x=>x.pitch);
 const fold=p=>{while(p>60)p-=12;while(p<24)p+=12;return p;};
 const enc=p=>{const n=fold(p)-36,octave=n<0?-1:n>=12?1:0;return {note:n-12*octave,octave};};
 function fitLead(lp){
  let leadShift=0,tuning=null,top=-1,low=128;
  for(const p of lp){if(p>top)top=p;if(p<low)low=p;}
  if(lp.length&&top>60){
   const k=Math.max(0,Math.ceil((top-72)/12));
   if(low-12*k-12>=24){leadShift=-12*k-12;tuning=1;}
   else leadShift=-12*Math.ceil((top-60)/12);
  }
  return {leadShift,tuning};
 }
 function convert(m,{startBar=0,bars=16,track=-1,split=60,double=m.bpm<90}={}){
  const stepTicks=m.ppq/(double?8:4),startTick=startBar*m.ppq*4,n=Math.round(bars*m.ppq*4/stepTicks);
  const src=(track>=0?[m.tracks[track]]:m.tracks).filter(Boolean).flatMap(t=>t.notes).filter(x=>x.start>=startTick-stepTicks/2&&x.start<startTick+n*stepTicks);
  let hi=src.filter(x=>x.pitch>=split),lo=src.filter(x=>x.pitch<split);
  if(!hi.length){hi=lo;lo=[];}
  const lead=voice(hi,n,stepTicks,startTick,(a,b)=>a>b),bass=voice(lo,n,stepTicks,startTick,(a,b)=>a<b);
  // Octave fit: keep the lead as high as the sequencer allows, using Tuning +12 when it helps.
  const {leadShift,tuning}=fitLead(pitches(lead));
  const bp=pitches(bass),bassShift=bp.length?-12*Math.max(0,Math.ceil((Math.max(...bp)-48)/12)):0;
  const vels=lead.filter(x=>x&&x.head).map(x=>x.vel).sort((a,b)=>a-b),accentAt=vels.length?vels[Math.floor(vels.length*.8)]:128;
  const patterns=[],ids=new Map(),order=[];
  for(let u=0;u+16<=n&&order.length<MAX_SECTION;u+=16){
   const p=S.emptyPattern();
   for(let i=0;i<16;i++){
    const s=p.steps[i],l=lead[u+i],b=bass[u+i],nl=lead[u+i+1],nb=bass[u+i+1];
    if(l)Object.assign(s,enc(l.pitch+leadShift),{gate:true,accent:l.head&&l.vel>=accentAt,slide:!!(nl&&!nl.head)});
    if(b){const e=enc(b.pitch+bassShift);s.bass=e.note;s.bassOct=e.octave;s.bassTie=!!(nb&&!nb.head);}
    s.hat=i%4===2?2:i%2===1?1:0;s.clap=i%8===4;
   }
   const key=JSON.stringify(p.steps);
   if(!ids.has(key)){if(patterns.length>=S.PATTERNS)break;ids.set(key,patterns.length);patterns.push(p);}
   order.push(ids.get(key));
  }
  const perBar=double?2:1,usedBars=Math.floor(order.length/perBar);
  const used=order.length*16;
  const count=v=>v.slice(0,used).filter(x=>x&&x.head).length;
  return {patterns,tempo:Math.round(Math.min(200,Math.max(60,m.bpm*(double?2:1)))),tuning,order,
   song:{on:order.length>0,sections:order.length?[{name:'MIDI',patterns:order,repeat:1,mute:{lead:false,bass:false,kick:false,hat:false,clap:false}}]:[]},
   stats:{lead:count(lead),bass:count(bass),patterns:patterns.length,bars:usedBars,requested:bars,seconds:Math.round(used*60/(Math.min(200,Math.max(60,m.bpm*(double?2:1))))/4)}};
 }
 // ---- Whole-song import: each MIDI part gets a role (lead, orbit, bass, drums or off) ----
 const leadScore=p=>{const poly=p.notes.length/Math.max(1,new Set(p.notes.map(x=>x.start)).size);return p.notes.length*(p.program>=56&&p.program<=87?2:1)/poly;};
 function suggestRoles(m,{orbit=true}={}){
  const roles=new Array(m.parts.length).fill('off'),melodic=[];
  m.parts.forEach((p,i)=>{
   let sum=0;for(const x of p.notes)sum+=x.pitch;
   const n=p.notes.length,poly=n/Math.max(1,new Set(p.notes.map(x=>x.start)).size);
   if(p.drum)roles[i]='drums';
   else if((p.program>=32&&p.program<=39)||/\bbass\b/i.test(p.name)||(sum/n<45&&poly<1.3))roles[i]='bass';
   else melodic.push({i,n,poly,score:leadScore(p)});
  });
  if(!melodic.length)return roles;
  melodic.sort((a,b)=>b.score-a.score);
  const top=Math.max(...melodic.map(x=>x.n)),rest=melodic.slice(1);
  roles[melodic[0].i]='lead';
  if(orbit&&rest.length){const best=rest.reduce((a,b)=>b.n*b.poly>a.n*a.poly?b:a);roles[best.i]='orbit';rest.splice(rest.indexOf(best),1);}
  for(const x of rest)if(x.n>=top*.25)roles[x.i]='lead';
  return roles;
 }
 // Keeps the most useful distinct blocks when a song has more than the pattern bank holds.
 function reduceBlocks(blocks){
  const ids=new Map(),uniq=[],count=[],of=[];
  for(const p of blocks){const k=JSON.stringify([p.steps,p.kicks]);let id=ids.get(k);if(id===undefined){id=uniq.length;ids.set(k,id);uniq.push(p);count.push(0);}count[id]++;of.push(id);}
  const u=uniq.length;
  if(u<=S.PATTERNS)return {patterns:uniq,order:of,exact:blocks.length};
  const dist=new Uint16Array(u*u),same=(x,y,keys)=>keys.every(k=>x[k]===y[k]);
  for(let a=0;a<u;a++)for(let b=a+1;b<u;b++){
   let d=0;
   for(let i=0;i<16;i++){
    const x=uniq[a].steps[i],y=uniq[b].steps[i];
    if(!same(x,y,['gate','note','octave']))d+=3;if(!same(x,y,['bass','bassOct']))d+=3;
    if(!!uniq[a].kicks?.[i]!==!!uniq[b].kicks?.[i])d+=2;if(x.snare!==y.snare)d+=2;if(x.hat!==y.hat)d++;if(x.clap!==y.clap)d++;if(!same(x,y,['accent','slide']))d++;
   }
   dist[a*u+b]=dist[b*u+a]=d;
  }
  const alive=new Uint8Array(u).fill(1),near=new Int32Array(u);
  const nearest=i=>{let at=-1,best=Infinity;for(let j=0;j<u;j++)if(alive[j]&&j!==i&&dist[i*u+j]<best){best=dist[i*u+j];at=j;}return at;};
  for(let i=0;i<u;i++)near[i]=nearest(i);
  for(let left=u;left>S.PATTERNS;left--){
   let drop=-1,cost=Infinity;
   for(let i=0;i<u;i++)if(alive[i]){const c=dist[i*u+near[i]]*count[i];if(c<cost){cost=c;drop=i;}}
   alive[drop]=0;count[near[drop]]+=count[drop];
   for(let i=0;i<u;i++)if(alive[i]&&near[i]===drop)near[i]=nearest(i);
  }
  const remap=new Int32Array(u).fill(-1),patterns=[];
  for(let i=0;i<u;i++)if(alive[i]){remap[i]=patterns.length;patterns.push(uniq[i]);}
  for(let i=0;i<u;i++)if(!alive[i])remap[i]=remap[nearest(i)];
  return {patterns,order:of.map(i=>remap[i]),exact:of.filter(i=>alive[i]).length};
 }
 const OPEN_HATS=[46,49,51,52,53,55,57,59],TOMS=[37,41,43,45,47,48,50];
 function arrange(m,{roles=suggestRoles(m),startBar=0,bars=Infinity,double=m.bpm<90}={}){
  const stepTicks=m.ppq/(double?8:4),startTick=startBar*m.ppq*4,perBar=double?2:1,at=x=>Math.round((x.start-startTick)/stepTicks);
  const pick=role=>m.parts.filter((_,i)=>roles[i]===role);
  const leads=pick('lead').sort((a,b)=>leadScore(b)-leadScore(a)),basses=pick('bass'),kit=pick('drums'),orbits=pick('orbit');
  const wanted=Number.isFinite(bars)?Math.max(1,Math.round(bars))*perBar:Infinity,limit=Math.min(MAX_BLOCKS,wanted);
  let lastStep=-1,lastWanted=-1;
  for(const p of [...leads,...basses,...kit,...orbits])for(const x of p.notes){const i=at(x);if(i<0||i>=wanted*16)continue;if(i>lastWanted)lastWanted=i;if(i<limit*16&&i>lastStep)lastStep=i;}
  const blocks=lastStep<0?0:Math.floor(lastStep/16)+1,n=blocks*16;
  const owner=new Int16Array(blocks).fill(-1);
  leads.forEach((p,li)=>{for(const x of p.notes){const i=at(x);if(i>=0&&i<n&&owner[i>>4]<0)owner[i>>4]=li;}});
  const leadNotes=leads.flatMap((p,li)=>p.notes.filter(x=>{const i=at(x);return i>=0&&i<n&&owner[i>>4]===li;}));
  const lead=voice(leadNotes,n,stepTicks,startTick,(a,b)=>a>b),bass=voice(basses.flatMap(p=>p.notes),n,stepTicks,startTick,(a,b)=>a<b);
  const {leadShift,tuning}=fitLead(pitches(lead));
  let bassTop=-1;for(const x of bass)if(x&&x.head&&x.pitch>bassTop)bassTop=x.pitch;
  const bassShift=bassTop<0?0:-12*Math.max(0,Math.ceil((bassTop-48)/12));
  const heads=lead.filter(x=>x&&x.head).map(x=>x.vel).sort((a,b)=>a-b),accentAt=heads.length?heads[Math.floor(heads.length*.8)]:128;
  const kick=new Uint8Array(n),snare=new Uint8Array(n),hat=new Uint8Array(n),clap=new Uint8Array(n);let hits=0;
  for(const p of kit)for(const x of p.notes){
   const i=at(x),d=x.pitch;if(i<0||i>=n)continue;
   if(d===35||d===36)kick[i]=1;else if(d===38||d===40)snare[i]=1;else if(TOMS.includes(d)){if(!snare[i])snare[i]=2;}
   else if(d===39)clap[i]=1;else if(d===42||d===44){if(!hat[i])hat[i]=1;}else if(OPEN_HATS.includes(d))hat[i]=2;else continue;
   hits++;
  }
  const list=[];
  for(let u=0;u<n;u+=16){
   const p=S.emptyPattern();if(hits)p.kicks=[];
   for(let i=0;i<16;i++){
    const s=p.steps[i],g=u+i,l=lead[g],b=bass[g],nl=lead[g+1],nb=bass[g+1];
    if(l)Object.assign(s,enc(l.pitch+leadShift),{gate:true,accent:l.head&&l.vel>=accentAt,slide:!!(nl&&!nl.head),gateLen:l.head&&l.len===1?1:0});
    if(b){const e=enc(b.pitch+bassShift);s.bass=e.note;s.bassOct=e.octave;s.bassTie=!!(nb&&!nb.head);}
    if(hits){s.hat=hat[g];s.snare=snare[g];s.clap=clap[g]===1;p.kicks.push(kick[g]===1);}
    else{s.hat=i%4===2?2:i%2===1?1:0;s.clap=i%8===4;}
   }
   list.push(p);
  }
  const {patterns,order,exact}=reduceBlocks(list),size=Math.max(8,Math.ceil(blocks/S.MAX_SECTIONS)),sections=[];
  for(let i=0;i<blocks;i+=size){
   const end=Math.min(blocks,i+size),from=startBar+Math.floor(i/perBar)+1,to=startBar+Math.ceil(end/perBar);
   sections.push({name:from===to?`${from}`:`${from}-${to}`,patterns:order.slice(i,end),repeat:1,mute:Object.fromEntries(S.MUTES.map(id=>[id,false]))});
  }
  const seen=new Set(),events=[];
  for(const p of orbits)for(const x of p.notes){
   const i=at(x);if(i<0||i>=n)continue;
   let pitch=x.pitch;while(pitch<24)pitch+=12;while(pitch>96)pitch-=12;
   const id=i*128+pitch;if(seen.has(id))continue;seen.add(id);
   events.push({i,pitch,len:Math.min(64,Math.max(1,Math.round((x.end-x.start)/stepTicks)))});
  }
  events.sort((a,b)=>a.i-b.i||a.pitch-b.pitch);
  const e=[];let prev=0;for(const x of events.slice(0,MAX_ORBIT_NOTES)){e.push(x.i-prev,x.pitch,x.len);prev=x.i;}
  const tempo=Math.round(Math.min(200,Math.max(60,m.bpm*(double?2:1)))),count=v=>v.filter(x=>x&&x.head).length;
  return {patterns,order,tempo,tuning:tuning??.5,song:{on:blocks>0,sections},orbit:e.length?{e,guitar:orbits.some(p=>p.program>=24&&p.program<=31)}:null,
   stats:{lead:count(lead),bass:count(bass),drums:hits,orbit:e.length/3,patterns:patterns.length,exact,blocks,bars:Math.ceil(blocks/perBar),requested:lastWanted<0?0:Math.ceil((Math.floor(lastWanted/16)+1)/perBar),seconds:Math.round(n*60/tempo/4)}};
 }
 // Makes sure the parts present in the import can be heard with the current sound.
 function soundParams(base,r){
  const p={...base,tuning:r.tuning};
  if(r.stats.drums){p.fill=0;for(const [id,min] of [['kick',.7],['snare',.6],['hat',.35],['clap',.35]])p[id]=Math.max(p[id],min);}
  if(r.stats.bass)p.bass=Math.max(p.bass,.6);
  return p;
 }
 const api={parseMidi,analyze,convert,suggestRoles,arrange,soundParams,MAX_BYTES,MAX_BLOCKS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoMidi=api;
})(globalThis);

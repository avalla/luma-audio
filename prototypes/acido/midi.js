/* Standard MIDI File reader and conversion to Acido patterns. DOM-free. Input is untrusted: every read is bounded.
   Conversion: highest notes above the split become the lead, lowest notes below it the bass, on a 16th grid.
   Identical 16-step blocks share one pattern, and the order becomes a song section. */
(function(root){
 const S=typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession;
 const MAX_BYTES=4*1024*1024,MAX_NOTES=100000,DRUM_CHANNEL=9,MAX_SECTION=128;
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
  const tracks=[],tempos=[];let total=0;
  for(let t=0;t<nTracks&&o+8<=b.length;t++){
   const id=tag(),len=u32();
   if(o+len>b.length)throw new Error('BAD_MIDI');
   const end=o+len;
   if(id!=='MTrk'){o=end;continue;}
   let tick=0,run=0,name='';const open=new Map(),notes=[];
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
     if(hi===0x90&&v>0){if(!open.has(key))open.set(key,[]);open.get(key).push({tick,vel:v});}
     else if(hi===0x80||hi===0x90){
      const q=open.get(key);
      if(q&&q.length){const n=q.shift();if(ch!==DRUM_CHANNEL){if(++total>MAX_NOTES)throw new Error('BAD_MIDI');notes.push({pitch:a&127,start:n.tick,end:Math.max(tick,n.tick+1),vel:n.vel});}}
     }
    }
   }
   o=end;
   notes.sort((x,y)=>x.start-y.start||y.pitch-x.pitch);
   tracks.push({name,notes});
  }
  if(!total)throw new Error('BAD_MIDI');
  tempos.sort((x,y)=>x.tick-y.tick);
  return {format,ppq:division,tracks,bpm:tempos.length?tempos[0].bpm:120};
 }
 function analyze(m){
  let last=0;for(const t of m.tracks)for(const n of t.notes)if(n.end>last)last=n.end;
  return {bars:Math.max(1,Math.ceil(last/(m.ppq*4))),bpm:m.bpm,suggestDouble:m.bpm<90,tracks:m.tracks.map((t,i)=>({index:i,name:t.name,notes:t.notes.length})).filter(t=>t.notes>0)};
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
 function convert(m,{startBar=0,bars=16,track=-1,split=60,double=m.bpm<90}={}){
  const stepTicks=m.ppq/(double?8:4),startTick=startBar*m.ppq*4,n=Math.round(bars*m.ppq*4/stepTicks);
  const src=(track>=0?[m.tracks[track]]:m.tracks).filter(Boolean).flatMap(t=>t.notes).filter(x=>x.start>=startTick-stepTicks/2&&x.start<startTick+n*stepTicks);
  let hi=src.filter(x=>x.pitch>=split),lo=src.filter(x=>x.pitch<split);
  if(!hi.length){hi=lo;lo=[];}
  const lead=voice(hi,n,stepTicks,startTick,(a,b)=>a>b),bass=voice(lo,n,stepTicks,startTick,(a,b)=>a<b);
  // Octave fit: keep the lead as high as the sequencer allows, using Tuning +12 when it helps.
  const lp=pitches(lead);let leadShift=0,tuning=null;
  if(lp.length&&Math.max(...lp)>60){
   const k=Math.max(0,Math.ceil((Math.max(...lp)-72)/12));
   if(Math.min(...lp)-12*k-12>=24){leadShift=-12*k-12;tuning=1;}
   else leadShift=-12*Math.ceil((Math.max(...lp)-60)/12);
  }
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
 const api={parseMidi,analyze,convert,MAX_BYTES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoMidi=api;
})(globalThis);

/* Undo history and shareable links. No audio here. The link keeps the session in the URL fragment, which browsers never send to the server. */
(function(root){
 const S=typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession;
 const MAX_CODE=64000,MAX_JSON=256000,COALESCE_MS=1200;
 class History{
  constructor(limit=100){this.limit=limit;this.past=[];this.future=[];this.lastTag=null;this.lastAt=0;}
  get canUndo(){return this.past.length>0;}
  get canRedo(){return this.future.length>0;}
  // Call before a change. Repeated changes with the same tag (one knob gesture) become a single undo step.
  mark(snapshot,tag=null,now=0){
   if(tag&&tag===this.lastTag&&now-this.lastAt<COALESCE_MS){this.lastAt=now;return;}
   this.past.push(typeof snapshot==='function'?snapshot():snapshot);if(this.past.length>this.limit)this.past.shift();
   this.future.length=0;this.lastTag=tag;this.lastAt=now;
  }
  undo(current){if(!this.past.length)return null;this.future.push(current);this.lastTag=null;return this.past.pop();}
  redo(current){if(!this.future.length)return null;this.past.push(current);this.lastTag=null;return this.future.pop();}
 }
 const round=v=>Math.round(v*1e4)/1e4;
 const packStep=s=>[s.note,+s.gate,+s.accent,+s.slide,s.octave,s.gateLen,s.hat,+s.clap,s.vowel,s.bass,s.bassOct,+s.bassTie,s.snare];
 const unpackStep=a=>Array.isArray(a)?{note:a[0],gate:a[1]===1,accent:a[2]===1,slide:a[3]===1,octave:a[4],gateLen:a[5],hat:a[6],clap:a[7]===1,vowel:a[8],bass:a[9],bassOct:a[10],bassTie:a[11]===1,snare:a[12]}:null;
 const isEmpty=p=>!Object.keys(p.auto).length&&!p.kicks&&p.length===S.STEPS&&p.steps.every(s=>!s.gate&&!s.hat&&!s.clap&&!s.snare&&s.vowel<0&&s.bass<0);
 function pack(state){
  let last=state.patterns.length;while(last>1&&isEmpty(state.patterns[last-1]))last--; // trailing empty patterns are implicit
  return {v:2,g:state.song,n:state.name,p:Object.fromEntries(Object.entries(state.params).map(([k,v])=>[k,round(v)])),t:state.tempo,w:state.swing,c:state.current,h:state.chain,
   a:state.patterns.slice(0,last).map(p=>({l:p.length,k:p.kicks?p.kicks.map(Number):undefined,s:p.steps.map(packStep),u:Object.fromEntries(Object.entries(p.auto).map(([k,l])=>[k,l.map(x=>x===null?null:round(x))]))}))};
 }
 function unpack(o){
  if(!o||o.v!==2||!Array.isArray(o.a))throw new Error('Link non valido');
  return S.validate({name:o.n,params:o.p,tempo:o.t,swing:o.w,current:o.c,chain:o.h,song:o.g,patterns:o.a.map(p=>({length:p?.l,kicks:Array.isArray(p?.k)?p.k.map(x=>x===1):null,steps:Array.isArray(p?.s)?p.s.map(unpackStep):[],auto:p?.u}))});
 }
 async function collect(stream,limit){
  const reader=stream.getReader(),parts=[];let size=0;
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   size+=value.length;
   if(size>limit){await reader.cancel();throw new Error('Link troppo grande');}
   parts.push(value);
  }
  const out=new Uint8Array(size);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}
  return out;
 }
 const pipe=(bytes,transform)=>new Blob([bytes]).stream().pipeThrough(transform);
 function toBase64Url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 function fromBase64Url(text){const s=atob(text.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0));}
 async function encodeState(state){
  const bytes=new TextEncoder().encode(JSON.stringify(pack(state)));
  return toBase64Url(await collect(pipe(bytes,new CompressionStream('deflate-raw')),MAX_CODE));
 }
 async function decodeState(code){
  if(typeof code!=='string'||code.length>MAX_CODE||!/^[\w-]+$/.test(code))throw new Error('Link non valido');
  const bytes=await collect(pipe(fromBase64Url(code),new DecompressionStream('deflate-raw')),MAX_JSON);
  return unpack(JSON.parse(new TextDecoder().decode(bytes)));
 }
 // User presets: kept in this browser, in the compact link format.
 const PRESET_KEY='acido.presets.v1',MAX_PRESETS=50;
 function readPresets(storage){
  try{
   const raw=JSON.parse(storage.getItem(PRESET_KEY)||'[]');
   if(!Array.isArray(raw))return[];
   const out=[];
   for(const x of raw.slice(0,MAX_PRESETS)){try{if(typeof x?.name==='string'&&x.name.trim())out.push({name:x.name.trim().slice(0,40),state:unpack(x.data)});}catch{}}
   return out;
  }catch{return[];}
 }
 function writePresets(storage,list){storage.setItem(PRESET_KEY,JSON.stringify(list.map(x=>({name:x.name,data:pack(x.state)}))));}
 const sameName=(a,b)=>a.toLowerCase()===b.toLowerCase();
 function upsertPreset(list,name,state){
  const clean=String(name).trim().slice(0,40);
  if(!clean)throw new Error('NO_NAME');
  const copy=S.validate(JSON.parse(JSON.stringify(state))),i=list.findIndex(x=>sameName(x.name,clean));
  if(i>=0)return list.map((x,j)=>j===i?{name:clean,state:copy}:x);
  if(list.length>=MAX_PRESETS)throw new Error('FULL');
  return [...list,{name:clean,state:copy}];
 }
 const removePreset=(list,name)=>list.filter(x=>!sameName(x.name,name));
 const hasPreset=(list,name)=>list.some(x=>sameName(x.name,String(name).trim()));
 const api={History,encodeState,decodeState,readPresets,writePresets,upsertPreset,removePreset,hasPreset,MAX_PRESETS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoTools=api;
})(globalThis);

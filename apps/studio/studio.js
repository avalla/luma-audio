/* Luma Studio UI. Everything audible runs in one worklet. */
(function(){
 const S=window.AcidoSession,B=window.AcidoBeats,D=window.AcidoDemos,L=window.LumaOrbitLayer,$=id=>document.getElementById(id);
 const WORDS={
  'Lingua':['Language','Langue','Sprache','Idioma'],'Arrangiamento':['Arrangement','Arrangement','Arrangement','Arreglo'],'Brano':['Song','Morceau','Song','Canción'],'Batteria':['Drums','Batterie','Drums','Batería'],'Nuovo ritmo':['New beat','Nouveau rythme','Neuer Beat','Nuevo ritmo'],
  'Timbro':['Timbre','Timbre','Klang','Timbre'],'Nuova frase':['New phrase','Nouvelle phrase','Neue Phrase','Nueva frase'],'Tieni la frase':['Keep phrase','Garder la phrase','Phrase halten','Mantener frase'],
  'Orbit resta nella tonalità del brano e segue gli accordi del basso.':['Orbit stays in the song key and follows the bass chords.','Orbit reste dans la tonalité du morceau et suit les accords de la basse.','Orbit bleibt in der Tonart des Songs und folgt den Bassakkorden.','Orbit se mantiene en la tonalidad y sigue los acordes del bajo.'],
  'Mixer':['Mixer','Mixeur','Mixer','Mezclador'],'Tempo':['Tempo','Tempo','Tempo','Tempo'],'Risonanza':['Resonance','Résonance','Resonanz','Resonancia'],'Esplora':['Explore','Explorer','Erkunden','Explorar'],'Luminosità':['Brightness','Luminosité','Helligkeit','Brillo'],'Riverbero':['Reverb','Réverb','Hall','Reverb'],
  'Basso':['Bass','Basse','Bass','Bajo'],'Cassa':['Kick','Grosse caisse','Kick','Bombo'],'Rullante':['Snare','Caisse claire','Snare','Caja'],'Generale':['Master','Général','Gesamt','General'],
  'Audio non disponibile':['Audio unavailable','Audio indisponible','Audio nicht verfügbar','Audio no disponible'],'Nuova frase pronta':['New phrase ready','Nouvelle phrase prête','Neue Phrase bereit','Nueva frase lista'],'Frase tenuta':['Phrase kept','Phrase gardée','Phrase gehalten','Frase mantenida'],'La frase evolve a ogni brano':['The phrase changes with each song','La phrase change à chaque morceau','Die Phrase ändert sich mit jedem Song','La frase cambia con cada canción'],'Ritmo: {style}':['Beat: {style}','Rythme : {style}','Beat: {style}','Ritmo: {style}']
 };
 const LANGS=['en','fr','de','es'];
 let lang='it';
 const t=(key,params)=>{const i=LANGS.indexOf(lang);let s=i>=0&&WORDS[key]?WORDS[key][i]:key;for(const k in params||{})s=s.replace(`{${k}}`,params[k]);return s;};
 const store={get(){try{return localStorage.getItem('luma.studio.lang');}catch{return null;}},set(v){try{localStorage.setItem('luma.studio.lang',v);}catch{}}};
 let lastStatus=null;
 const status=(key,params)=>{lastStatus=key?[key,params]:null;$('status').textContent=key?t(key,params):'';};

 const clone=o=>JSON.parse(JSON.stringify(o));
 let songIndex=D.defs.findIndex(d=>d.name==='Coro di Mezzanotte');if(songIndex<0)songIndex=0;
 let state=clone(D.demos[songIndex]),ctx=null,node=null,starting=null,running=false,keep=false,section=-1,pattern=-1;
 const orbit={sound:'glass',amount:35,tone:62,send:30,notes:[0,4,2,6,4,7,2,3],seed:1};
 const mix={lead:75,orbit:55};
 let timeline=L.buildTimeline(window.OrbitFlow,{notes:orbit.notes,amount:orbit.amount/100,seed:orbit.seed});
 const send=m=>{if(node)node.port.postMessage(m);};
 const songMsg=()=>({tempo:state.tempo,swing:state.swing,patterns:state.patterns,chain:state.chain,song:state.song,transpose:0});
 const sendSong=()=>send({type:'load',params:state.params,scale:D.defs[songIndex].scale,...songMsg()});
 const sendPhrase=()=>send({type:'phrase',deg:timeline.deg,beats:timeline.beats});

 async function ensureAudio(){
  if(ctx){if(ctx.state!=='running')await ctx.resume();return;}
  if(starting)return starting;
  starting=(async()=>{
   if(navigator.audioSession)try{navigator.audioSession.type='playback';}catch{}
   const c=new AudioContext({latencyHint:'interactive'});
   await c.audioWorklet.addModule('./studio-worklet.js');
   const n=new AudioWorkletNode(c,'luma-studio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
   n.connect(c.destination);
   n.port.onmessage=({data})=>{if(data.type==='step'){const delay=((c.outputLatency||0)+(c.baseLatency||0))*1000;setTimeout(()=>showStep(data),delay);}};
   ctx=c;node=n;
   sendSong();sendPhrase();
   send({type:'sound',id:orbit.sound});send({type:'tone',value:orbit.tone/100});send({type:'send',value:orbit.send/100});send({type:'orbit',value:mix.orbit/100});send({type:'lead',value:mix.lead/75});
   if(c.state!=='running')await c.resume();
  })();
  try{await starting;}catch(err){ctx=null;node=null;status('Audio non disponibile');throw err;}finally{starting=null;}
 }
 function showStep({pattern:p,section:s}){
  if(!running){s=-1;p=-1;}
  if(s!==section){section=s;renderSections();}
  if(p!==pattern){pattern=p;renderPosition();}
 }
 function renderPosition(){
  const name=running&&section>=0?state.song.sections[section]?.name:'',pat=running&&pattern>=0?S.PATTERN_NAMES[pattern]:'';
  $('position').textContent=[name,pat].filter(Boolean).join(' · ');
 }
 function renderSections(){
  [...$('sections').children].forEach((li,i)=>{if(i===section)li.setAttribute('aria-current','true');else li.removeAttribute('aria-current');});
  renderPosition();
 }
 function buildSections(){
  $('sections').replaceChildren(...state.song.sections.map(x=>{const li=document.createElement('li');li.textContent=x.name;return li;}));
  renderSections();
 }
 async function togglePlay(){
  try{await ensureAudio();}catch{return;}
  running=!running;
  $('play').textContent=running?'Stop':'Play';$('play').setAttribute('aria-pressed',String(running));
  send({type:running?'play':'stop'});
  if(!running)showStep({pattern:-1,section:-1});
 }

 // ---- Sliders ----
 const sliders=[];
 function slider(host,{id,label,get,set,max=100}){
  const w=document.createElement('label');w.className='slider';
  const name=document.createElement('span'),out=document.createElement('output'),input=document.createElement('input');
  input.type='range';input.min=0;input.max=max;input.step=1;input.setAttribute('aria-label',t(label));input.id=`s-${id}`;
  const paint=()=>{input.value=Math.round(get());out.textContent=`${input.value}%`;};
  input.addEventListener('input',()=>{set(+input.value);out.textContent=`${input.value}%`;});
  w.append(name,out,input);host.appendChild(w);
  sliders.push({paint,name,input,label});paint();
 }
 const param=(id,label)=>({id,label,get:()=>state.params[id]*100,set:v=>{state.params[id]=v/100;send({type:'param',id,value:v/100});}});
 function buildSliders(){
  for(const c of [param('cutoff','Cutoff'),param('resonance','Risonanza'),param('drive','Drive'),param('fill','Fill')])slider($('acido-controls'),c);
  for(const c of [
   {id:'amount',label:'Esplora',get:()=>orbit.amount,set:v=>{orbit.amount=v;if(!keep)newPhrase(false);}},
   {id:'tone',label:'Luminosità',get:()=>orbit.tone,set:v=>{orbit.tone=v;send({type:'tone',value:v/100});}},
   {id:'send',label:'Riverbero',get:()=>orbit.send,set:v=>{orbit.send=v;send({type:'send',value:v/100});}}
  ])slider($('orbit-controls'),c);
  for(const c of [
   {id:'lead',label:'Acido',get:()=>mix.lead,set:v=>{mix.lead=v;send({type:'lead',value:v/75});}},
   {id:'orbit',label:'Orbit',get:()=>mix.orbit,set:v=>{mix.orbit=v;send({type:'orbit',value:v/100});}},
   param('bass','Basso'),param('kick','Cassa'),param('snare','Rullante'),param('hat','Hi-hat'),param('clap','Clap'),param('duck','Sidechain'),param('volume','Generale')
  ])slider($('mixer'),c);
 }
 function newPhrase(announce=true){
  orbit.seed=Math.floor(Math.random()*2147483647);
  timeline=L.buildTimeline(window.OrbitFlow,{notes:orbit.notes,amount:orbit.amount/100,seed:orbit.seed});
  sendPhrase();if(announce)status('Nuova frase pronta');
 }
 function loadSong(i){
  songIndex=i;const old=state.params,keepMix={};
  for(const id of ['bass','kick','snare','hat','clap','duck','volume'])keepMix[id]=old[id];
  state=clone(D.demos[i]);Object.assign(state.params,keepMix);
  $('tempo').value=state.tempo;
  if(!keep)newPhrase(false);
  section=-1;pattern=-1;buildSections();sendSong();
  for(const x of sliders)x.paint();
 }
 function applyLanguage(next){
  lang=['it',...LANGS].includes(next)?next:'en';document.documentElement.lang=lang;$('language').value=lang;
  for(const el of document.querySelectorAll('[data-t]'))el.textContent=t(el.dataset.t);
  for(const el of document.querySelectorAll('[data-label]'))el.setAttribute('aria-label',t(el.dataset.label));
  for(const x of sliders){x.name.textContent=t(x.label);x.input.setAttribute('aria-label',t(x.label));}
  if(lastStatus)$('status').textContent=t(lastStatus[0],lastStatus[1]);
 }
 function init(){
  const song=$('song');
  D.demos.forEach((d,i)=>song.add(new Option(d.name,i,false,i===songIndex)));
  const sound=$('sound');const NAMES={keys:'Soft Keys'};
  L.SOUNDS.forEach(id=>sound.add(new Option(NAMES[id]||id[0].toUpperCase()+id.slice(1),id)));
  buildSliders();buildSections();
  $('tempo').value=state.tempo;
  $('play').addEventListener('click',togglePlay);
  song.addEventListener('change',()=>loadSong(+song.value));
  sound.addEventListener('change',()=>{orbit.sound=sound.value;send({type:'sound',id:orbit.sound});});
  $('tempo').addEventListener('change',e=>{state.tempo=Math.round(Math.min(200,Math.max(60,+e.target.value||state.tempo)));e.target.value=state.tempo;send({type:'pattern',...songMsg()});});
  $('new-phrase').addEventListener('click',()=>newPhrase());
  $('keep').addEventListener('click',()=>{keep=!keep;$('keep').setAttribute('aria-pressed',String(keep));status(keep?'Frase tenuta':'La frase evolve a ogni brano');});
  $('new-beat').addEventListener('click',()=>{
   const style=$('beat-style').value,seed=Math.floor(Math.random()*2147483647);
   state.patterns.filter(p=>p.steps.some(s=>s.gate||s.bass>=0)&&B.hasDrums(p)).forEach((p,i)=>B.applyDrums(p,B.generate(style,seed,i%4)));
   send({type:'pattern',...songMsg()});status('Ritmo: {style}',{style:style[0].toUpperCase()+style.slice(1)});
  });
  $('language').addEventListener('change',e=>{applyLanguage(e.target.value);store.set(lang);});
  document.addEventListener('keydown',e=>{
   if(e.key!==' '||e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
   if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName))return;
   e.preventDefault();togglePlay();
  });
  const saved=store.get(),browser=(navigator.language||'en').slice(0,2);
  applyLanguage(saved||browser);
 }
 init();
})();

/* Luma Studio UI. Everything audible runs in one worklet. */
(function(){
 const S=window.AcidoSession,B=window.AcidoBeats,D=window.AcidoDemos,L=window.LumaOrbitLayer,X=window.LumaMixer,$=id=>document.getElementById(id);
 const WORDS={
  'Lingua':['Language','Langue','Sprache','Idioma'],'Arrangiamento':['Arrangement','Arrangement','Arrangement','Arreglo'],'Brano':['Song','Morceau','Song','Canción'],'Batteria':['Drums','Batterie','Drums','Batería'],'Nuovo ritmo':['New beat','Nouveau rythme','Neuer Beat','Nuevo ritmo'],
  'Timbro':['Timbre','Timbre','Klang','Timbre'],'Nuova frase':['New phrase','Nouvelle phrase','Neue Phrase','Nueva frase'],'Tieni la frase':['Keep phrase','Garder la phrase','Phrase halten','Mantener frase'],
  'Orbit resta nella tonalità del brano e segue gli accordi del basso.':['Orbit stays in the song key and follows the bass chords.','Orbit reste dans la tonalité du morceau et suit les accords de la basse.','Orbit bleibt in der Tonart des Songs und folgt den Bassakkorden.','Orbit se mantiene en la tonalidad y sigue los acordes del bajo.'],
  'Mixer':['Mixer','Mixeur','Mixer','Mezclador'],'Tempo':['Tempo','Tempo','Tempo','Tempo'],'Risonanza':['Resonance','Résonance','Resonanz','Resonancia'],'Esplora':['Explore','Explorer','Erkunden','Explorar'],'Luminosità':['Brightness','Luminosité','Helligkeit','Brillo'],'Riverbero':['Reverb','Réverb','Hall','Reverb'],
  'Basso':['Bass','Basse','Bass','Bajo'],'Cassa':['Kick','Kick','Kick','Bombo'],'Rullante':['Snare','Caisse claire','Snare','Caja'],'Generale':['Master','Général','Gesamt','General'],'Muto':['Mute','Muet','Stumm','Silencio'],'Distorsione':['Distortion','Distorsion','Verzerrung','Distorsión'],'Tonalità':['Key','Tonalité','Tonart','Tono'],'Ottava':['Octave','Octave','Oktave','Octava'],'Ripeti sezione':['Loop section','Boucler la section','Abschnitt loopen','Repetir sección'],'Tastiera: Spazio play · 1-7 muto · Maiusc+1-7 solo · ← → sezione · L ripeti · B ritmo · N frase · G stutter':['Keys: Space play · 1-7 mute · Shift+1-7 solo · ← → section · L loop · B beat · N phrase · G stutter','Touches : Espace lecture · 1-7 muet · Maj+1-7 solo · ← → section · L boucle · B rythme · N phrase · G stutter','Tasten: Leertaste Play · 1-7 Stumm · Umschalt+1-7 Solo · ← → Abschnitt · L Loop · B Beat · N Phrase · G Stutter','Teclas: Espacio play · 1-7 silencio · Mayús+1-7 solo · ← → sección · L repetir · B ritmo · N frase · G stutter'],'Togli muti e solo':['Clear mute and solo','Retirer muet et solo','Mute und Solo aufheben','Quitar silencio y solo'],
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
 const orbit={sound:'glass',amount:35,tone:62,notes:[0,4,2,6,4,7,2,3],seed:1};
 const mix={lead:75,orbit:55},returns={delay:1,reverb:1},touched=new Set();
 const strips=X.CHANNELS.map(id=>({mute:false,solo:false,pan:0,delay:0,reverb:id==='orbit'?.12:0}));
 const stripIndex=id=>X.CHANNELS.indexOf(id);
 // Each song brings its own lead echo and room, unless the user has moved that send.
 function songSends(){
  const {delay,reverb}=state.params;
  for(const [id,fx,v] of [['lead','delay',delay],['lead','reverb',reverb],['snare','reverb',reverb*.8],['clap','reverb',reverb*.8]])if(!touched.has(`${id}.${fx}`))strips[stripIndex(id)][fx]=v;
 }
 songSends();
 let timeline=L.buildTimeline(window.OrbitFlow,{notes:orbit.notes,amount:orbit.amount/100,seed:orbit.seed});
 const send=m=>{if(node)node.port.postMessage(m);};
 let key=0,queuedSection=-1,looping=false;
 const songMsg=()=>({tempo:state.tempo,swing:state.swing,patterns:state.patterns,chain:state.chain,song:state.song,transpose:key,scale:D.defs[songIndex].scale.map(pc=>(pc+key+24)%12)});
 const sendSong=()=>send({type:'load',params:state.params,...songMsg()});
 const sendPhrase=()=>send({type:'phrase',deg:timeline.deg,beats:timeline.beats});
 const sendStrip=i=>send({type:'strip',i,...strips[i]});
 const sendReturns=()=>send({type:'returns',...returns});

 async function ensureAudio(){
  if(ctx){if(ctx.state!=='running')await ctx.resume();return;}
  if(starting)return starting;
  starting=(async()=>{
   if(navigator.audioSession)try{navigator.audioSession.type='playback';}catch{}
   const c=new AudioContext({latencyHint:'interactive'});
   await c.audioWorklet.addModule('./studio-worklet.js');
   const n=new AudioWorkletNode(c,'luma-studio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
   n.connect(c.destination);
   n.port.onmessage=({data})=>{if(data.type==='step'){const delay=((c.outputLatency||0)+(c.baseLatency||0))*1000;setTimeout(()=>showStep(data),delay);}else if(data.type==='meters')showMeters(data.peaks);};
   ctx=c;node=n;
   sendSong();sendPhrase();
   send({type:'sound',id:orbit.sound});send({type:'tone',value:orbit.tone/100});strips.forEach((_,i)=>sendStrip(i));sendReturns();send({type:'orbit',value:mix.orbit/100});send({type:'lead',value:mix.lead/75});send({type:'octave',value:+$('octave').value});send({type:'loop',on:looping});if(queuedSection>=0)send({type:'section',i:queuedSection});
   if(c.state!=='running')await c.resume();
  })();
  try{await starting;}catch(err){ctx=null;node=null;status('Audio non disponibile');throw err;}finally{starting=null;}
 }
 const meters=[];
 function showMeters(peaks){meters.forEach((el,i)=>{const db=20*Math.log10(Math.max(peaks[i],1e-5));el.style.transform=`scaleY(${Math.max(0,Math.min(1,1+db/48)).toFixed(3)})`;});}
 function showStep({pattern:p,section:s}){
  if(!running){s=-1;p=-1;}
  if(s!==section){section=s;if(s===queuedSection)queuedSection=-1;renderSections();}
  if(p!==pattern){pattern=p;renderPosition();}
 }
 function renderPosition(){
  const name=running&&section>=0?state.song.sections[section]?.name:'',pat=running&&pattern>=0?S.PATTERN_NAMES[pattern]:'';
  $('position').textContent=[name,pat].filter(Boolean).join(' · ');
 }
 function renderSections(){
  [...$('sections').children].forEach((li,i)=>{if(i===section)li.setAttribute('aria-current','true');else li.removeAttribute('aria-current');li.firstChild.toggleAttribute('data-queued',i===queuedSection);});
  renderPosition();
 }
 function buildSections(){
  $('sections').replaceChildren(...state.song.sections.map((x,i)=>{const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=x.name;b.addEventListener('click',()=>jumpTo(i));li.append(b);return li;}));
  renderSections();
 }
 async function jumpTo(i){
  try{await ensureAudio();}catch{return;}
  queuedSection=i;send({type:'section',i});renderSections();
 }
 function moveSection(by){
  const n=state.song.sections.length;if(!n)return;
  const from=queuedSection>=0?queuedSection:Math.max(section,0);jumpTo((from+by+n)%n);
 }
 function toggleLoop(){looping=!looping;$('loop').setAttribute('aria-pressed',String(looping));send({type:'loop',on:looping});}
 function setStutter(on){$('stutter').setAttribute('aria-pressed',String(on));send({type:'stutter',on});}
 function toggleStrip(i,key){const b=$(`${key}-${X.CHANNELS[i]}`);if(b)b.click();}
 async function togglePlay(){
  try{await ensureAudio();}catch{return;}
  running=!running;
  $('play').textContent=running?'Stop':'Play';$('play').setAttribute('aria-pressed',String(running));
  send({type:running?'play':'stop'});
  if(!running)showStep({pattern:-1,section:-1});
 }


 // ---- Sliders ----
 const sliders=[],labels=[];
 const percent=v=>`${v}%`,panText=v=>+v===0?'C':`${v<0?'L':'R'}${Math.abs(v)}`;
 function slider(host,{id,label,get,set,min=0,max=100,format=percent,aria=()=>t(label),className='',hold=null}){
  const w=document.createElement('label');w.className=`slider ${className}`.trim();
  const name=document.createElement('span'),out=document.createElement('output'),input=document.createElement('input');
  input.type='range';input.min=min;input.max=max;input.step=1;input.setAttribute('aria-label',aria());input.id=`s-${id}`;
  const paint=()=>{input.value=Math.round(get());out.textContent=format(input.value);};
  input.addEventListener('input',()=>{set(+input.value);out.textContent=format(input.value);});
  if(hold){ // while a knob is touched it wins over the song automation
   const grab=on=>send({type:'hold',id:hold,on});
   input.addEventListener('pointerdown',()=>grab(true));input.addEventListener('keydown',()=>grab(true));
   for(const ev of ['pointerup','pointercancel','keyup','blur'])input.addEventListener(ev,()=>grab(false));
  }
  w.append(name,out,input);host.appendChild(w);
  sliders.push({paint,name,input,label,aria});paint();
 }
 const param=(id,label)=>({id,label,hold:S.AUTO_PARAMS.includes(id)?id:null,get:()=>state.params[id]*100,set:v=>{state.params[id]=v/100;send({type:'param',id,value:v/100});}});
 function buildSliders(){
  for(const c of [param('cutoff','Cutoff'),param('resonance','Risonanza'),param('envMod','Env Mod'),param('decay','Decay'),param('accent','Accent'),param('drive','Drive'),param('distortion','Distorsione'),param('crush','Crush'),param('glitch','Glitch'),param('fill','Fill')])slider($('acido-controls'),c);
  for(const c of [
   {id:'amount',label:'Esplora',get:()=>orbit.amount,set:v=>{orbit.amount=v;if(!keep)newPhrase(false);}},
   {id:'tone',label:'Luminosità',get:()=>orbit.tone,set:v=>{orbit.tone=v;send({type:'tone',value:v/100});}}
  ])slider($('orbit-controls'),c);
  buildMixer();
 }
 function buildMixer(){
  const faders={
   lead:{id:'lead',label:'Acido',get:()=>mix.lead,set:v=>{mix.lead=v;send({type:'lead',value:v/75});}},
   orbit:{id:'orbit',label:'Orbit',get:()=>mix.orbit,set:v=>{mix.orbit=v;send({type:'orbit',value:v/100});}},
   bass:param('bass','Basso'),kick:param('kick','Cassa'),snare:param('snare','Rullante'),hat:param('hat','Hi-hat'),clap:param('clap','Clap')
  };
  const shell=(label,master)=>{
   const el=document.createElement('div');el.className=master?'strip master':'strip';el.setAttribute('role','group');
   const h=document.createElement('h3');h.dataset.t=label;h.textContent=t(label);el.dataset.label=label;el.setAttribute('aria-label',t(label));el.append(h);
   return el;
  };
  const channel=(el,fader)=>{
   const box=document.createElement('div');box.className='channel';
   const meter=document.createElement('div');meter.className='meter';meter.setAttribute('aria-hidden','true');
   const bar=document.createElement('i');meter.append(bar);meters.push(bar);box.append(meter);el.append(box);
   slider(box,{...fader,className:'fader'});
  };
  X.CHANNELS.forEach((id,i)=>{
   const f=faders[id],s=strips[i],el=shell(f.label);
   const ms=document.createElement('div');ms.className='ms';
   for(const [key,text,word] of [['mute','M','Muto'],['solo','S','Solo']]){
    const b=document.createElement('button');b.type='button';b.className=key;b.textContent=text;b.setAttribute('aria-pressed','false');b.id=`${key}-${id}`;
    const aria=()=>`${t(word)} ${t(f.label)}`;b.setAttribute('aria-label',aria());labels.push(()=>b.setAttribute('aria-label',aria()));
    b.addEventListener('click',()=>{s[key]=!s[key];b.setAttribute('aria-pressed',String(s[key]));sendStrip(i);});
    ms.append(b);
   }
   el.append(ms);channel(el,f);
   const named=word=>()=>`${t(word)} ${t(f.label)}`;
   slider(el,{id:`${id}-pan`,label:'Pan',min:-100,format:panText,aria:named('Pan'),get:()=>s.pan*100,set:v=>{s.pan=v/100;sendStrip(i);}});
   for(const [fx,word] of [['delay','Delay'],['reverb','Riverbero']])slider(el,{id:`${id}-${fx}`,label:word,aria:named(word),get:()=>s[fx]*100,set:v=>{s[fx]=v/100;touched.add(`${id}.${fx}`);sendStrip(i);}});
   $('mixer').append(el);
  });
  const master=shell('Generale',true);
  channel(master,param('volume','Generale'));
  const named=word=>()=>`${t(word)} ${t('Generale')}`;
  slider(master,{...param('duck','Sidechain'),aria:named('Sidechain')});
  for(const [fx,word] of [['delay','Delay'],['reverb','Riverbero']])slider(master,{id:`return-${fx}`,label:word,aria:named(word),get:()=>returns[fx]*100,set:v=>{returns[fx]=v/100;sendReturns();}});
  $('mixer').append(master);
  $('mix-clear').addEventListener('click',()=>{
   strips.forEach((s,i)=>{s.mute=false;s.solo=false;sendStrip(i);});
   for(const b of $('mixer').querySelectorAll('.ms button'))b.setAttribute('aria-pressed','false');
  });
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
  songSends();strips.forEach((_,n)=>sendStrip(n));
  $('tempo').value=state.tempo;
  if(!keep)newPhrase(false);
  section=-1;pattern=-1;queuedSection=-1;buildSections();sendSong();
  for(const x of sliders)x.paint();
 }
 function applyLanguage(next){
  lang=['it',...LANGS].includes(next)?next:'en';document.documentElement.lang=lang;$('language').value=lang;
  for(const el of document.querySelectorAll('[data-t]'))el.textContent=t(el.dataset.t);
  for(const el of document.querySelectorAll('[data-label]'))el.setAttribute('aria-label',t(el.dataset.label));
  for(const x of sliders){x.name.textContent=t(x.label);x.input.setAttribute('aria-label',x.aria());}
  for(const fn of labels)fn();
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
  $('key').addEventListener('change',e=>{key=Math.round(Math.min(12,Math.max(-12,+e.target.value||0)));e.target.value=key;send({type:'pattern',...songMsg()});});
  $('octave').addEventListener('change',e=>send({type:'octave',value:+e.target.value}));
  $('loop').addEventListener('click',toggleLoop);
  const st=$('stutter');st.addEventListener('pointerdown',e=>{st.setPointerCapture(e.pointerId);setStutter(true);});
  for(const ev of ['pointerup','pointercancel'])st.addEventListener(ev,()=>setStutter(false));
  st.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();setStutter(true);}});
  st.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')setStutter(false);});
  st.addEventListener('blur',()=>setStutter(false));
  window.addEventListener('blur',()=>setStutter(false));
  $('new-phrase').addEventListener('click',()=>newPhrase());
  $('keep').addEventListener('click',()=>{keep=!keep;$('keep').setAttribute('aria-pressed',String(keep));status(keep?'Frase tenuta':'La frase evolve a ogni brano');});
  $('new-beat').addEventListener('click',()=>{
   const style=$('beat-style').value,seed=Math.floor(Math.random()*2147483647);
   state.patterns.filter(p=>p.steps.some(s=>s.gate||s.bass>=0)&&B.hasDrums(p)).forEach((p,i)=>B.applyDrums(p,B.generate(style,seed,i%4)));
   send({type:'pattern',...songMsg()});status('Ritmo: {style}',{style:style[0].toUpperCase()+style.slice(1)});
  });
  $('language').addEventListener('change',e=>{applyLanguage(e.target.value);store.set(lang);});
  document.addEventListener('keydown',e=>{
   if(e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;
   const el=e.target,range=el.tagName==='INPUT'&&el.type==='range';
   if(el.tagName==='SELECT'||el.tagName==='TEXTAREA'||(el.tagName==='INPUT'&&!range))return;
   const digit=/^Digit([1-7])$/.exec(e.code);
   if(digit){e.preventDefault();toggleStrip(+digit[1]-1,e.shiftKey?'solo':'mute');return;}
   if(e.key===' '){if(el.tagName==='BUTTON')return;e.preventDefault();togglePlay();return;}
   if(!range&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();moveSection(e.key==='ArrowLeft'?-1:1);return;}
   const letter=e.key.toLowerCase();
   if(letter==='l')toggleLoop();else if(letter==='b')$('new-beat').click();else if(letter==='n')newPhrase();else if(letter==='g')setStutter(true);
  });
  document.addEventListener('keyup',e=>{if(e.key.toLowerCase()==='g')setStutter(false);});
  const saved=store.get(),browser=(navigator.language||'en').slice(0,2);
  applyLanguage(saved||browser);
 }
 init();
})();

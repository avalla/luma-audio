/* UI, keyboard and persistence. No DSP here: everything audible runs in the worklet. */
(function(){
 const S=window.AcidoSession,I=window.AcidoI18n,tr=I.t,$=id=>document.getElementById(id);
 const STORE='acido.state.v1'; // version 1 data (single pattern) is migrated by S.validate
 const KEYS='awsedftgyhujk';
 let state=load()||clone(S.presets[0]);
 let ctx=null,node=null,starting=null,running=false,kbOctave=0,transpose=0;
 let ledStep=-1,playPat=-1,queuedPat=-1,clipboard=null;
 const held=[];
 const T=window.AcidoTools,undoStack=new T.History(),touched=new Set();
 let rec=false,autoLane='cutoff',exportWorker=null;
 const M=window.AcidoMidi;
 let viewBank=0,editBass=false,playSection=-1,midi=null,midiResult=null,userPresets=[],follow=true;
 const B=window.AcidoBeats;

 // ---- Undo ----
 function mark(tag){undoStack.mark(()=>JSON.stringify(state),tag,performance.now());renderHistory();}
 function renderHistory(){$('undo').disabled=!undoStack.canUndo;$('redo').disabled=!undoStack.canRedo;}
 function stepHistory(dir){
  const now=JSON.stringify(state),raw=dir<0?undoStack.undo(now):undoStack.redo(now);
  if(raw){applyState(JSON.parse(raw));status(dir<0?'Annullato':'Ripristinato');}
  renderHistory();
 }

 function clone(o){return JSON.parse(JSON.stringify(o));}
 function load(){try{const raw=localStorage.getItem(STORE);return raw?S.validate(JSON.parse(raw)):null;}catch{return null;}}
 let saveTimer=0;
 function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(STORE,JSON.stringify(state));}catch{}},250);}
 const send=m=>{if(node)node.port.postMessage(m);};
 const pat=()=>state.patterns[state.current];
 const sendPattern=()=>send({type:'pattern',tempo:state.tempo,swing:state.swing,patterns:state.patterns,chain:state.chain,song:state.song,transpose});

 async function ensureAudio(){
  if(ctx){if(ctx.state!=='running')await ctx.resume();return;}
  if(starting)return starting;
  starting=(async()=>{
   if(navigator.audioSession)try{navigator.audioSession.type='playback';}catch{}
   const c=new AudioContext({latencyHint:'interactive'});
   await c.audioWorklet.addModule('./worklet.js');
   const n=new AudioWorkletNode(c,'acido',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
   n.connect(c.destination);
   n.port.onmessage=({data})=>{if(data.type==='step'){const delay=((c.outputLatency||0)+(c.baseLatency||0))*1000;setTimeout(()=>showStep(data),delay);}};
   ctx=c;node=n;
   send({type:'params',params:state.params});sendPattern();send({type:'select',index:state.current});
   if(c.state!=='running')await c.resume();
  })();
  try{await starting;}catch(err){status('Audio non disponibile: {error}',{error:err.message});ctx=null;node=null;throw err;}finally{starting=null;}
 }
 function status(key,params){I.text('status',key,params);}

 // ---- Knobs ----
 const knobs={};
 function buildKnobs(){
  const host=$('knobs');
  const groups=[['Voce',['tuning','cutoff','resonance','envMod','decay','accent']],['Distorsione',['drive','distortion','distTone']],['Glitch',['crush','glitch','glitchSize']],['Basso',['bass','bassTone','bassDecay']],['Formanti',['formant','vowel']],['Cassa',['kick','kickTune','kickDecay','duck']],['Percussioni',['snare','hat','clap','fill']],['Uscita',['delay','reverb','reverbSize','volume']]];
  for(const [title,ids] of groups){
   const g=document.createElement('div');g.className='knob-group';g.setAttribute('role','group');I.attr(g,'aria-label',title);
   const cap=document.createElement('span');cap.className='group-title';I.text(cap,title);cap.setAttribute('aria-hidden','true');g.appendChild(cap);
   for(const id of ids){
    const p=S.params.find(x=>x.id===id);
    const w=document.createElement('div');w.className='knob-wrap';
    w.innerHTML=`<div class="knob" role="slider" tabindex="0" aria-label="${p.label}" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="26" pathLength="100"/><circle class="arc" cx="32" cy="32" r="26" pathLength="100"/><circle class="cap" cx="32" cy="32" r="19"/><line class="pointer" x1="32" y1="32" x2="32" y2="17"/></svg></div><span class="knob-label">${p.label}</span><span class="knob-value" aria-hidden="true"></span>`;
    const el=w.querySelector('.knob');knobs[id]={el,wrap:w,p};I.attr(el,'aria-label',p.label);I.text(w.querySelector('.knob-label'),p.label);
    attachKnob(el,id);g.appendChild(w);
   }
   host.appendChild(g);
  }
 }
 function attachKnob(el,id){
  let startY=0,startV=0,drag=false;
  el.addEventListener('pointerdown',e=>{drag=true;startY=e.clientY;startV=state.params[id];el.setPointerCapture(e.pointerId);el.focus({preventScroll:true});touch(id,true);e.preventDefault();});
  el.addEventListener('pointermove',e=>{if(!drag)return;const range=e.shiftKey?900:220;setParam(id,startV+(startY-e.clientY)/range);});
  const end=()=>{drag=false;touch(id,false);};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('dblclick',()=>setParam(id,S.defaults[id]));
  el.addEventListener('keydown',e=>{
   const stepV=e.shiftKey?.01:.05,map={ArrowUp:stepV,ArrowRight:stepV,ArrowDown:-stepV,ArrowLeft:-stepV,PageUp:.2,PageDown:-.2};
   if(e.key in map){setParam(id,state.params[id]+map[e.key]);e.preventDefault();e.stopPropagation();}
   else if(e.key==='Home'){setParam(id,0);e.preventDefault();e.stopPropagation();}
   else if(e.key==='End'){setParam(id,1);e.preventDefault();e.stopPropagation();}
  });
 }
 function setParam(id,v){
  v=Math.min(1,Math.max(0,v));mark(`p:${id}`);state.params[id]=v;send({type:'param',id,value:v});renderParam(id);
  if(rec&&running&&ledStep>=0&&playPat>=0&&S.AUTO_PARAMS.includes(id))writeAuto(playPat,ledStep,id,v);
  save();
 }
 // A knob in hand overrides its automation, so what you hear is what gets recorded.
 function touch(id,on){
  if(!S.AUTO_PARAMS.includes(id))return;
  if(on)touched.add(id);else touched.delete(id);
  send({type:'hold',id,on});
 }
 function writeAuto(p,i,id,v){
  const x=state.patterns[p],lane=x.auto[id]||(x.auto[id]=Array(S.STEPS).fill(null));
  lane[i]=v;
  if(lane.every(n=>n===null))delete x.auto[id];
  send({type:'auto',pattern:p,step:i,id,value:v});
  if(p===state.current&&id===autoLane)renderLane();
  save();
 }
 function renderParam(id){
  const v=state.params[id];
  const opts=[...document.querySelectorAll(`[data-param="${id}"]`)];
  if(opts.length){const pick=opts.reduce((a,b)=>Math.abs(+b.dataset.value-v)<Math.abs(+a.dataset.value-v)?b:a);for(const b of opts)b.setAttribute('aria-checked',String(b===pick));return;}
  const k=knobs[id];if(!k)return;
  const angle=-135+v*270;
  k.el.style.setProperty('--v',v);k.el.querySelector('.pointer').setAttribute('transform',`rotate(${angle} 32 32)`);
  const text=k.p.format(v);
  k.el.setAttribute('aria-valuenow',Math.round(v*100));k.el.setAttribute('aria-valuetext',text);
  k.wrap.querySelector('.knob-value').textContent=text;
 }

 // ---- Pattern banks: 4 x A–H ----
 const patButtons=[],bankButtons=[];
 const patUsed=p=>p.steps.some(s=>s.gate||s.bass>=0);
 function buildPatterns(){
  const host=$('patterns'),banks=$('banks');
  for(let n=0;n<S.BANKS;n++){
   const b=document.createElement('button');b.type='button';b.className='bank';b.textContent=String(n+1);
   b.addEventListener('click',()=>{viewBank=n;renderPatterns();});
   banks.appendChild(b);bankButtons.push(b);
  }
  for(let j=0;j<S.BANK;j++){
   const b=document.createElement('button');b.type='button';b.className='pat';
   b.addEventListener('click',()=>selectPattern(viewBank*S.BANK+j));
   host.appendChild(b);patButtons.push(b);
  }
 }
 function selectPattern(i){
  // In a song the sections decide what plays: picking another pattern means you want to edit it.
  if(running&&state.song.on&&i!==playPat)setFollow(false);
  state.current=i;viewBank=Math.floor(i/S.BANK);
  send({type:'select',index:i});
  if(running&&i!==playPat&&!state.song.on)queuedPat=i;else queuedPat=-1;
  renderPatterns();renderRoll();showLed();save();
 }
 function renderPatterns(){
  bankButtons.forEach((b,n)=>{
   const list=state.patterns.slice(n*S.BANK,(n+1)*S.BANK);
   b.setAttribute('aria-pressed',String(n===viewBank));b.classList.toggle('used',list.some(patUsed));
   b.classList.toggle('playing',running&&playPat>=0&&Math.floor(playPat/S.BANK)===n);
   b.setAttribute('aria-label',tr('Banco {n}',{n:n+1}));
  });
  patButtons.forEach((b,j)=>{
   const i=viewBank*S.BANK+j,p=state.patterns[i],used=patUsed(p);
   b.textContent=S.PATTERN_NAMES[i];
   b.setAttribute('aria-pressed',String(i===state.current));
   b.classList.toggle('used',used);b.classList.toggle('playing',running&&i===playPat);b.classList.toggle('queued',running&&i===queuedPat);
   b.setAttribute('aria-label',[`Pattern ${S.PATTERN_NAMES[i]}`,!used&&tr('vuoto'),running&&i===playPat&&tr('in riproduzione'),running&&i===queuedPat&&tr('in coda')].filter(Boolean).join(', '));
  });
  $('length').value=pat().length;
 }

 // ---- Sequencer roll ----
 const cells=[],octCells=[],gateCells=[],accCells=[],slideCells=[],kickCells=[],snareCells=[],hatCells=[],clapCells=[],vowelCells=[],autoCells=[],heads=[];
 const GATE_LABELS=['·','C','L'];
 function buildRoll(){
  const roll=$('roll');
  const add=(cls,text='',tag='div')=>{const d=document.createElement(tag);d.className=cls;d.textContent=text;roll.appendChild(d);return d;};
  add('roll-label','');
  for(let i=0;i<S.STEPS;i++)heads.push(add('roll-head',String(i+1)));
  for(let n=12;n>=0;n--){
   const name=S.NOTE_NAMES[n],black=name.includes('#');
   add(`roll-label${black?' black':''}`,name);
   cells[n]=[];
   for(let i=0;i<S.STEPS;i++){
    const b=add(`cell${black?' black':''}${i%4===0?' beat':''}`,'','button');b.type='button';
    b.addEventListener('click',()=>toggleNote(i,n));
    cells[n][i]=b;
   }
  }
  const row=(label,list,cls,fn)=>{I.text(add('roll-label row-name'),label);for(let i=0;i<S.STEPS;i++){const b=add(`flag ${cls}`,'','button');b.type='button';b.addEventListener('click',()=>fn(i));list[i]=b;}};
  const nextOct=o=>o===0?1:o===1?-1:0;
  row('Ott',octCells,'oct',i=>edit(i,s=>{if(editBass)s.bassOct=nextOct(s.bassOct);else s.octave=nextOct(s.octave);}));
  row('Gate',gateCells,'gate',i=>edit(i,s=>{s.gateLen=(s.gateLen+1)%3;}));
  row('Acc',accCells,'acc',i=>edit(i,s=>{s.accent=!s.accent;}));
  row('Slide',slideCells,'slide',i=>edit(i,s=>{if(editBass){if(s.bass>=0)s.bassTie=!s.bassTie;}else s.slide=!s.slide;}));
  row('Voc',vowelCells,'vowel',i=>edit(i,s=>{
   s.vowel=s.vowel>=4?-1:s.vowel+1;
   if(s.vowel>=0&&state.params.formant<.01){state.params.formant=.7;send({type:'param',id:'formant',value:.7});renderParam('formant');}
  }));
  row('Kick',kickCells,'kick',toggleKick);
  row('Snare',snareCells,'snare',i=>edit(i,s=>{s.snare=(s.snare+1)%3;}));
  row('Hat',hatCells,'hat',i=>edit(i,s=>{s.hat=(s.hat+1)%3;}));
  row('Clap',clapCells,'clap',i=>edit(i,s=>{s.clap=!s.clap;}));
  I.text(add('roll-label row-name'),'Auto');
  for(let i=0;i<S.STEPS;i++){
   const b=add('flag auto-bar');b.tabIndex=0;b.setAttribute('role','slider');b.setAttribute('aria-valuemin','0');b.setAttribute('aria-valuemax','100');
   b.addEventListener('pointerdown',e=>{mark();b.setPointerCapture(e.pointerId);b.dataset.drawing='1';drawAuto(e);e.preventDefault();b.focus({preventScroll:true});});
   b.addEventListener('pointermove',e=>{if(b.dataset.drawing)drawAuto(e);});
   for(const ev of ['pointerup','pointercancel'])b.addEventListener(ev,()=>{delete b.dataset.drawing;});
   b.addEventListener('dblclick',()=>{mark();writeAuto(state.current,i,autoLane,null);});
   b.addEventListener('keydown',e=>{
    const now=pat().auto[autoLane]?.[i]??state.params[autoLane],d={ArrowUp:.05,ArrowRight:.05,ArrowDown:-.05,ArrowLeft:-.05}[e.key];
    if(d){mark(`a:${i}`);writeAuto(state.current,i,autoLane,Math.min(1,Math.max(0,now+d)));e.preventDefault();}
    else if(e.key==='Delete'||e.key==='Backspace'){mark();writeAuto(state.current,i,autoLane,null);e.preventDefault();}
   });
   autoCells[i]=b;
  }
 }
 function drawAuto(e){
  const i=autoCells.findIndex(c=>{const r=c.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<r.right;});
  if(i<0)return;
  const r=autoCells[i].getBoundingClientRect();
  writeAuto(state.current,i,autoLane,Math.min(1,Math.max(0,(r.bottom-e.clientY)/r.height)));
 }
 function renderLane(){
  const lane=pat().auto[autoLane],p=S.params.find(x=>x.id===autoLane);
  autoCells.forEach((c,i)=>{
   const v=lane?lane[i]:null,set=v!==null&&v!==undefined;
   c.style.setProperty('--h',set?v:0);c.classList.toggle('on',set);c.classList.toggle('out',i>=pat().length);
   c.setAttribute('aria-label',`${tr('Passo {n}',{n:i+1})}, ${tr('Automazione di {name}',{name:p.label})}`);
   c.setAttribute('aria-valuenow',set?Math.round(v*100):Math.round(state.params[autoLane]*100));
   c.setAttribute('aria-valuetext',set?p.format(v):tr('segue il pomello'));
  });
 }
 // A pattern follows the automatic 4/4 until its first kick edit.
 function toggleKick(i){
  mark();const p=pat();
  if(!p.kicks)p.kicks=Array.from({length:S.STEPS},(_,j)=>j%4===0);
  p.kicks[i]=!p.kicks[i];changed();
 }
 function toggleNote(i,n){
  if(editBass){
   edit(i,s=>{if(s.bass===n){s.bass=-1;s.bassTie=false;}else s.bass=n;});
   if(!running&&pat().steps[i].bass>=0)preview(i);
   return;
  }
  edit(i,s=>{if(s.gate&&s.note===n)s.gate=false;else{s.gate=true;s.note=n;}});if(!running&&pat().steps[i].gate)preview(i);
 }
 function changed(){renderRoll();renderPatterns();sendPattern();save();}
 function edit(i,fn){mark();fn(pat().steps[i]);changed();}
 async function preview(i){
  try{await ensureAudio();}catch{return;}
  const s=pat().steps[i];
  if(editBass){send({type:'bassOn',note:36+s.bassOct*12+s.bass+transpose});setTimeout(()=>{if(!running)send({type:'bassOff'});},200);return;}
  send({type:'on',note:36+s.octave*12+s.note+transpose,accent:s.accent,slide:false});
  setTimeout(()=>{if(!running&&!held.length)send({type:'off'});},160);
 }
 function renderRoll(){
  const p=pat();
  for(let i=0;i<S.STEPS;i++){
   const s=p.steps[i],out=i>=p.length,stepName=tr('Passo {n}',{n:i+1});
   const leadAt=n=>s.gate&&s.note===n,bassAt=n=>s.bass===n;
   for(let n=0;n<=12;n++){const on=editBass?bassAt(n):leadAt(n);cells[n][i].classList.toggle('on',on);cells[n][i].classList.toggle('bass-note',editBass&&on);cells[n][i].classList.toggle('ghost',!on&&(editBass?leadAt(n):bassAt(n)));cells[n][i].setAttribute('aria-pressed',String(on));cells[n][i].classList.toggle('out',out);cells[n][i].setAttribute('aria-label',`${stepName}, ${S.NOTE_NAMES[n]}`);}
   const oct=editBass?s.bassOct:s.octave;
   const o=octCells[i];o.textContent=oct===1?'UP':oct===-1?'DN':'·';o.classList.toggle('on',oct!==0);o.setAttribute('aria-label',`${stepName}, ${tr(oct===1?'ottava su':oct===-1?'ottava giù':'ottava normale')}`);
   const g=gateCells[i];g.textContent=tr(GATE_LABELS[s.gateLen]);g.classList.toggle('on',s.gateLen!==0);g.setAttribute('aria-label',`${stepName}, ${tr(`gate ${S.GATE_NAMES[s.gateLen]}`)}`);
   for(const [list,flag,name] of [[accCells,s.accent,'accent'],[slideCells,editBass?s.bassTie:s.slide,'slide']]){list[i].classList.toggle('on',flag);list[i].setAttribute('aria-pressed',String(flag));list[i].setAttribute('aria-label',`${stepName}, ${name}`);}
   const kickOn=p.kicks?p.kicks[i]:i%4===0,kc=kickCells[i];kc.classList.toggle('on',kickOn);kc.classList.toggle('auto',!p.kicks);kc.setAttribute('aria-pressed',String(kickOn));kc.setAttribute('aria-label',`${stepName}, kick`);
   const sn=snareCells[i];sn.textContent=['·','X','g'][s.snare];sn.classList.toggle('on',s.snare!==0);sn.setAttribute('aria-label',`${stepName}, snare ${['off','full','ghost'][s.snare]}`);
   const h=hatCells[i];h.textContent=['·','CH','OH'][s.hat];h.classList.toggle('on',s.hat!==0);h.setAttribute('aria-label',`${stepName}, hat ${['off','closed','open'][s.hat]}`);
   const c=clapCells[i];c.classList.toggle('on',s.clap);c.setAttribute('aria-pressed',String(s.clap));c.setAttribute('aria-label',`${stepName}, clap`);
   const w=vowelCells[i];w.textContent=s.vowel>=0?S.VOWEL_NAMES[s.vowel]:'·';w.classList.toggle('on',s.vowel>=0);w.setAttribute('aria-label',`${stepName}, ${tr('vocale')} ${s.vowel>=0?S.VOWEL_NAMES[s.vowel]:tr('dal pomello')}`);
   for(const el of [o,g,accCells[i],slideCells[i],kc,sn,h,c,w,heads[i]])el.classList.toggle('out',out);
  }
  renderLane();
 }
 // The LED follows playback only when the edited pattern is the one playing.
 function showStep({step,pattern,queued,section=-1}){
  const lit=running?section:-1; // a late message from the worklet must not relight a section after Stop
  if(lit!==playSection){playSection=lit;markSection();}
  if(!running){ledStep=-1;playPat=-1;queuedPat=-1;}
  else{
   ledStep=step;playPat=pattern;
   // A message sent before the worklet saw our selection reports no queue: keep ours until that pattern starts.
   if(queued>=0||pattern===queuedPat||queuedPat<0)queuedPat=queued;
   // Follow: the grid shows what is playing, unless a queued pattern is about to start.
   if(follow&&pattern>=0&&pattern!==state.current&&queuedPat<0){state.current=pattern;viewBank=Math.floor(pattern/S.BANK);renderRoll();}
   if(rec&&step>=0)for(const id of touched){mark(`p:${id}`);writeAuto(pattern,step,id,state.params[id]);}
  }
  renderNow();showLed();renderPatterns();
 }
 function setFollow(on){follow=on;$('follow').setAttribute('aria-pressed',String(on));}
 function renderNow(){
  const name=running&&playPat>=0?S.PATTERN_NAMES[playPat]:'',sec=running&&playSection>=0?state.song.sections[playSection]?.name:'',text=[sec,name].filter(Boolean).join(' · ');
  if($('now-playing').textContent!==text)$('now-playing').textContent=text;
 }
 function showLed(){
  const cur=running&&playPat===state.current?ledStep:-1;
  heads.forEach((h,i)=>h.classList.toggle('now',i===cur));
  for(let n=0;n<=12;n++)for(let i=0;i<S.STEPS;i++)cells[n][i].classList.toggle('col',i===cur);
 }

 // ---- Transport & pattern tools ----
 function setPlaying(on){
  running=on;
  $('play').setAttribute('aria-pressed',String(on));$('play').querySelector('.play-label').textContent=on?'Stop':'Play';
  if(!on)showStep({step:-1,pattern:-1,queued:-1});
 }
 async function togglePlay(){
  try{await ensureAudio();}catch{return;}
  if(!running)send({type:'select',index:state.current}); // with no chain, play starts from the edited pattern
  setPlaying(!running);
  send({type:running?'play':'stop'});
 }
 function panic(){setStutter(false);send({type:'panic'});held.length=0;setPlaying(false);}
 function applyState(next){
  state=S.validate(next);
  for(const p of S.params)renderParam(p.id);
  viewBank=Math.floor(state.current/S.BANK);
  $('tempo').value=state.tempo;$('swing').value=Math.round(state.swing*100);$('chain').value=S.formatChain(state.chain);
  renderSong();
  send({type:'params',params:state.params});sendPattern();send({type:'select',index:state.current});
  renderPatterns();renderRoll();showLed();save();
 }
 function setTranspose(t){transpose=t;sendPattern();status(t?'Trasposizione {value}':'',{value:`${t>0?'+':''}${t}`});}

 // ---- Computer keyboard: mono, last-note priority, legato = slide ----
 function keyNote(k){const i=KEYS.indexOf(k);return i<0?null:i;}
 function playHeld(accent,slide){const n=held[held.length-1];send({type:'on',note:48+kbOctave*12+n,accent,slide});}
 document.addEventListener('keydown',async e=>{
  if(e.target.closest?.('dialog'))return; // dialogs keep their own keys, Esc closes them
  if((e.metaKey||e.ctrlKey)&&e.target.tagName!=='INPUT'){
   const key=e.key.toLowerCase();
   if(key==='z'){e.preventDefault();stepHistory(e.shiftKey?1:-1);return;}
   if(key==='y'){e.preventDefault();stepHistory(1);return;}
  }
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const tag=e.target.tagName;if(tag==='INPUT'||tag==='SELECT')return;
  if(e.key==='Escape'){panic();return;}
  if(e.key===' '){e.preventDefault();if(!e.repeat)togglePlay();return;}
  const k=e.key.toLowerCase();
  if(k==='z'||k==='x'){kbOctave=Math.min(2,Math.max(-2,kbOctave+(k==='x'?1:-1)));status('Ottava tastiera {value}',{value:`${kbOctave>0?'+':''}${kbOctave}`});return;}
  if(/^[1-8]$/.test(e.key)){selectPattern(viewBank*S.BANK+ +e.key-1);return;}
  if(k==='q'){if(!e.repeat)setStutter(true);return;}
  const n=keyNote(k);if(n===null||e.repeat)return;
  e.preventDefault();
  try{await ensureAudio();}catch{return;}
  if(running){setTranspose(n===12?12:n);return;}
  const legato=held.length>0;
  if(!held.includes(n))held.push(n);
  playHeld(e.shiftKey,legato);
 });
 document.addEventListener('keyup',e=>{
  if(e.key.toLowerCase()==='q'){setStutter(false);return;}
  const n=keyNote(e.key.toLowerCase());if(n===null)return;
  const i=held.indexOf(n);if(i<0)return;held.splice(i,1);
  if(running)return;
  if(held.length)playHeld(false,true);else send({type:'off'});
 });
 window.addEventListener('blur',()=>{setStutter(false);if(held.length){held.length=0;if(!running)send({type:'off'});}});

 // ---- Stutter: hold to loop the last slice ----
 let stuttering=false;
 async function setStutter(on){
  if(on===stuttering)return;
  stuttering=on;$('stutter').setAttribute('aria-pressed',String(on));
  if(on){try{await ensureAudio();}catch{stuttering=false;$('stutter').setAttribute('aria-pressed','false');return;}}
  send({type:'stutter',on:stuttering});
 }

 // ---- WAV export (in a worker, so live audio keeps running) ----
 function endExport(){if(exportWorker)exportWorker.terminate();exportWorker=null;I.text('export','Esporta WAV');}
 function exportWav(){
  if(exportWorker){endExport();status('Export annullato');return;}
  const loops=Math.round(Math.min(16,Math.max(1,+$('loops').value||4)));$('loops').value=loops;
  const w=new Worker('./render-worker.js');exportWorker=w;I.text('export','Annulla export');status('Rendering {pct}%',{pct:0});
  w.onmessage=({data})=>{
   if(exportWorker!==w)return;
   if(data.type==='progress')status('Rendering {pct}%',{pct:Math.round(data.value*100)});
   else if(data.type==='done'){
    const url=URL.createObjectURL(new Blob([data.wav],{type:'audio/wav'})),a=document.createElement('a');
    a.href=url;a.download=`acido-${state.tempo}bpm.wav`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    endExport();status('WAV pronto');
   }else{endExport();if(data.message==='TOO_LONG')status('Export troppo lungo (max 10 minuti)');else status('Export non riuscito: {error}',{error:data.message});}
  };
  w.onerror=e=>{if(exportWorker!==w)return; /* a cancelled worker can still report its aborted imports */endExport();status('Export non riuscito: {error}',{error:e.message||'worker'});};
  w.postMessage({state,loops,sampleRate:48000});
 }

 // ---- Share link: the whole session lives in the URL fragment ----
 async function shareLink(){
  try{
   const code=await T.encodeState(state),url=`${location.origin}${location.pathname}#s=${code}`;
   try{await navigator.clipboard.writeText(url);status('Link copiato');}
   catch{window.prompt(tr('Copia il link'),url);}
  }catch(err){status('Link non riuscito: {error}',{error:err.message});}
 }
 async function loadLink(){
  const m=location.hash.match(/^#s=([\w-]+)$/);
  if(!m)return;
  try{const next=await T.decodeState(m[1]);mark();applyState(next);status('Sessione caricata dal link');}
  catch{status('Link non valido');}
  history.replaceState(null,'',location.pathname+location.search); // a reload must not overwrite later edits
 }

 // ---- Song: sections of patterns with repeats and part mutes ----
 const MUTE_LABELS={lead:'Lead',bass:'Bass',kick:'Kick',hat:'Hat',clap:'Clap',snare:'Snare'};
 function songChanged(rebuild=true){if(rebuild)renderSong();sendPattern();save();}
 function markSection(){document.querySelectorAll('.song-row').forEach((r,i)=>r.classList.toggle('now',i===playSection));}
 function renderSong(){
  const list=state.song.sections,host=$('song-list');
  $('song-on').checked=state.song.on;$('song-on').disabled=!list.length;$('song-add').disabled=list.length>=S.MAX_SECTIONS;
  $('song-empty').hidden=list.length>0;
  host.replaceChildren();
  const make=(tag,cls,parent)=>{const x=document.createElement(tag);if(cls)x.className=cls;parent.appendChild(x);return x;};
  list.forEach((sec,i)=>{
   const row=make('div','song-row',host);
   const name=make('input','song-name',row);name.type='text';name.maxLength=24;name.value=sec.name;name.setAttribute('aria-label',tr('Nome sezione'));
   name.addEventListener('change',()=>{mark();sec.name=name.value.slice(0,24);songChanged(false);});
   const pats=make('input','song-pats',row);pats.type='text';pats.spellcheck=false;pats.value=S.formatChain(sec.patterns);pats.setAttribute('aria-label',tr('Pattern della sezione'));
   pats.addEventListener('change',()=>{const v=S.parseChain(pats.value,S.MAX_SECTION_PATTERNS);if(!v.length){pats.value=S.formatChain(sec.patterns);return;}mark();sec.patterns=v;pats.value=S.formatChain(v);songChanged(false);});
   const rep=make('input','song-rep',row);rep.type='number';rep.min=1;rep.max=16;rep.value=sec.repeat;rep.setAttribute('aria-label',tr('Ripetizioni'));
   rep.addEventListener('change',()=>{mark();sec.repeat=Math.round(Math.min(16,Math.max(1,+rep.value||1)));rep.value=sec.repeat;songChanged(false);});
   const mutes=make('div','song-mutes',row);
   for(const id of S.MUTES){
    const b=make('button','mute',mutes);b.type='button';b.textContent=MUTE_LABELS[id];b.setAttribute('aria-pressed',String(sec.mute[id]));b.setAttribute('aria-label',tr('Muta {name}',{name:MUTE_LABELS[id]}));
    b.addEventListener('click',()=>{mark();sec.mute[id]=!sec.mute[id];b.setAttribute('aria-pressed',String(sec.mute[id]));songChanged(false);});
   }
   const tool=(text,label,fn,off)=>{const b=make('button','song-tool',row);b.type='button';b.textContent=text;b.setAttribute('aria-label',tr(label));b.disabled=!!off;b.addEventListener('click',()=>{mark();fn();songChanged();});};
   const swap=d=>{const t=list[i];list[i]=list[i+d];list[i+d]=t;};
   tool('▲','Sposta su',()=>swap(-1),i===0);tool('▼','Sposta giù',()=>swap(1),i===list.length-1);
   tool('✕','Elimina sezione',()=>{list.splice(i,1);if(!list.length)state.song.on=false;});
  });
  markSection();
 }
 function addSection(){
  const list=state.song.sections;if(list.length>=S.MAX_SECTIONS)return;
  mark();
  list.push({name:tr('Sezione {n}',{n:list.length+1}),patterns:state.chain.length?[...state.chain]:[state.current],repeat:1,mute:Object.fromEntries(S.MUTES.map(id=>[id,false]))});
  state.song.on=true;songChanged();
 }

 // ---- MIDI import ----
 function midiOptions(){
  const bars=M.analyze(midi).bars,start=Math.round(Math.min(bars,Math.max(1,+$('mid-start').value||1)));
  const count=Math.round(Math.min(M.MAX_BLOCKS,bars-start+1,Math.max(1,+$('mid-bars').value||1)));
  $('mid-start').value=start;$('mid-bars').value=count;
  return {startBar:start-1,bars:count,roles:[...$('mid-parts').querySelectorAll('select')].map(x=>x.value),double:$('mid-double').checked};
 }
 function midiParts(info){
  const roles=M.suggestRoles(midi,{orbit:false});
  $('mid-parts').replaceChildren(...info.parts.map((p,i)=>{
   const row=document.createElement('label'),name=document.createElement('span'),select=document.createElement('select');
   row.className='field';name.textContent=`${p.name||`Ch ${p.channel+1}`} (${p.notes})`;
   for(const [value,word] of p.drum?[['drums','Batteria'],['off','Escludi']]:[['lead','Melodia'],['bass','Basso'],['off','Escludi']]){const o=new Option(tr(word),value,false,value===roles[i]);o.dataset.word=word;select.add(o);}
   select.addEventListener('change',midiPreview);row.append(name,select);return row;
  }));
 }
 function midiPreview(){
  for(const o of $('mid-parts').querySelectorAll('option'))o.textContent=tr(o.dataset.word);
  midiResult=M.arrange(midi,midiOptions());
  const x=midiResult.stats,none=!x.patterns;
  $('mid-go').disabled=none;
  let text=none?tr('Nessuna nota in queste battute'):tr('{lead} note melodia, {bass} note basso, {drums} colpi, {patterns} pattern, {seconds} s',x);
  if(!none&&x.exact<x.blocks)text+=` · ${tr('{n} blocchi approssimati',{n:x.blocks-x.exact})}`;
  if(!none&&x.bars<x.requested)text+=` · ${tr('Entrano {bars} battute su {total}',{bars:x.bars,total:x.requested})}`;
  $('mid-preview').textContent=text;
 }
 async function openMidi(file){
  if(!file)return;
  try{
   if(file.size>M.MAX_BYTES)throw new Error('BAD_MIDI');
   midi=M.parseMidi(await file.arrayBuffer());
   const info=M.analyze(midi);
   $('mid-name').textContent=file.name;
   $('mid-info').textContent=tr('{bars} battute, {bpm} BPM',{bars:info.bars,bpm:Math.round(info.bpm)});
   midiParts(info);
   $('mid-start').max=info.bars;$('mid-bars').max=Math.min(info.bars,M.MAX_BLOCKS);$('mid-start').value=1;$('mid-bars').value=Math.min(info.bars,M.MAX_BLOCKS);$('mid-double').checked=info.suggestDouble;
   midiPreview();
   $('midi-dialog').showModal();
  }catch{midi=null;status('File MIDI non valido');}
 }
 function importMidi(){
  if(!midiResult||!midiResult.patterns.length)return;
  mark();
  const r=midiResult,params=M.soundParams(state.params,r);
  applyState({...state,params,patterns:r.patterns,tempo:r.tempo,swing:.5,chain:[],song:r.song,current:r.order[0]});
  $('midi-dialog').close();
  status('MIDI importato: {patterns} pattern',{patterns:r.stats.patterns});
 }

 // ---- User presets, stored in this browser ----
 const presetStore=()=>{try{return window.localStorage;}catch{return null;}};
 function renderPresets(){
  const host=$('preset-list');host.replaceChildren();
  $('preset-empty').hidden=userPresets.length>0;
  for(const x of userPresets){
   const row=document.createElement('li'),name=document.createElement('span'),load=document.createElement('button'),del=document.createElement('button');
   name.textContent=x.name;load.type=del.type='button';load.textContent=tr('Carica');del.textContent=tr('Elimina');
   load.setAttribute('aria-label',`${tr('Carica')} ${x.name}`);del.setAttribute('aria-label',`${tr('Elimina')} ${x.name}`);
   load.addEventListener('click',()=>{mark();applyState(clone(x.state));$('presets-dialog').close();status('Preset caricato');});
   del.addEventListener('click',()=>{
    if(!window.confirm(tr('Eliminare "{name}"?',{name:x.name})))return;
    if(storePresets(T.removePreset(userPresets,x.name)))status('Preset eliminato');
   });
   row.append(name,load,del);host.appendChild(row);
  }
 }
 function storePresets(next){
  try{const st=presetStore();if(!st)throw new Error('NO_STORAGE');T.writePresets(st,next);userPresets=next;renderPresets();return true;}
  catch{status('Spazio esaurito nel browser');return false;}
 }
 function savePreset(){
  const name=$('preset-name').value.trim();
  if(!name){$('preset-name').focus();return;}
  if(T.hasPreset(userPresets,name)&&!window.confirm(tr('Sovrascrivere "{name}"?',{name})))return;
  let next;
  try{next=T.upsertPreset(userPresets,name,state);}catch{status('Troppi preset (max 50)');return;}
  if(storePresets(next)){$('preset-name').value='';status('Preset salvato');}
 }

 // ---- Wire up ----
 function init(){
  I.mount();
  buildKnobs();buildPatterns();buildRoll();
  $('language').addEventListener('change',e=>I.setLanguage(e.target.value));
  I.onChange(()=>{renderPatterns();renderRoll();renderSong();renderPresets();if(midi&&$('midi-dialog').open)midiPreview();});
  for(const b of document.querySelectorAll('[data-part]'))b.addEventListener('click',()=>{
   editBass=b.dataset.part==='bass';
   for(const x of document.querySelectorAll('[data-part]'))x.setAttribute('aria-checked',String(x===b));
   renderRoll();
  });
  $('kick-reset').addEventListener('click',()=>{mark();pat().kicks=null;changed();});
  $('song-on').addEventListener('change',e=>{mark();state.song.on=e.target.checked&&state.song.sections.length>0;queuedPat=-1;songChanged();});
  $('song-add').addEventListener('click',addSection);
  $('import').addEventListener('click',()=>$('midi-file').click());
  $('midi-file').addEventListener('change',e=>{openMidi(e.target.files[0]);e.target.value='';});
  for(const id of ['mid-start','mid-bars','mid-double'])$(id).addEventListener('change',midiPreview);
  $('mid-go').addEventListener('click',importMidi);$('mid-cancel').addEventListener('click',()=>$('midi-dialog').close());
  const hasFile=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  document.addEventListener('dragover',e=>{if(hasFile(e))e.preventDefault();});
  document.addEventListener('drop',e=>{if(!hasFile(e))return;e.preventDefault();const f=e.dataTransfer.files[0];if(f&&/\.midi?$/i.test(f.name))openMidi(f);else status('File MIDI non valido');});
  const st0=presetStore();userPresets=st0?T.readPresets(st0):[];renderPresets();
  $('my-presets').addEventListener('click',()=>$('presets-dialog').showModal());
  $('preset-save').addEventListener('click',savePreset);$('presets-close').addEventListener('click',()=>$('presets-dialog').close());
  $('preset-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();savePreset();}});
  const sel=$('preset');
  const demos=window.AcidoDemos.demos,allPresets=[...S.presets,...demos];
  S.presets.forEach((p,i)=>{const o=document.createElement('option');o.value=i;I.text(o,p.name);sel.appendChild(o);});
  for(const [label,kind] of [['Brani demo',undefined],['Brani con voci','voci'],['Brani glitch','glitch']]){
   const group=document.createElement('optgroup');I.attr(group,'label',label);
   demos.forEach((p,i)=>{if(window.AcidoDemos.defs[i].group!==kind)return;const o=document.createElement('option');o.value=S.presets.length+i;o.textContent=p.name;group.appendChild(o);});
   sel.appendChild(group);
  }
  const custom=document.createElement('option');custom.value='';I.text(custom,'— corrente —');sel.prepend(custom);sel.value='';
  sel.addEventListener('change',()=>{if(sel.value!==''){mark();applyState(clone(allPresets[+sel.value]));}sel.value='';});
  $('play').addEventListener('click',togglePlay);
  $('tempo').addEventListener('change',e=>{mark();state.tempo=Math.round(Math.min(200,Math.max(60,+e.target.value||124)));e.target.value=state.tempo;sendPattern();save();});
  $('swing').addEventListener('change',e=>{mark();const v=Math.round(Math.min(75,Math.max(50,+e.target.value||50)));e.target.value=v;state.swing=v/100;sendPattern();save();});
  $('chain').addEventListener('change',e=>{mark();state.chain=S.parseChain(e.target.value);e.target.value=S.formatChain(state.chain);sendPattern();save();status(state.chain.length?'Catena: {count} pattern':'Catena vuota: ripete il pattern scelto',{count:state.chain.length});});
  $('length').addEventListener('change',e=>{mark();pat().length=Math.round(Math.min(16,Math.max(1,+e.target.value||16)));e.target.value=pat().length;changed();});
  $('random').addEventListener('click',()=>{mark();const old=pat().steps;pat().steps=S.randomPattern(Date.now()%2147483647,Math.random()<.5?'minor':'phrygian').map((s,i)=>({...s,hat:old[i].hat,clap:old[i].clap,snare:old[i].snare,vowel:old[i].vowel,bass:old[i].bass,bassOct:old[i].bassOct,bassTie:old[i].bassTie}));changed();});
  const seedNow=()=>Math.floor(Math.random()*2147483647),styleName=s=>tr(s[0].toUpperCase()+s.slice(1));
  $('beat-random').addEventListener('click',()=>{mark();const style=$('beat-style').value;B.applyDrums(pat(),B.generate(style,seedNow()));changed();status('Batteria: {style}',{style:styleName(style)});});
  // Patterns without drums are breaks: they stay silent.
  $('beat-all').addEventListener('click',()=>{
   mark();const style=$('beat-style').value,seed=seedNow(),list=state.patterns.filter(p=>patUsed(p)&&B.hasDrums(p));
   list.forEach((p,i)=>B.applyDrums(p,B.generate(style,seed,i%4)));changed();
   status('Batteria su {count} pattern: {style}',{count:list.length,style:styleName(style)});
  });
  $('follow').addEventListener('click',()=>{setFollow(!follow);if(follow&&running&&playPat>=0&&playPat!==state.current){state.current=playPat;viewBank=Math.floor(playPat/S.BANK);renderRoll();renderPatterns();showLed();}});
  $('clear').addEventListener('click',()=>{mark();pat().steps=S.emptyPattern().steps;pat().auto={};pat().kicks=null;changed();});
  $('undo').addEventListener('click',()=>stepHistory(-1));$('redo').addEventListener('click',()=>stepHistory(1));
  $('rec').addEventListener('click',()=>{rec=!rec;$('rec').setAttribute('aria-pressed',String(rec));status(rec?'Rec: muovi Cutoff, Reso, Env Mod o Decay in play':'');});
  $('lane').addEventListener('change',e=>{autoLane=e.target.value;renderLane();});
  $('clear-auto').addEventListener('click',()=>{mark();delete pat().auto[autoLane];changed();});
  $('export').addEventListener('click',exportWav);$('share').addEventListener('click',shareLink);
  window.addEventListener('hashchange',loadLink);
  $('copy').addEventListener('click',()=>{clipboard=clone(pat());$('paste').disabled=false;status('Copiato il pattern {name}',{name:S.PATTERN_NAMES[state.current]});});
  $('paste').addEventListener('click',()=>{if(!clipboard)return;mark();state.patterns[state.current]=clone(clipboard);changed();status('Incollato in {name}',{name:S.PATTERN_NAMES[state.current]});});
  const rotate=d=>{
   mark();const p=pat(),L=p.length;
   const spin=a=>{const head=a.slice(0,L);return(d>0?[head[L-1],...head.slice(0,L-1)]:[...head.slice(1),head[0]]).concat(a.slice(L));};
   p.steps=spin(p.steps);if(p.kicks)p.kicks=spin(p.kicks);for(const id in p.auto)p.auto[id]=spin(p.auto[id]);changed();
  };
  $('left').addEventListener('click',()=>rotate(-1));$('right').addEventListener('click',()=>rotate(1));
  for(const b of document.querySelectorAll('[data-param]'))b.addEventListener('click',()=>setParam(b.dataset.param,+b.dataset.value));
  const st=$('stutter');
  st.addEventListener('pointerdown',e=>{st.setPointerCapture(e.pointerId);setStutter(true);e.preventDefault();});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])st.addEventListener(ev,()=>setStutter(false));
  st.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();e.stopPropagation();setStutter(true);}});
  st.addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setStutter(false);}});
  applyState(state);renderHistory();loadLink();
 }
 init();
})();

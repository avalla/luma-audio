/* Original demo songs: lead, bass, drums, automation and an arrangement from intro to outro.
   Lead notation, 16 tokens per bar: note + octave (c#3), "." rest, "-" hold, "!" accent, "~" slide into the next note. */
(function(root){
 const S=typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession;
 const NAMES=['c','c#','d','d#','e','f','f#','g','g#','a','a#','b'];
 const pitch=t=>{const m=/^([a-g]#?)(\d)/.exec(t);if(!m||NAMES.indexOf(m[1])<0)throw new Error(`bad note ${t}`);return 12*(+m[2]+1)+NAMES.indexOf(m[1]);};
 const enc=p=>{if(p<24||p>60)throw new Error(`note out of range ${p}`);const n=p-36,octave=n<0?-1:n>=12?1:0;return {note:n-12*octave,octave};};
 const BASS={
  off:i=>i%4===2?1:i%4===3?2:0,
  roll:i=>i%4===0?0:1,
  gallop:i=>i%4===2||i%4===3?1:i%8===0?1:0,
  stab:i=>[0,3,6,10,12].includes(i)?1:0,
  sub:i=>i===0?1:i<14?2:0
 };
 function fillLead(steps,bar){
  const tokens=bar.trim().split(/\s+/);
  if(tokens.length!==16)throw new Error(`bar needs 16 steps: ${bar}`);
  let last=null;
  tokens.forEach((t,i)=>{
   if(t==='.'){last=null;return;}
   if(t==='-'){
    if(!last)throw new Error(`hold without a note: ${bar}`);
    steps[i-1].slide=true;Object.assign(steps[i],enc(last),{gate:true});return;
   }
   last=pitch(t);
   Object.assign(steps[i],enc(last),{gate:true,accent:t.includes('!'),slide:t.includes('~')});
  });
 }
 function fillBass(steps,root,style){
  const e=enc(pitch(root));
  steps.forEach((s,i)=>{
   const k=BASS[style](i);
   if(!k)return;
   s.bass=e.note;s.bassOct=e.octave;
   if(k===2&&i>0)steps[i-1].bassTie=true;
  });
 }
 const hatOf=c=>c==='c'?1:c==='o'?2:0;
 function bar({lead,root,style,hats,claps,kicks,vowels,short}){
  const p=S.emptyPattern();
  if(lead)fillLead(p.steps,lead);
  if(short)for(const s of p.steps)if(s.gate&&!s.slide)s.gateLen=1; // clipped notes for broken grooves
  if(root)fillBass(p.steps,root,style);
  p.steps.forEach((s,i)=>{s.hat=hatOf(hats?.[i]);s.clap=claps?.[i]==='x';if(vowels&&s.gate&&vowels[i]!=='.')s.vowel=S.VOWEL_NAMES.indexOf(vowels[i]);});
  if(kicks)p.kicks=[...kicks].map(c=>c==='x');
  return p;
 }
 const ramp=(from,to)=>Array.from({length:16},(_,i)=>Math.round(Math.min(1,Math.max(0,from+(to-from)*i/15))*1000)/1000);
 const section=(name,patterns,repeat,...muted)=>({name,patterns,repeat,mute:Object.fromEntries(S.MUTES.map(id=>[id,muted.includes(id)]))});
 const range=(a,n)=>Array.from({length:n},(_,i)=>a+i);
 function song({name,tempo,swing=.5,params,roots,style,leadA,leadB,hats='..o.c.o.c.o.c.o.',claps='....x.......x...',kicks=null,vowels=null,short=false}){
  const base={...S.defaults,...params},patterns=Array.from({length:S.PATTERNS},()=>S.emptyPattern());
  const voc=j=>Array.isArray(vowels)?vowels[j%vowels.length]:vowels; // one syllable line per bar
  const groove={style,hats,claps,kicks,short};
  for(let i=0;i<4;i++){
   patterns[i]=bar({...groove,vowels:voc(i),lead:leadA[i],root:roots[i]});
   patterns[i+4]=bar({...groove,vowels:voc(i+4),lead:leadB[i],root:roots[i]});
   // Build: the filter opens over four bars while the clap accelerates.
   const fill=i===3?'xxxxxxxxxxxxxxxx':i===2?'x.x.x.x.x.x.x.x.':claps;
   const up=bar({...groove,vowels:voc(i),lead:leadA[i],root:roots[i],claps:fill,hats:'..o...o...o...o.',kicks:i===3?'x...x...x.x.xxxx':kicks});
   const low=Math.max(.05,base.cutoff*.55),span=(Math.min(1,base.cutoff+.2)-low)/4;
   up.auto.cutoff=ramp(low+span*i,low+span*(i+1));
   patterns[8+i]=up;
   // Break: no drums, long bass, the melody alone with a darker filter.
   const down=bar({lead:leadB[i],root:roots[i],style:'sub',vowels:voc(i+4),short,kicks:'................'});
   down.auto.cutoff=ramp(base.cutoff*.8,base.cutoff*.95);
   patterns[16+i]=down;
  }
  const main=range(0,4),full=range(0,8),build=range(8,4),drop=range(16,4);
  return S.validate({name,params:base,tempo,swing,current:0,chain:[],patterns,song:{on:true,sections:[
   section('Intro',main,1,'lead','bass','clap'),section('Groove',main,1,'lead'),section('Build',build,1),section('Drop',full,2),
   section('Break',drop,1),section('Build',build,1),section('Drop',full,2),section('Outro',main,1,'lead')]}});
 }
 const defs=[
  {key:'am',scale:[9,11,0,2,4,5,7],name:'Notte Italiana',tempo:132,style:'off',roots:['a1','f1','c2','g1'],
   params:{tuning:1,cutoff:.6,resonance:.25,envMod:.35,decay:.22,accent:.25,drive:.2,delay:.32,reverb:.28,reverbSize:.62,kick:.78,duck:.45,hat:.38,clap:.4,bass:.6,bassTone:.28,bassDecay:.4},
   leadA:['a2 . c3 e3 . a3 . e3 c3 . a2 . c3 - e3 .','a2 . c3 f3 . a3 . f3 c3 . a2 . c3 - f3 .','g2 . c3 e3 . g3 . e3 c3 . g2 . c3 - e3 .','g2 . b2 d3 . g3 . d3 b2 . g2 . d3 - g3 .'],
   leadB:['e3 - . e3 a3 . g3 e3 . c3 d3 e3 - . c3 .','c3 - . c3 f3 . e3 c3 . a2 c3 d3 - . a2 .','c3 - . e3 g3 . a3 g3 . e3 d3 c3 - . d3 .','d3 - . d3 g3 . a3 b3 - . g3 . d3 - b2 .']},
  {key:'em',scale:[4,6,7,9,11,0,2],name:'Squelch Notturno',tempo:138,swing:.54,style:'roll',roots:['e1','e1','g1','d1'],
   params:{cutoff:.22,resonance:.88,envMod:.7,decay:.32,accent:.8,drive:.55,distortion:.3,distType:.5,distTone:.5,delay:.2,reverb:.12,kick:.85,duck:.5,hat:.45,clap:.35,bass:.45,bassTone:.15},
   leadA:['e2! e2 e3~ d3 . e2! g2~ a2 e2 . e3! d3~ b2 . g2 a2','e2! . e2 g2~ a2 . e3! d3 e2 e2~ g2 . a2! b2~ d3 .','g2! g2 g3~ f#3 . g2! b2~ d3 g2 . g3! f#3~ d3 . b2 a2','d2! d2 d3~ c3 . d2! f#2~ a2 d2 . d3! c3~ a2 b2~ d3! e3'],
   leadB:['e3! . e3 g3~ b3 a3 . e3! d3 . b2~ d3 e3! . g3 e3','e3! e3 . d3 e3~ g3 . a3! g3 e3 . d3~ b2 . a2! b2','g3! . g3 a3~ b3 a3 . g3! f#3 . d3~ f#3 g3! . b3 g3','d3! d3 . c3 d3~ f#3 . a3! f#3 d3 . c3~ a2 . b2! d3']},
  {key:'bm',scale:[11,1,2,4,6,7,9],name:'Alba Trance',tempo:140,style:'off',roots:['b1','g1','d2','a1'],
   params:{tuning:1,cutoff:.5,resonance:.35,envMod:.4,decay:.25,accent:.3,drive:.15,delay:.4,reverb:.4,reverbSize:.8,kick:.8,duck:.6,hat:.4,clap:.35,bass:.6,bassTone:.25},
   leadA:['b2 d3 f#3 b3 f#3 d3 b2 d3 f#3 b3 f#3 d3 b2 d3 f#3 d3','b2 d3 g3 b3 g3 d3 b2 d3 g3 b3 g3 d3 b2 d3 g3 d3','a2 d3 f#3 a3 f#3 d3 a2 d3 f#3 a3 f#3 d3 a2 d3 f#3 d3','a2 c#3 e3 a3 e3 c#3 a2 c#3 e3 a3 e3 c#3 a2 c#3 e3 c#3'],
   leadB:['f#3 - - . d3 - e3 f#3 - . b3 - a3 - f#3 .','g3 - - . d3 - e3 g3 - . b3 - a3 - g3 .','f#3 - - . a3 - f#3 d3 - . e3 - f#3 - a3 .','e3 - - . c#3 - e3 a3 - - . f#3 e3 - c#3 .']},
  {key:'dm',scale:[2,4,5,7,9,10,0,1],name:'Rave Gomma',tempo:150,style:'stab',roots:['d2','a#1','g1','a1'],hats:'..o...o.c.o..co.',claps:'....x.......x..x',kicks:'x.....x...x.....',
   params:{waveform:1,cutoff:.42,resonance:.55,envMod:.6,decay:.2,accent:.7,drive:.5,distortion:.25,distType:0,delay:.25,reverb:.18,kick:.85,duck:.5,hat:.45,clap:.5,bass:.7,bassTone:.35},
   leadA:['d3! . d3 . f3 . d3! . a2 . d3 f3! . e3 d3 .','a#2! . d3 . f3 . a#2! . f2 . a#2 d3! . c3 a#2 .','g2! . a#2 . d3 . g2! . d2 . g2 a#2! . a2 g2 .','a2! . c#3 . e3 . a2! . e2 . a2 c#3! . e3 g3 .'],
   leadB:['a3! . f3 d3 . a3 g3 f3 . e3 f3! . d3 . a2 .','a#3! . f3 d3 . a#3 a3 f3 . d3 f3! . a#2 . d3 .','g3! . d3 a#2 . g3 f3 d3 . c3 d3! . a#2 . g2 .','a3! . e3 c#3 . a3 g3 e3 . c#3 e3! . a2 . a3 .']},
  {key:'gm',scale:[7,9,10,0,2,3,5],name:'Club Profondo',tempo:122,swing:.56,style:'sub',roots:['g1','d#1','a#1','f1'],hats:'..o...o...o...o.',claps:'............x...',
   params:{tuning:1,waveform:1,cutoff:.38,resonance:.4,envMod:.25,decay:.6,accent:.2,drive:.1,delay:.55,reverb:.5,reverbSize:.85,kick:.7,kickDecay:.55,duck:.55,hat:.3,clap:.2,bass:.7,bassTone:.15,bassDecay:.8},
   leadA:['g2 - - . . . a#2 - . . d3 - - . . .','g2 - - . . . a#2 - . . d#3 - - . . .','f2 - - . . . a#2 - . . d3 - - . . .','f2 - - . . . a2 - . . c3 - - . . .'],
   leadB:['d3 - - . a#2 . . g2 - - . d3 - c3 a#2 .','d#3 - - . c3 . . g2 - - . d#3 - d3 c3 .','d3 - - . a#2 . . f2 - - . d3 - c3 a#2 .','c3 - - . a2 . . f2 - - . c3 - a#2 a2 .']},
  {key:'cm',scale:[0,2,3,5,7,8,10,11],name:'Acido Parlante',tempo:128,swing:.55,style:'gallop',roots:['c2','g#1','f1','g1'],vowels:'A.E.O..I.U.A.E..',
   params:{cutoff:.5,resonance:.6,envMod:.5,decay:.3,accent:.6,drive:.3,formant:.85,vowel:.25,delay:.2,reverb:.15,kick:.8,hat:.4,clap:.45,bass:.6,bassTone:.3},
   leadA:['c3! . d#3 . g3~ f3 . d#3 c3 . a#2 . c3! . g2 .','c3! . d#3 . g#3~ g3 . d#3 c3 . g#2 . c3! . d#3 .','c3! . f3 . g#3~ g3 . f3 c3 . g#2 . c3! . f3 .','b2! . d3 . g3~ f3 . d3 b2 . g2 . d3! . g3 .'],
   leadB:['g3! g3 . f3 d#3 . c3 d#3 f3! . d#3 c3 . a#2 c3 .','g#3! g3 . f3 d#3 . c3 d#3 g3! . f3 d#3 . c3 g#2 .','g#3! g#3 . g3 f3 . c3 f3 g#3! . g3 f3 . d#3 c3 .','g3! g3 . f3 d3 . b2 d3 g3! . f3 d3 . b2 g2 .']},
  // Broken and glitched songs.
  {key:'fm',group:'glitch',scale:[5,7,8,10,0,1,3],name:'Vetro Rotto',tempo:140,style:'stab',short:true,roots:['f1','c#1','g#1','d#1'],hats:'c.c..oc.cc..o.c.',claps:'....x..x.....x..',kicks:'x..x....x.x.....',
   params:{waveform:1,cutoff:.46,resonance:.62,envMod:.55,decay:.18,accent:.7,drive:.35,crush:.3,glitch:.45,glitchSize:.6,delay:.18,reverb:.14,kick:.82,duck:.45,hat:.42,clap:.45,bass:.62,bassTone:.3},
   leadA:['f2! . f3 . c3 f2 . g#2 . f3! d#3 . c3 . g#2 c3','c#2! . c#3 . g#2 c#2 . f2 . c#3! c3 . g#2 . f2 g#2','g#2! . g#3 . d#3 g#2 . c3 . g#3! f3 . d#3 . c3 d#3','d#2! . d#3 . a#2 d#2 . g2 . d#3! c#3 . a#2 . g2 a#2'],
   leadB:['c3! f3 . g#3 f3 . c3! . d#3 f3 . g#3! . c4 g#3 .','c#3! f3 . g#3 f3 . c#3! . c3 c#3 . f3! . g#3 f3 .','c3! d#3 . g#3 d#3 . c3! . d#3 f3 . g#3! . c4 a#3 .','a#2! d#3 . g3 d#3 . a#2! . c3 c#3 . d#3! . g3 d#3 .']},
  {key:'dp',group:'glitch',scale:[2,3,5,7,9,10,0],name:'Bit Collasso',tempo:170,style:'stab',short:true,roots:['d2','d#2','c2','a#1'],hats:'cc.oc.c.cc.oc.co',claps:'....x..x..x.x...',kicks:'x.x...x..x..x...',
   params:{cutoff:.4,resonance:.7,envMod:.65,decay:.16,accent:.8,drive:.45,distortion:.4,distType:1,distTone:.55,crush:.55,glitch:.6,glitchSize:.8,delay:.12,reverb:.08,kick:.85,duck:.5,hat:.4,clap:.5,bass:.55,bassTone:.25},
   leadA:['d2! d2 . d3 . d2! d#2 . d2 . a2! . d3 c3 . a2','d#2! d#2 . d#3 . d#2! f2 . d#2 . a#2! . d#3 d3 . a#2','c2! c2 . c3 . c2! d#2 . c2 . g2! . c3 a#2 . g2','a#1! a#1 . a#2 . a#1! d2 . a#1 . f2! . a#2 a2 . f2'],
   leadB:['a3! . f3 d3 d#3 . a2! . c3 d3 . f3! a3 . g3 .','a#3! . g3 d#3 f3 . a#2! . d3 d#3 . g3! a#3 . a3 .','g3! . d#3 c3 d3 . g2! . a#2 c3 . d#3! g3 . f3 .','f3! . d3 a#2 c3 . f2! . a2 a#2 . d3! f3 . d#3 .']},
  {key:'al',group:'glitch',scale:[9,11,0,2,4,5,7],name:'Nastro Stanco',tempo:104,swing:.6,style:'off',roots:['a1','d2','f1','e1'],hats:'..c.o.c...c.o.c.',claps:'....x.....x.....',kicks:'x.....x.x.....x.',
   params:{tuning:1,cutoff:.44,resonance:.3,envMod:.3,decay:.45,accent:.3,drive:.2,crush:.15,glitch:.3,glitchSize:.2,delay:.38,reverb:.35,reverbSize:.7,kick:.72,kickDecay:.45,duck:.45,hat:.32,clap:.34,bass:.62,bassTone:.2,bassDecay:.6},
   leadA:['a2 - . c3 e3 . . d3 - . c3 . a2 . . .','d3 - . f3 a3 . . g3 - . f3 . d3 . . .','c3 - . f3 a3 . . g3 - . e3 . c3 . . .','b2 - . d3 e3 . . d3 - . b2 . g2 . . .'],
   leadB:['e3 . a3 - . g3 e3 . . c3 d3 - e3 . . .','f3 . a3 - . g3 f3 . . d3 e3 - f3 . . .','e3 . a3 - . g3 e3 . . c3 d3 - c3 . . .','d3 . g3 - . f3 d3 . . b2 c3 - b2 . . .']},
  {key:'gs',group:'glitch',scale:[7,9,10,0,2,3,5],name:'Stutter Club',tempo:128,style:'off',short:true,roots:['g1','a#1','d#1','f1'],
   params:{cutoff:.48,resonance:.5,envMod:.5,decay:.2,accent:.6,drive:.3,glitch:.5,glitchSize:.25,delay:.22,reverb:.2,kick:.82,duck:.5,hat:.4,clap:.42,bass:.6,bassTone:.28},
   leadA:['g2! g2 g2 g2 . a#2 . g2 d3! d3 d3 . c3 . a#2 .','a#2! a#2 a#2 a#2 . d3 . a#2 f3! f3 f3 . d#3 . d3 .','d#3! d#3 d#3 d#3 . g3 . d#3 a#3! a#3 a#3 . g3 . f3 .','f2! f2 f2 f2 . a2 . f2 c3! c3 c3 . a#2 . a2 .'],
   leadB:['d3! . a#2 g2 . d3 f3 d3 g3! . f3 d3 . c3 a#2 .','f3! . d3 a#2 . f3 g3 f3 a#3! . g3 f3 . d3 c3 .','g3! . d#3 a#2 . g3 a#3 g3 c4! . a#3 g3 . f3 d#3 .','c3! . a2 f2 . c3 d#3 c3 f3! . d#3 c3 . a#2 a2 .']},
  // Vocal songs: the formant filter sings a syllable line over each bar.
  {key:'fsm',group:'voci',scale:[6,8,9,11,1,2,4],name:'Coro di Mezzanotte',tempo:124,style:'off',roots:['f#1','d2','a1','e2'],hats:'..o...o...o...o.',vowels:['AOO.EEIOO.AAOO..','OAA.IIEAA.OOEE..','EAA.IIOEE.AAUU..','AEE.OOAII.UUOO..','OOAAA.IIEAA.OOU.','AAEII.OOAEE.AAO.','EEAOO.AAIUU.EEA.','OOEAA.IIUOOOO...'],
   params:{tuning:1,cutoff:.78,resonance:.18,envMod:.15,decay:.7,accent:.15,drive:.12,formant:.92,vowel:0,delay:.3,reverb:.48,reverbSize:.8,kick:.72,duck:.5,hat:.3,clap:.3,bass:.62,bassTone:.22,bassDecay:.5},
   leadA:['f#3 - - . a3 - g#3 f#3 - . e3 - c#3 - . .','d3 - - . f#3 - e3 d3 - . a3 - f#3 - . .','a3 - - . b3 - a3 e3 - . c#3 - e3 - . .','e3 - - . g#3 - f#3 e3 - . b2 - c#3 - . .'],
   leadB:['c#3 - e3 f#3 - . a3 - f#3 e3 - . c#3 - b2 .','d3 - f#3 a3 - . b3 - a3 f#3 - . e3 - d3 .','e3 - a3 b3 - . a3 - e3 c#3 - . e3 - f#3 .','g#3 - f#3 e3 - . c#3 - b2 c#3 - - - . . .']},
  {key:'dv',group:'voci',scale:[2,4,5,7,9,10,0],name:'Sirena Lontana',tempo:118,swing:.54,style:'sub',roots:['d2','a#1','f1','c2'],hats:'..o.....c.o.....',claps:'....x.......x...',vowels:['AAOOO.EEIAA.OOU.','OOAAA.IIEOO.AAU.','EEAAA.OOIEE.AAO.','AAEEE.UUOAA.IIO.'],
   params:{tuning:1,cutoff:.82,resonance:.12,envMod:.1,decay:.85,accent:.1,drive:.08,formant:.95,vowel:.25,delay:.45,reverb:.62,reverbSize:.9,kick:.66,kickDecay:.55,duck:.55,hat:.24,clap:.24,bass:.66,bassTone:.15,bassDecay:.8},
   leadA:['d3 - - - - . f3 - e3 d3 - . a2 - - .','a#2 - - - - . d3 - c3 a#2 - . f2 - - .','f3 - - - - . a3 - g3 f3 - . c3 - - .','e3 - - - - . g3 - f3 e3 - . c3 - - .'],
   leadB:['a3 - - . g3 f3 - . a3 - c4 - a3 - g3 .','f3 - - . d3 a#2 - . d3 - f3 - g3 - f3 .','c4 - - . a3 f3 - . a3 - g3 - f3 - d3 .','e3 - - . c3 e3 - . g3 - a3 - - - . .']},
  {key:'er',group:'voci',scale:[4,6,7,9,11,0,2],name:'Robot Gentile',tempo:126,swing:.53,style:'gallop',short:true,roots:['e1','c2','g1','d2'],vowels:['IAEOAEUIAOIOUEAO','OEIAUIUAEOAOEIAU','AIOUEOEAIUAUIOEA','EOAIOAUEOIEIOAUE'],
   params:{waveform:1,cutoff:.68,resonance:.42,envMod:.35,decay:.24,accent:.5,drive:.25,formant:.9,vowel:.5,delay:.2,reverb:.16,kick:.8,hat:.4,clap:.42,bass:.58,bassTone:.3},
   leadA:['e3 e3 . g3 . e3 d3 . b2 . d3 e3 . g3 a3 .','c3 c3 . e3 . c3 b2 . g2 . b2 c3 . e3 g3 .','g3 g3 . b3 . g3 f#3 . d3 . f#3 g3 . b3 a3 .','d3 d3 . f#3 . d3 c3 . a2 . c3 d3 . f#3 a3 .'],
   leadB:['b3 . a3 g3 . e3 . g3 a3 . b3 . g3 e3 d3 .','g3 . e3 c3 . e3 . g3 a3 . g3 . e3 c3 b2 .','b3 . g3 d3 . g3 . b3 c4 . b3 . a3 g3 f#3 .','a3 . f#3 d3 . f#3 . a3 b3 . a3 . f#3 d3 e3 .']},
  {key:'csm',group:'voci',scale:[1,3,4,6,8,9,11],name:'Preghiera Trance',tempo:136,style:'off',roots:['c#2','a1','e2','b1'],vowels:['OOAAIIEEE.OOAAU.','AAOOEEIAA.UUOOA.','EEIIAAOUU.AAEEI.','OOEEAAUOO.IIAAA.'],
   params:{tuning:1,cutoff:.74,resonance:.22,envMod:.2,decay:.6,accent:.2,drive:.14,formant:.88,vowel:.75,delay:.36,reverb:.5,reverbSize:.85,kick:.78,duck:.6,hat:.36,clap:.34,bass:.6,bassTone:.24},
   leadA:['c#3 - e3 - g#3 - f#3 e3 - . c#3 - e3 - f#3 .','a2 - c#3 - e3 - f#3 e3 - . c#3 - a2 - b2 .','b2 - e3 - g#3 - a3 g#3 - . e3 - g#3 - b3 .','b2 - d#3 - f#3 - g#3 f#3 - . d#3 - b2 - - .'],
   leadB:['g#3 - - . b3 a3 - g#3 - . e3 f#3 - g#3 - .','a3 - - . g#3 e3 - c#3 - . e3 f#3 - e3 - .','g#3 - - . b3 g#3 - e3 - . g#3 a3 - b3 - .','f#3 - - . d#3 b2 - d#3 - . f#3 g#3 - - - .']},
  {key:'c',group:'voci',scale:[0,2,4,5,7,9,11],name:'Ninna Elettrica',tempo:108,swing:.58,style:'sub',roots:['c2','a1','f1','g1'],hats:'..c...c...c...c.',claps:'............x...',kicks:'x.......x.....x.',vowels:['AAAOOOEEUUUIII..','OOOAAAIIEEEUUU..','EEEAAAOOIIIAAA..','UUUOOOAAEEEOOO..'],
   params:{tuning:1,waveform:.2,cutoff:.72,resonance:.15,envMod:.12,decay:.8,accent:.1,drive:.06,formant:.9,vowel:1,delay:.42,reverb:.55,reverbSize:.75,kick:.6,kickDecay:.6,duck:.4,hat:.22,clap:.22,bass:.6,bassTone:.12,bassDecay:.75},
   leadA:['e3 - - g3 - - e3 - c3 - - d3 - - . .','c3 - - e3 - - c3 - a2 - - b2 - - . .','a3 - - g3 - - f3 - c3 - - d3 - - . .','b2 - - d3 - - g3 - f3 - - d3 - - . .'],
   leadB:['g3 - e3 a3 - g3 e3 - . c3 d3 e3 - - . .','e3 - c3 g3 - e3 c3 - . a2 b2 c3 - - . .','a3 - f3 c4 - a3 f3 - . c3 d3 f3 - - . .','g3 - d3 b3 - g3 d3 - . b2 c3 d3 - - . .']}
 ];
 const api={demos:defs.map(song),defs,pitch};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoDemos=api;
})(globalThis);

/* Acid sequencer clocked per sample inside the audio engine. Keeps the fractional sample between steps.
   - Slide on step N holds the gate into step N+1 (also across a pattern change) and glides, without retriggering envelopes.
   - Swing lengthens even 16ths and shortens odd ones; each pair still lasts two straight steps (no drift).
   - Patterns: a queued pattern starts at the end of the current loop; otherwise the chain (if any) advances. */
(function(root){
 const BASE_NOTE=36;
 const AUTO=(typeof module!=='undefined'&&module.exports?require('./session.js'):root.AcidoSession).AUTO_PARAMS;
 const Beats=typeof module!=='undefined'&&module.exports?require('./beats.js'):root.AcidoBeats;
 const GATES=[.5,.22,.92]; // per-step gate: normale, corta, lunga (fraction of the step)
 class Sequencer{
  constructor(sr){
   this.sr=sr;this.tempo=124;this.swing=.5;this.patterns=[];this.chain=[];this.transpose=0;
   this.running=false;this.pat=0;this.step=0;this.queued=-1;this.chainPos=0;
   this.pos=0;this.curLen=0;this.offAt=Infinity;
   this.prevGate=false;this.prevSlide=false;this.lastFired=-1;this.lastPat=0;this.changed=false;this.count=0;
   this.held={}; // knobs being moved: their automation is ignored until release
   this.song=null;this.secI=0;this.secPos=0;this.secRep=0;this.nS=0;this.nI=0;this.nR=0;
   this.bassOffAt=Infinity;this.prevBassTie=false;
   this.stepLen=this.computeStepLen();
  }
  hold(id,on,engine){this.held[id]=on===true;if(on&&engine.setAuto)engine.setAuto(id,-1);}
  setAuto(p,step,id,value){
   const x=this.patterns[p];
   if(!x||!AUTO.includes(id)||!Number.isInteger(step)||step<0||step>=16)return;
   const auto=x.auto||(x.auto={}),lane=auto[id]||(auto[id]=new Array(16).fill(null));
   lane[step]=Number.isFinite(value)?Math.min(1,Math.max(0,value)):null;
  }
  applyAuto(engine,p,step){
   if(!engine.setAuto)return;
   const auto=this.patterns[p]?.auto;
   for(let i=0;i<AUTO.length;i++){
    const id=AUTO[i],v=auto&&!this.held[id]&&auto[id]?auto[id][step]:null;
    engine.setAuto(id,Number.isFinite(v)?v:-1);
   }
  }
  computeStepLen(){return this.sr*60/this.tempo/4;}
  len(p){const x=this.patterns[p];return x&&Number.isInteger(x.length)?x.length:16;}
  songActive(){return !!(this.song&&this.song.on&&this.song.sections.length);}
  // Next position in the song, written to fields so the audio thread does not allocate.
  songNext(){
   const list=this.song.sections,sec=list[this.secI];
   let s=this.secI,i=this.secPos+1,r=this.secRep;
   if(i>=sec.patterns.length){i=0;r++;if(r>=sec.repeat){r=0;s=(s+1)%list.length;}}
   this.nS=s;this.nI=i;this.nR=r;
   return list[s].patterns[i];
  }
  configure({tempo,swing,patterns,chain,transpose,song}){
   if(song&&Array.isArray(song.sections)){
    this.song=song;
    if(this.secI>=song.sections.length){this.secI=0;this.secPos=0;this.secRep=0;}
    const sec=song.sections[this.secI];
    if(sec){if(this.secPos>=sec.patterns.length)this.secPos=0;if(this.secRep>=sec.repeat)this.secRep=0;}
   }
   if(Number.isFinite(tempo)){this.tempo=Math.min(200,Math.max(60,tempo));this.stepLen=this.computeStepLen();}
   if(Number.isFinite(swing))this.swing=Math.min(.75,Math.max(.5,swing));
   if(Array.isArray(patterns))this.patterns=patterns;
   if(Array.isArray(chain))this.chain=chain.filter(i=>Number.isInteger(i)&&i>=0&&i<Math.max(1,this.patterns.length));
   if(Number.isInteger(transpose))this.transpose=Math.min(12,Math.max(-12,transpose));
   if(this.chainPos>=this.chain.length)this.chainPos=0;
   if(this.step>=this.len(this.pat))this.step=this.len(this.pat)-1; // the next advance wraps
  }
  // Stopped: switch now. Running: start it at the end of the current loop.
  select(i){
   if(!Number.isInteger(i)||i<0)return;
   if(!this.running){this.pat=i;this.queued=-1;return;}
   if(this.songActive())return; // the song decides what plays; the selection only changes what is edited
   this.queued=i===this.pat?-1:i;
  }
  noteOf(s){return BASE_NOTE+s.octave*12+s.note+this.transpose;}
  start(engine){
   this.running=true;this.step=0;this.count=0;this.pos=0;this.prevGate=false;this.prevSlide=false;this.queued=-1;
   this.bassOffAt=Infinity;this.prevBassTie=false;
   if(this.songActive()){this.secI=0;this.secPos=0;this.secRep=0;this.pat=this.song.sections[0].patterns[0];}
   else if(this.chain.length){this.chainPos=0;this.pat=this.chain[0];}
   if(engine.layer)engine.layer.restart();
   this.fire(engine);
  }
  stop(engine){if(engine.layer)engine.layer.stop();if(this.running){engine.noteOff();if(engine.bassOff)engine.bassOff();}this.bassOffAt=Infinity;if(engine.setAuto)for(const id of AUTO)engine.setAuto(id,-1);engine.stepVowel=-1;this.running=false;this.offAt=Infinity;this.lastFired=-1;this.changed=true;}
  tick(engine){
   if(!this.running)return;
   this.pos+=1;
   if(this.pos>=this.offAt){engine.noteOff();this.offAt=Infinity;}
   if(this.pos>=this.bassOffAt){if(engine.bassOff)engine.bassOff();this.bassOffAt=Infinity;}
   if(this.pos>=this.curLen){this.pos-=this.curLen;this.advance();this.fire(engine);}
  }
  nextPattern(){
   if(this.songActive())return this.songNext();
   if(this.queued>=0)return this.queued;
   if(this.chain.length)return this.chain[(this.chainPos+1)%this.chain.length];
   return this.pat;
  }
  advance(){
   this.step++;
   if(this.step<this.len(this.pat))return;
   this.step=0;
   if(this.songActive()){this.pat=this.songNext();this.secI=this.nS;this.secPos=this.nI;this.secRep=this.nR;this.queued=-1;return;}
   const fromQueue=this.queued>=0;
   this.pat=this.nextPattern();this.queued=-1;
   if(this.chain.length){const ci=this.chain.indexOf(this.pat);this.chainPos=fromQueue?(ci>=0?ci:this.chainPos):(this.chainPos+1)%this.chain.length;}
  }
  upcoming(){
   if(this.step+1<this.len(this.pat))return this.patterns[this.pat]?.steps[this.step+1];
   return this.patterns[this.nextPattern()]?.steps[0];
  }
  fire(engine){
   const p=this.patterns[this.pat],s=p?.steps[this.step],m=this.songActive()?this.song.sections[this.secI].mute:null;
   const leadOn=!!(s&&s.gate&&!(m&&m.lead));
   // Swing follows the absolute 16th count, so odd pattern lengths and pattern changes keep the groove.
   this.curLen=this.stepLen*2*(this.count%2===0?this.swing:1-this.swing);
   if(engine.onStep)engine.onStep(this.curLen);
   // Default kick: every beat, counted from Play so it stays straight with odd pattern lengths. A programmed pattern overrides it.
   // Fills follow the absolute bar, so they land at the end of the phrase with any pattern length.
   const pos=this.count%16;let fi=Beats.fillIndex(Math.floor(this.count/16),engine.target?engine.target.fill:0,pos);
   if(fi>=0&&!Beats.hasDrums(p))fi=-1;
   const F=fi>=0?Beats.FILLS[fi]:null;
   const kick=F?F.k[pos]===1:p&&Array.isArray(p.kicks)?p.kicks[this.step]===true:this.count%4===0;
   if(kick&&!(m&&m.kick)&&engine.kickHit)engine.kickHit();
   if(engine.layer)engine.layer.step(this.count,this.curLen,s,!!(m&&m.lead&&m.bass)); // Orbit rests only while both melodic parts do
   this.count++;
   this.applyAuto(engine,this.pat,this.step); // before noteOn, which reads the decay
   if(s&&engine.drumHit){
    const hat=F?F.h[pos]:s.hat,clap=F?false:s.clap,snare=F?F.s[pos]:s.snare||0;
    engine.drumHit(m&&m.hat?0:hat,m&&m.clap?false:clap,m&&m.snare?0:snare);
   }
   if(engine.bassOn){
    if(s&&s.bass>=0&&!(m&&m.bass)){
     engine.bassOn(BASE_NOTE+(s.bassOct||0)*12+s.bass+this.transpose,this.prevBassTie);
     const nb=this.upcoming();
     this.bassOffAt=s.bassTie&&nb&&nb.bass>=0?Infinity:this.curLen*.85;
     this.prevBassTie=s.bassTie===true;
    }else{engine.bassOff();this.bassOffAt=Infinity;this.prevBassTie=false;}
   }
   if(leadOn)engine.stepVowel=Number.isInteger(s.vowel)?s.vowel:-1;
   if(leadOn){
    engine.noteOn(this.noteOf(s),s.accent,this.prevGate&&this.prevSlide);
    const next=this.upcoming();
    this.offAt=s.slide&&next&&next.gate?Infinity:this.curLen*(GATES[s.gateLen]||GATES[0]);
   }else{engine.noteOff();this.offAt=Infinity;}
   this.prevGate=leadOn;this.prevSlide=!!(s&&s.slide);
   this.lastFired=this.step;this.lastPat=this.pat;this.changed=true;
  }
 }
 const api={Sequencer,GATES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoSequencer=api;
})(globalThis);

/* Tempo-synced glitch processor. DOM-free, allocation-free per sample, deterministic (seeded RNG).
   Events last one step and replace the dry signal with a short crossfade:
   - stutter: loops the most recent slice (1/16 down to 1/256), copied to its own loop buffer
   - reverse: plays the previous audio backwards
   - tape stop: the read head slows to a halt (linear interpolation)
   hold(true) starts an endless stutter for live performance. Crush = bit depth + sample-and-hold rate reduction. */
(function(root){
 const SEED=0x5eed;
 const NONE=0,STUTTER=1,REVERSE=2,TAPE=3;
 class Glitch{
  constructor(sr){
   this.sr=sr;this.size=Math.ceil(sr*2.5);this.buf=new Float32Array(this.size);
   this.loop=new Float32Array(Math.ceil(sr*.4)); // longest step: 60 BPM with 75% swing = 0.375 s
   this.fadeCoef=1-Math.exp(-1/(.002*sr));this.declick=Math.exp(-1/(.0015*sr));
   this.reset();
  }
  reset(){
   this.buf.fill(0);this.w=0;this.mode=NONE;this.active=false;this.mix=0;this.remaining=0;this.held=false;
   this.loop.fill(0);this.sliceLen=1;this.p=0;this.revStart=0;this.t=0;this.readPos=0;this.len=1;
   this.crushPhase=1;this.crushHeld=0;this.rngState=SEED;
   this.lastWet=0;this.offset=0;this.jump=false;
  }
  rand(){let t=this.rngState=this.rngState+0x6D2B79F5>>>0;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
  // slice: fraction of a step (1, 1/2 ... 1/16).
  // The slice is copied so the main buffer keeps recording: a reverse right after a stutter reads continuous audio.
  startStutter(stepLen,slice){
   const L=Math.min(this.loop.length,Math.max(16,Math.round(stepLen*slice)));
   let s=this.w-L;if(s<0)s+=this.size;
   for(let i=0;i<L;i++){this.loop[i]=this.buf[s];if(++s>=this.size)s=0;}
   this.mode=STUTTER;this.sliceLen=L;this.p=0;this.active=true;
  }
  // Called on every 16th (sequencer step or free-running clock).
  onStep(stepLen,probability,slice){
   if(this.held)return;
   const r=this.rand(),kind=this.rand();
   if(!(probability>0&&r<probability))return;
   this.jump=this.mode!==NONE; // a new event cuts into a running one: smooth the step in the wet signal
   this.remaining=Math.round(stepLen);
   if(kind<.5)this.startStutter(stepLen,slice);
   else if(kind<.75){this.mode=REVERSE;this.revStart=this.w;this.t=0;this.active=true;}
   else{this.mode=TAPE;this.readPos=this.w-1<0?this.size-1:this.w-1;this.len=this.remaining;this.active=true;}
  }
  hold(on,stepLen,slice){
   if(on&&!this.held){this.held=true;this.remaining=Infinity;this.startStutter(stepLen,slice);}
   else if(!on&&this.held){this.held=false;this.active=false;}
  }
  read(x){
   const b=this.buf,n=this.size;
   if(this.mode===STUTTER){
    const L=this.sliceLen,F=Math.min(64,L>>2),p=this.p;
    const g=Math.min(1,p/F,(L-p)/F);
    if(++this.p>=L)this.p=0;
    return this.loop[p]*g;
   }
   if(this.mode===REVERSE){
    let i=this.revStart-1-this.t;i%=n;if(i<0)i+=n;
    this.t++;return b[i];
   }
   if(this.mode===TAPE){
    const rate=this.active?this.remaining/this.len:0;
    let r=this.readPos;const i0=Math.floor(r),f=r-i0,i1=i0+1>=n?0:i0+1;
    const y=b[i0]+(b[i1]-b[i0])*f;
    r+=rate;if(r>=n)r-=n;this.readPos=r;
    return y;
   }
   return x;
  }
  process(x,crush){
   this.buf[this.w]=x;if(++this.w>=this.size)this.w=0;
   let y=x;
   if(this.mode!==NONE){
    if(this.active&&--this.remaining<=0)this.active=false;
    this.mix+=((this.active?1:0)-this.mix)*this.fadeCoef;
    let wet=this.read(x);
    if(this.jump){this.offset=this.lastWet-wet;this.jump=false;}
    wet+=this.offset;this.offset*=this.declick;this.lastWet=wet;
    y=x+(wet-x)*this.mix;
    if(!this.active&&this.mix<1e-4){this.mode=NONE;this.mix=0;this.offset=0;}
   }
   if(crush>1e-5){
    const bits=16-crush*13,q=Math.pow(2,bits-1);
    this.crushPhase+=Math.pow(2,-crush*5);
    if(this.crushPhase>=1){this.crushPhase-=1;this.crushHeld=Math.round(y*q)/q;}
    y=this.crushHeld;
   }else this.crushPhase=1;
   return y;
  }
 }
 const api={Glitch,NONE,STUTTER,REVERSE,TAPE};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoGlitch=api;
})(globalThis);

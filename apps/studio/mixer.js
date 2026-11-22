/* Channel strips for Luma Studio: mute, solo, pan, post-fader delay and reverb sends, peak meters.
   DOM-free and allocation-free in process(). Sends are read by the engine on the next sample. */
(function(root){
 const CHANNELS=['lead','orbit','bass','kick','snare','hat','clap'],N=CHANNELS.length,MASTER=N;
 const DUCKED=[1,1,1,0,0,0,0]; // same sidechain routing as the Acido engine
 class Mixer{
  constructor(sr){
   this.k=1-Math.exp(-1/(.005*sr)); // 5 ms, so mute and solo do not click
   this.mute=new Uint8Array(N);this.solo=new Uint8Array(N);this.pan=new Float64Array(N);this.delay=new Float64Array(N);this.reverb=new Float64Array(N);
   this.a=new Float64Array(N);this.b=new Float64Array(N);
   this.tL=new Float64Array(N);this.tR=new Float64Array(N);this.tD=new Float64Array(N);this.tV=new Float64Array(N);
   this.gL=new Float64Array(N);this.gR=new Float64Array(N);this.gD=new Float64Array(N);this.gV=new Float64Array(N);
   this.peak=new Float32Array(N+1);this.returnDelay=1;this.returnReverb=1;
   this.update();this.reset();
  }
  update(){
   let soloed=false;for(let i=0;i<N;i++)if(this.solo[i])soloed=true;
   for(let i=0;i<N;i++){
    const on=!this.mute[i]&&(!soloed||this.solo[i])?1:0,p=this.pan[i];
    this.tL[i]=on*Math.min(1,1-p);this.tR[i]=on*Math.min(1,1+p);this.tD[i]=on*this.delay[i];this.tV[i]=on*this.reverb[i];
   }
  }
  setStrip(i,s){
   if(!(i>=0&&i<N))return;
   const unit=(v,min=0)=>Number.isFinite(v)?Math.min(1,Math.max(min,v)):0;
   this.mute[i]=s.mute?1:0;this.solo[i]=s.solo?1:0;this.pan[i]=unit(s.pan,-1);this.delay[i]=unit(s.delay);this.reverb[i]=unit(s.reverb);
   this.update();
  }
  setReturns(delay,reverb){if(Number.isFinite(delay))this.returnDelay=Math.min(1,Math.max(0,delay));if(Number.isFinite(reverb))this.returnReverb=Math.min(1,Math.max(0,reverb));}
  reset(){
   this.gL.set(this.tL);this.gR.set(this.tR);this.gD.set(this.tD);this.gV.set(this.tV);this.peak.fill(0);
   this.retD=this.returnDelay;this.retV=this.returnReverb;this.delayIn=this.reverbIn=this.duckL=this.duckR=this.dryL=this.dryR=0;
  }
  process(lead,orbitL,orbitR,bass,kick,snare,hat,clap){
   const a=this.a,b=this.b,k=this.k,gL=this.gL,gR=this.gR,gD=this.gD,gV=this.gV,tL=this.tL,tR=this.tR,tD=this.tD,tV=this.tV,peak=this.peak;
   a[0]=b[0]=lead;a[1]=orbitL;b[1]=orbitR;a[2]=b[2]=bass;a[3]=b[3]=kick;a[4]=b[4]=snare;a[5]=b[5]=hat;a[6]=b[6]=clap;
   let duckL=0,duckR=0,dryL=0,dryR=0,del=0,rev=0;
   for(let i=0;i<N;i++){
    gL[i]+=(tL[i]-gL[i])*k;gR[i]+=(tR[i]-gR[i])*k;gD[i]+=(tD[i]-gD[i])*k;gV[i]+=(tV[i]-gV[i])*k;
    const l=a[i]*gL[i],r=b[i]*gR[i],mono=(a[i]+b[i])*.5,al=l<0?-l:l,ar=r<0?-r:r,m=al>ar?al:ar;
    if(m>peak[i])peak[i]=m;
    del+=mono*gD[i];rev+=mono*gV[i];
    if(DUCKED[i]){duckL+=l;duckR+=r;}else{dryL+=l;dryR+=r;}
   }
   this.retD+=(this.returnDelay-this.retD)*k;this.retV+=(this.returnReverb-this.retV)*k;
   this.delayIn=del;this.reverbIn=rev;this.duckL=duckL;this.duckR=duckR;this.dryL=dryL;this.dryR=dryR;
  }
 }
 const api={Mixer,CHANNELS,MASTER};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LumaMixer=api;
})(globalThis);

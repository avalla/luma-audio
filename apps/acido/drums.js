/* Synthesized hi-hat and clap. DOM-free, allocation-free per sample, deterministic.
   Hat: six detuned squares plus noise through two high-pass stages; a closed hit chokes the open one.
   Clap: band-passed noise with three quick bursts and a short tail.
   Snare: two detuned body tones plus high-passed noise; a ghost hit is the same sound, quieter. */
(function(root){
 const TAU=Math.PI*2;
 const METAL=[205.3,304.4,369.6,522.7,540,800];
 class Drums{
  constructor(sr){
   this.sr=sr;this.inc=new Float64Array(6);this.ph=new Float64Array(6);
   for(let i=0;i<6;i++)this.inc[i]=METAL[i]*2.4/sr;
   this.hpCoef=1-Math.exp(-TAU*7000/sr);
   this.closedCoef=Math.exp(-6.9/(.055*sr));this.openCoef=Math.exp(-6.9/(.34*sr));
   this.burstCoef=Math.exp(-6.9/(.012*sr));this.tailCoef=Math.exp(-6.9/(.19*sr));
   this.b2=Math.round(.011*sr);this.b3=Math.round(.022*sr);this.b4=Math.round(.033*sr);
   this.bpG=Math.tan(Math.PI*1300/sr);this.bpK=1/1.6;
   this.bpA1=1/(1+this.bpG*(this.bpG+this.bpK));this.bpA2=this.bpG*this.bpA1;this.bpA3=this.bpG*this.bpA2;
   this.snBodyCoef=Math.exp(-6.9/(.09*sr));this.snNoiseCoef=Math.exp(-6.9/(.17*sr));this.snHp=1-Math.exp(-TAU*1800/sr);this.snInc1=185/sr;this.snInc2=330/sr;
   this.reset();
  }
  reset(){
   this.ph.fill(0);this.hatEnv=0;this.hatCoef=this.closedCoef;this.lp1=this.lp2=0;
   this.burst=0;this.tail=0;this.clapT=-1;this.ic1=this.ic2=0;this.noise=0x51ed;this.hatOut=0;this.clapOut=0;
   this.snEnv=0;this.snBody=0;this.snPh1=0;this.snPh2=0;this.snLp=0;this.snLevel=1;this.snareOut=0;
  }
  hat(open){this.hatEnv=1;this.hatCoef=open?this.openCoef:this.closedCoef;}
  clap(){this.clapT=0;this.burst=1;this.tail=0;}
  snare(level){this.snEnv=1;this.snBody=1;this.snLevel=level;}
  process(){
   this.hatOut=0;this.clapOut=0;this.snareOut=0;
   if(this.hatEnv<1e-5&&this.clapT<0&&this.burst<1e-5&&this.tail<1e-5&&this.snEnv<1e-5)return;
   this.noise=Math.imul(this.noise,1664525)+1013904223|0;
   const n=this.noise/2147483648;
   if(this.hatEnv>=1e-5){
    let metal=0;
    for(let i=0;i<6;i++){let p=this.ph[i]+this.inc[i];if(p>=1)p-=1;this.ph[i]=p;metal+=p<.5?1:-1;}
    const x=metal/6*.7+n*.3;
    this.lp1+=(x-this.lp1)*this.hpCoef;const h1=x-this.lp1;
    this.lp2+=(h1-this.lp2)*this.hpCoef;
    this.hatOut=(h1-this.lp2)*this.hatEnv*1.7;
    this.hatEnv*=this.hatCoef;
   }
   if(this.clapT>=0){
    const c=this.clapT++;
    if(c===this.b2||c===this.b3)this.burst=1;
    if(c===this.b4){this.tail=1;this.clapT=-1;}
   }
   const env=Math.max(this.burst,this.tail*.7);
   if(env>=1e-5){
    const v3=n-this.ic2,v1=this.bpA1*this.ic1+this.bpA2*v3,v2=this.ic2+this.bpA2*this.ic1+this.bpA3*v3;
    this.ic1=2*v1-this.ic1;this.ic2=2*v2-this.ic2;
    this.clapOut=v1*this.bpK*env*2.2;
   }
   this.burst*=this.burstCoef;this.tail*=this.tailCoef;
   if(this.snEnv>=1e-5){
    let a=this.snPh1+this.snInc1,b=this.snPh2+this.snInc2;if(a>=1)a-=1;if(b>=1)b-=1;this.snPh1=a;this.snPh2=b;
    this.snLp+=(n-this.snLp)*this.snHp;
    this.snareOut=((Math.sin(TAU*a)*.6+Math.sin(TAU*b)*.4)*this.snBody*.6+(n-this.snLp)*this.snEnv*.8)*this.snLevel;
    this.snBody*=this.snBodyCoef;this.snEnv*=this.snNoiseCoef;
   }
  }
 }
 const api={Drums};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoDrums=api;
})(globalThis);

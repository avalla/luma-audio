/* Synthesized techno kick. DOM-free, allocation-free, deterministic.
   Sine body with a fast exponential pitch drop, exponential amp decay, short noise+tone click, soft saturation.
   duckGain() gives the sidechain gain for the bass: fast attack on the hit, release following the body. */
(function(root){
 const TAU=Math.PI*2;
 function sat(x){if(x>3)return 1;if(x<-3)return -1;const x2=x*x;return x*(27+x2)/(27+9*x2);}
 class Kick{
  constructor(sr){
   this.sr=sr;
   this.pitchCoef=Math.exp(-1/(.028*sr));
   this.clickCoef=Math.exp(-1/(.004*sr));
   this.duckAttack=1-Math.exp(-1/(.002*sr));this.duckRelease=1-Math.exp(-1/(.09*sr));
   this.reset();
  }
  reset(){this.phase=0;this.amp=0;this.pitch=0;this.click=0;this.clickPhase=0;this.duck=0;this.noise=0x1234;this.ampCoef=0;}
  // tune 0..1 -> 40..70 Hz body; decay 0..1 -> 150..800 ms to -60 dB.
  trigger(decay){
   this.phase=0;this.amp=1;this.pitch=1;this.click=1;this.clickPhase=0;
   this.ampCoef=Math.exp(-6.9/((.15+decay*.65)*this.sr));
  }
  process(tune){
   if(this.amp<1e-5&&this.click<1e-5){this.duck+=(0-this.duck)*this.duckRelease;return 0;}
   const base=40+tune*30,f=base*(1+3.2*this.pitch);
   this.phase+=f/this.sr;if(this.phase>=1)this.phase-=1;
   const body=Math.sin(TAU*this.phase)*this.amp;
   this.noise=Math.imul(this.noise,1664525)+1013904223|0;
   this.clickPhase+=1800/this.sr;if(this.clickPhase>=1)this.clickPhase-=1;
   const click=(this.noise/2147483648*.5+Math.sin(TAU*this.clickPhase)*.5)*this.click*.35;
   this.pitch*=this.pitchCoef;this.amp*=this.ampCoef;this.click*=this.clickCoef;
   const target=this.amp;
   this.duck+=(target-this.duck)*(target>this.duck?this.duckAttack:this.duckRelease);
   return sat((body+click)*1.5);
  }
  duckGain(amount){return 1-amount*.85*(this.duck>1?1:this.duck);}
 }
 const api={Kick};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoKick=api;
})(globalThis);

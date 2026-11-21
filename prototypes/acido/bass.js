/* Second monophonic voice: saw plus sine through a 2-pole low-pass. DOM-free, allocation-free per sample.
   A tied note glides without retriggering the envelopes. Exactly silent when idle. */
(function(root){
 const TAU=Math.PI*2;
 function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
 function sat(x){if(x>3)return 1;if(x<-3)return -1;const x2=x*x;return x*(27+x2)/(27+9*x2);}
 class Bass{
  constructor(sr){
   this.sr=sr;
   this.attack=1-Math.exp(-1/(.002*sr));this.release=1-Math.exp(-1/(.012*sr));
   this.glide=1-Math.exp(-1/(.025*sr));this.filterEnvCoef=Math.exp(-6.9/(.22*sr));
   this.reset();
  }
  reset(){this.phase=0;this.pitch=36;this.target=36;this.gate=false;this.amp=0;this.body=0;this.fenv=0;this.ic1=this.ic2=0;this.count=0;this.a1=1;this.a2=0;this.a3=0;}
  on(note,tied){
   this.target=note;
   if(!(tied&&this.gate)){this.pitch=note;this.body=1;this.fenv=1;}
   this.gate=true;
  }
  off(){this.gate=false;}
  // tone 0..1 -> 80..2560 Hz; decay 0..1 -> 150 ms..2 s to the sustain floor.
  process(tone,decay){
   if(!this.gate&&this.amp<1e-5){if(this.amp!==0){this.amp=0;this.ic1=this.ic2=0;}return 0;}
   this.pitch+=(this.target-this.pitch)*this.glide;
   const hz=440*Math.pow(2,(this.pitch-69)/12),dt=Math.min(.45,hz/this.sr);
   this.phase+=dt;if(this.phase>=1)this.phase-=1;
   const x=(2*this.phase-1-blep(this.phase,dt))*.5+Math.sin(TAU*this.phase)*.6;
   if(--this.count<=0){
    this.count=8;
    const fc=Math.min(this.sr*.42,80*Math.pow(2,tone*5+this.fenv*1.6)),g=Math.tan(Math.PI*fc/this.sr),k=1.1;
    this.a1=1/(1+g*(g+k));this.a2=g*this.a1;this.a3=g*this.a2;
    this.bodyCoef=Math.exp(-6.9*8/((.15+decay*1.85)*this.sr));
    this.fenvStep=Math.pow(this.filterEnvCoef,8);
    this.body*=this.bodyCoef;this.fenv*=this.fenvStep;
   }
   const v3=x-this.ic2,v1=this.a1*this.ic1+this.a2*v3,v2=this.ic2+this.a2*this.ic1+this.a3*v3;
   this.ic1=2*v1-this.ic1;this.ic2=2*v2-this.ic2;
   const target=this.gate?.35+.65*this.body:0;
   this.amp+=(target-this.amp)*(target>this.amp?this.attack:this.release);
   return sat(v2*1.3)*this.amp;
  }
 }
 const api={Bass};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoBass=api;
})(globalThis);

/* "Talking" filter: three parallel band-passes (TPT state-variable, stable under modulation) morphing across A E I O U.
   DOM-free, allocation-free. Exact bypass at mix 0. */
(function(root){
 const VOWELS=[[730,1090,2440],[530,1840,2480],[270,2290,3010],[570,840,2410],[300,870,2240]];
 const GAIN=[1,.62,.3],Q=[8,11,13];
 class Formant{
  constructor(sr){
   this.sr=sr;this.ic1=new Float64Array(3);this.ic2=new Float64Array(3);
   this.a1=new Float64Array(3);this.a2=new Float64Array(3);this.a3=new Float64Array(3);this.k=new Float64Array(3);
   for(let b=0;b<3;b++)this.k[b]=1/Q[b];
   this.reset();
  }
  reset(){this.ic1.fill(0);this.ic2.fill(0);this.count=0;}
  update(pos){
   const i=Math.min(4,Math.max(0,Math.floor(pos))),j=Math.min(4,i+1),f=Math.min(1,Math.max(0,pos-i));
   for(let b=0;b<3;b++){
    const hz=Math.min(this.sr*.45,VOWELS[i][b]*Math.pow(VOWELS[j][b]/VOWELS[i][b],f));
    const g=Math.tan(Math.PI*hz/this.sr),a1=1/(1+g*(g+this.k[b]));
    this.a1[b]=a1;this.a2[b]=g*a1;this.a3[b]=g*g*a1;
   }
  }
  // pos 0..4 = A..U.
  process(x,pos,mix){
   if(mix<=1e-5){if(this.count!==0)this.reset();return x;}
   if(--this.count<=0){this.count=8;this.update(pos);}
   let out=0;
   for(let b=0;b<3;b++){
    const c1=this.ic1[b],c2=this.ic2[b],v3=x-c2,v1=this.a1[b]*c1+this.a2[b]*v3,v2=c2+this.a2[b]*c1+this.a3[b]*v3;
    this.ic1[b]=2*v1-c1;this.ic2[b]=2*v2-c2;
    out+=v1*this.k[b]*GAIN[b];
   }
   return x+(out*2.6-x)*mix;
  }
 }
 const api={Formant,VOWELS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoFormant=api;
})(globalThis);

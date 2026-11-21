/* Compact stereo reverb: four-line feedback delay network with a Householder matrix and damping.
   DOM-free, buffers preallocated, stable for any size because the matrix is orthogonal and feedback < 1. */
(function(root){
 const TIMES=[.0297,.0371,.0411,.0437];
 class Reverb{
  constructor(sr){
   this.len=TIMES.map(s=>Math.round(s*sr*1.6));
   this.buf=this.len.map(n=>new Float32Array(n));
   this.pos=new Int32Array(4);this.lp=new Float64Array(4);
   this.damp=1-Math.exp(-Math.PI*2*5200/sr);
   this.reset();
  }
  reset(){for(const b of this.buf)b.fill(0);this.pos.fill(0);this.lp.fill(0);this.l=0;this.r=0;}
  // size 0..1 -> feedback .72..0.95. Output in this.l / this.r.
  process(x,size){
   const fb=.72+size*.23,b=this.buf,p=this.pos,lp=this.lp,d=this.damp;
   const a0=b[0][p[0]],a1=b[1][p[1]],a2=b[2][p[2]],a3=b[3][p[3]];
   this.l=(a0+a2)*.5;this.r=(a1+a3)*.5;
   const m=(a0+a1+a2+a3)*.5;
   for(let i=0;i<4;i++){
    const raw=(i===0?a0:i===1?a1:i===2?a2:a3)-m;
    lp[i]+=(raw-lp[i])*d;
    if(Math.abs(lp[i])<1e-15)lp[i]=0;
    b[i][p[i]]=lp[i]*fb+(i%2?-x:x)*.35;
    if(++p[i]>=this.len[i])p[i]=0;
   }
  }
 }
 const api={Reverb};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AcidoReverb=api;
})(globalThis);

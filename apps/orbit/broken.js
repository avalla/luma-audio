/* Timing stays within the scheduled pulse, including swung pulses. */
(function(root){
'use strict';
function plan(amount,interval,random=Math.random){
 if(amount<=0)return {rest:false,offsets:[0],gate:Infinity};
 const strength=Math.max(0,Math.min(1,amount/100));
 const rest=random()<strength*.28;
 const count=random()<strength*.65?(random()<.35?3:2):1;
 return {rest,offsets:Array.from({length:count},(_,i)=>i*interval/count),gate:Math.max(.02,interval/count*(.85-.5*strength))};
}
const api={plan};if(typeof module!=='undefined')module.exports=api;else root.OrbitBroken=api;
})(globalThis);

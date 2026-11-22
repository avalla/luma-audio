'use strict';
const assert=require('node:assert/strict'),{plan}=require('./broken.js');
assert.deepEqual(plan(0,.2,()=>{throw Error('Zero must preserve random stream');}),{rest:false,offsets:[0],gate:Infinity});
for(const interval of [.06,.25,.8])for(let i=0;i<500;i++){
 const p=plan(100,interval);assert(p.offsets.length>=1&&p.offsets.length<=3);
 assert(p.offsets.every(t=>t>=0&&t+p.gate<=interval+1e-9));
}
assert.equal(plan(100,.3,()=>0).offsets.length,3);
assert.equal(plan(100,.3,()=>0).rest,true);
console.log('PASS: Broken subdivisions, rests, pulse bounds and neutral random stream');

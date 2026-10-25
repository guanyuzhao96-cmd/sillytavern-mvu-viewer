const assert=require('node:assert/strict');
(async()=>{
 const {deleteBatch}=await import('./worldbooks-batch.mjs');
 let active=0,peak=0;const calls=[],progress=[];
 const result=await deleteBatch(Array.from({length:100},(_,i)=>String(i)),async name=>{active++;peak=Math.max(peak,active);calls.push(name);await new Promise(r=>setTimeout(r,2));active--;},{concurrency:3,onProgress:n=>progress.push(n)});
 assert.equal(result.length,100);assert.equal(new Set(calls).size,100);assert.equal(peak,3);assert.equal(active,0);assert.equal(progress.at(-1),100);
 const started=[];const failures=await deleteBatch(['bad','inflight','third','never'],async name=>{started.push(name);if(name==='bad')throw Error('fixture');await new Promise(r=>setTimeout(r,5));},{concurrency:3});
 assert.deepEqual(started,['bad','inflight','third']);assert.equal(failures.filter(r=>!r.ok).length,1);assert.equal(failures.length,3);
 const serial=[];await deleteBatch(['bad','never'],async name=>{serial.push(name);throw Error('fail');},{concurrency:1});assert.deepEqual(serial,['bad']);
 assert.deepEqual(await deleteBatch([],()=>assert.fail()),[]);
 console.log('PASS: bounded 3-worker queue, 100 unique deletions, progress, stop scheduling after error, await inflight, serial fallback, empty batch');
})().catch(e=>{console.error(e);process.exitCode=1});

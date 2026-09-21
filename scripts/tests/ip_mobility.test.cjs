const assert = require('node:assert/strict')
const {test} = require('node:test')
const path = require('node:path')
const {webcrypto} = require('node:crypto')
const {createTypeScriptLoader} = require('../test-support/load_typescript.cjs')
const root=path.resolve(__dirname,'../..')
const load=createTypeScriptLoader({root,moduleStubs:{react:{useSyncExternalStore(){throw new Error('React hooks are not exercised by this standalone probe')}}}})
const {createClientTransport}=load('frontend/src/api/clientTransport.ts')
const {OperationRecoveryRegistry,supportsOperationReceipt}=load('frontend/src/api/operationRecovery.ts')
const {waitForNetworkRetry}=load('frontend/src/lib/networkRecovery.ts')
const {RequestAbortedError}=load('frontend/src/api/errors.ts')
const {commitUploadAndTrackJob}=load('frontend/src/components/transfers/uploadRuntimeCommit.ts')
const {readPendingUploadCommit,pendingCommitRequest}=load('frontend/src/components/transfers/uploadCommitRecovery.ts')
function memoryStorage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),data}}
function setup(t){const oldFetch=global.fetch,oldWindow=global.window;const window=new EventTarget();window.sessionStorage=memoryStorage();global.window=window;t.after(()=>{global.fetch=oldFetch;global.window=oldWindow});return window}
function transport(){return createClientTransport({getApiToken:()=> 'secret-token',getBaseUrl:()=>'/api/v1'})}
function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}})}
function mutation(api){return api.fetchResponse('/jobs',{method:'POST',body:'{"type":"delete"}'},{profileId:'profile-a',retryDelayMs:1,retryMaxDelayMs:1})}
test('only explicit receipt-protected control routes are eligible',()=>{
 for(const [p,m] of [['/jobs','POST'],['/jobs/abc/retry','POST'],['/uploads/','POST'],['/uploads/id/commit','POST'],['/uploads/id/multipart/complete','POST'],['/buckets/b/objects/','DELETE'],['/buckets/b/objects/folder','POST']])assert.equal(supportsOperationReceipt(p,m),true)
 for(const [p,m] of [['/profiles','POST'],['/uploads/id/files','POST'],['/uploads/id/chunks','PUT'],['/jobs','GET'],['/buckets','DELETE']])assert.equal(supportsOperationReceipt(p,m),false)
})
test('lost mutation response reuses the SAME durable key, including new client instance',async t=>{
 setup(t);const seen=[];let calls=0;global.fetch=async(url,init)=>{if(url.endsWith('/operations/capabilities'))return json({version:1,durable:true});seen.push(new Headers(init.headers).get('Idempotency-Key'));if(calls++===0)throw new TypeError('network changed');return json({jobId:'one'},201,{'Idempotency-Replayed':'true'})}
 const res=await mutation(transport());assert.equal(res.status,201);assert.equal(seen.length,2);assert.ok(seen[0]);assert.equal(seen[0],seen[1]);assert.equal(JSON.parse(window.sessionStorage.getItem('s3desk.operationRecovery.v1'))[seen[0]],undefined)
})
test('gateway loss does not forget a pending intent across reload',async t=>{
 setup(t);const seen=[];let broken=true;global.fetch=async(url,init)=>{if(url.endsWith('/operations/capabilities'))return json({version:1,durable:true});seen.push(new Headers(init.headers).get('Idempotency-Key'));return broken?new Response('gateway lost the response',{status:502}):json({jobId:'one'},201,{'Idempotency-Replayed':'true'})}
 await mutation(transport());broken=false;await mutation(transport());assert.ok(seen.length>=4);assert.equal(new Set(seen).size,1)
})
test('unknown commit result is not auto-retried or converted into new intent',async t=>{
 setup(t);let calls=0;const keys=[];global.fetch=async(url,init)=>{if(url.endsWith('/operations/capabilities'))return json({version:1,durable:true});calls++;keys.push(new Headers(init.headers).get('Idempotency-Key'));return json({error:{code:'operation_outcome_unknown'}},409)}
 await mutation(transport());assert.equal(calls,1);await mutation(transport());assert.equal(calls,2);assert.equal(keys[0],keys[1])
})
test('old server does not gain unsafe POST replay',async t=>{
 setup(t);let calls=0;global.fetch=async(url,init)=>{if(url.endsWith('/operations/capabilities'))return new Response('',{status:404});calls++;assert.equal(new Headers(init.headers).has('Idempotency-Key'),false);throw new TypeError('network')}
 await assert.rejects(()=>mutation(transport()),TypeError);assert.equal(calls,1)
})
test('bulk file POST remains non-replayable',async t=>{
 setup(t);let calls=0;global.fetch=async()=>{calls++;throw new TypeError('network')};await assert.rejects(()=>transport().fetchResponse('/uploads/id/files',{method:'POST',body:'data'}),TypeError);assert.equal(calls,1)
})
test('recorded provider 5xx is not repeated automatically or forgotten on retry',async t=>{
 setup(t);const keys=[];global.fetch=async(url,init)=>{if(url.endsWith('/operations/capabilities'))return json({version:1,durable:true});keys.push(new Headers(init.headers).get('Idempotency-Key'));return json({error:{code:'provider_error'}},503,{'Idempotency-Replayed':'false'})};const api=transport();await mutation(api);assert.equal(keys.length,1);await mutation(api);assert.equal(keys[0],keys[1])
})
test('GET retries after network change without mutation key',async t=>{
 setup(t);let calls=0;global.fetch=async(url,init)=>{assert.equal(new Headers(init.headers).has('Idempotency-Key'),false);if(calls++===0)throw new TypeError('network');return json({ok:true})};await transport().fetchResponse('/buckets',{method:'GET'},{retryDelayMs:1});assert.equal(calls,2)
})
test('cancel during network backoff preserves RequestAbortedError',async t=>{
 setup(t);const ac=new AbortController();const promise=waitForNetworkRetry(60_000,ac.signal);ac.abort();await assert.rejects(promise,RequestAbortedError)
})
test('cancel capability wait never sends a mutation later',async t=>{
 setup(t);let resolve,calls=0;global.fetch=async url=>{calls++;assert.ok(url.endsWith('/operations/capabilities'));return new Promise(r=>resolve=r)};const ac=new AbortController();const promise=transport().fetchResponse('/jobs',{method:'POST',body:'{}',signal:ac.signal});await new Promise(r=>setImmediate(r));ac.abort();await assert.rejects(promise,RequestAbortedError);resolve(json({version:1,durable:true}));await new Promise(r=>setImmediate(r));assert.equal(calls,1)
})
test('registry persists no token/body and reuses protected intent after refresh',async t=>{
 setup(t);const first=await new OperationRecoveryRegistry().acquire('private token and object path');const second=await new OperationRecoveryRegistry().acquire('private token and object path');assert.equal(first.operation.key,second.operation.key);const raw=window.sessionStorage.getItem('s3desk.operationRecovery.v1');assert.ok(!raw.includes('private'));assert.ok(!raw.includes('path'))
})
test('pending commit body survives serialization without changing JSON order',()=>{
 const pending={uploadId:'abc',body:'{"totalFiles":1,"totalBytes":10,"items":[{"path":"x","size":10}]}' };const parsed=readPendingUploadCommit(JSON.parse(JSON.stringify(pending)));assert.deepEqual(parsed,pending);assert.equal(JSON.stringify(pendingCommitRequest(parsed)),pending.body);assert.equal(readPendingUploadCommit({uploadId:'x',body:'[]'}),undefined)
})
test('retry pending commit uses same session and request without local files',async()=>{
 let state={id:'task',profileId:'p',bucket:'b',pendingCommit:{uploadId:'previous',body:'{"totalFiles":1,"totalBytes":10}'}};let call
 await assert.rejects(()=>commitUploadAndTrackJob({taskId:'task',task:state,items:[],uploadId:'previous',api:{uploads:{commitUpload:async(...args)=>{call=args;throw new TypeError('response lost')}}},updateUploadTask:(id,fn)=>{state=fn(state)}}),TypeError)
 assert.equal(call[1],'previous');assert.deepEqual(call[2],{totalFiles:1,totalBytes:10});assert.equal(state.pendingCommit.uploadId,'previous');assert.equal(state.pendingCommit.body,'{"totalFiles":1,"totalBytes":10}')
})
test('task-level commit recovery never deletes or recreates the existing upload', async()=>{
 const {runUploadTask}=load('frontend/src/components/transfers/uploadRuntimeTask.ts')
 let state={id:'task',profileId:'p',bucket:'b',status:'failed',pendingCommit:{uploadId:'previous',body:'{"totalFiles":1,"totalBytes":10}'}}
 let commitCalls=0,deleteCalls=0,newSessions=0
 const ref=()=>({current:{}})
 await runUploadTask({
  taskId:'task',task:state,items:[],apiToken:'token',api:{uploads:{
   commitUpload:async(p,id,body)=>{commitCalls++;assert.equal(id,'previous');assert.equal(body.totalBytes,10);throw new TypeError('response interrupted')},
   deleteUpload:async()=>{deleteCalls++},createUpload:async()=>{newSessions++;throw new Error('must not create a new session')},
  }},uploadAbortersRef:ref(),uploadAttemptAbortersRef:ref(),uploadItemsByTaskIdRef:ref(),updateUploadTask:(id,fn)=>{state=fn(state)},queryClient:{invalidateQueries:async()=>{}},notifications:{error(){},warning(){},success(){},info(){},open(){}},handleUploadJobUpdate(){},
 })
 assert.equal(commitCalls,1);assert.equal(deleteCalls,0);assert.equal(newSessions,0);assert.equal(state.status,'failed');assert.equal(state.pendingCommit.uploadId,'previous')
})

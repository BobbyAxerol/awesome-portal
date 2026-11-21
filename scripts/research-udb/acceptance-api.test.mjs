import assert from 'node:assert/strict';
import {test} from 'node:test';
import {safeReadFetch} from './acceptance-api.mjs';
test('an idle socket closure retries a read once, preserving its actual HTTP refusal',async()=>{
  let calls=0;const response=new Response('{}',{status:503});
  const result=await safeReadFetch('http://127.0.0.1:8097/api/test',{method:'GET',headers:{}},async(_url,options)=>{
    if(++calls===1)throw Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_SOCKET'}});
    assert.equal(options.headers.connection,'close');return response;
  });assert.equal(calls,2);assert.equal(result.status,503);
});
test('never retry a write or a different error, and bound a failed read retry',async()=>{
  for(const [method,code,expected]of [['POST','UND_ERR_SOCKET',1],['GET','ECONNREFUSED',1],['GET','UND_ERR_SOCKET',2]]){
    let calls=0;await assert.rejects(safeReadFetch('http://127.0.0.1:8097/api/test',{method},async()=>{
      calls++;throw Object.assign(new TypeError('fetch failed'),{cause:{code}});
    }));assert.equal(calls,expected);
  }
});

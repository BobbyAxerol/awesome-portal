/** TEST_ONLY actual pg Pool construction/cache, NEVER connects to a database. */
import type { Pool } from "pg";
import { afterEach,describe,expect,it } from "vitest";
import { buildPool,getPool,type CorePoolProfile } from "../src/db/pool";

const pools=new Set<Pool>();let serial=0;
const profile=():CorePoolProfile=>({max:4,connectionTimeoutMillis:2000,statement_timeout:3000,
  query_timeout:6000,idle_in_transaction_session_timeout:3000});
const dsn=()=>`postgres://TEST_ONLY@127.0.0.1:1/TEST_ONLY-no-connect-${++serial}`;
function pool(url:string,input?:CorePoolProfile){const value=buildPool(url,input);pools.add(value);return value;}
afterEach(async()=>{
  for(const value of pools){expect(value.totalCount).toBe(0);
    if(!(value as Pool&{ended:boolean}).ended)await value.end();}
  pools.clear();
});
describe("TEST_ONLY bounded native pool profile without any socket",()=>{
  it("preserves original legacy max and connection timeout defaults",()=>{
    const value=pool(dsn());expect(value.options.max).toBe(10);
    expect(value.options.connectionTimeoutMillis).toBe(5000);
    expect(value.options.statement_timeout).toBeUndefined();expect(getPool()).toBe(value);
  });
  it("constructs actual pg Pool with every independently supplied bound",()=>{
    const input=profile(),value=pool(dsn(),input);
    for(const [key,bound] of Object.entries(input))expect(value.options[key as keyof typeof value.options]).toBe(bound);
    input.max=9;expect(value.options.max).toBe(4);expect(getPool()).toBe(value);
  });
  it("reuses the same profile and lets legacy callers use that SAME already bounded pool",()=>{
    const url=dsn(),value=pool(url,profile());
    expect(pool(url,{...profile()})).toBe(value);expect(pool(url)).toBe(value);
    expect(value.options.statement_timeout).toBe(3000);
  });
  it("refuses upgrading a live legacy cache entry, leaving original options untouched",()=>{
    const url=dsn(),value=pool(url);
    expect(()=>pool(url,profile())).toThrow("CURRENT_HUMAN_CORE_POOL_PROFILE_MISMATCH");
    expect(value.options.statement_timeout).toBeUndefined();expect(pool(url)).toBe(value);
  });
  it("refuses a changed native profile rather than mutating the live pool",()=>{
    const url=dsn(),value=pool(url,profile());
    expect(()=>pool(url,{...profile(),max:5})).toThrow("CURRENT_HUMAN_CORE_POOL_PROFILE_MISMATCH");
    expect(value.options.max).toBe(4);expect(pool(url,profile())).toBe(value);
  });
  it("validates every bound and query-vs-statement ordering before cache reuse",()=>{
    const url=dsn(),value=pool(url,profile());
    for(const alter of[{max:0},{max:11},{max:1.5},{connectionTimeoutMillis:0},{statement_timeout:60001},
      {query_timeout:3000},{idle_in_transaction_session_timeout:Number.NaN}])
      expect(()=>pool(url,{...profile(),...alter})).toThrow("CURRENT_HUMAN_CORE_POOL_PROFILE_INVALID");
    expect(pool(url,profile())).toBe(value);
  });
  it("removes only the ended cache entry, allowing fresh bounded reconstruction",async()=>{
    const url=dsn(),first=pool(url);await first.end();
    const next=pool(url,profile());expect(next).not.toBe(first);
    expect(next.options.statement_timeout).toBe(3000);expect(getPool()).toBe(next);
  });
});

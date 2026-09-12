import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useApiRead } from "./screens/profileContainers";
import { intentKey } from "./adapter";
import type { Result } from "./api/ports";

describe("BE-R2-8 read identity and workflow intent", () => {
  it("keeps a same-identity transient failure visibly stale and clears an authorization refusal", async () => {
    let answer: Result<string> = { ok:true,value:"alpha-a" };
    const { result,rerender } = renderHook(({ tick })=>useApiRead(()=>Promise.resolve(answer),[tick],
      { keepValue:true,identity:["alpha-a","paper"] }),{ initialProps:{ tick:0 } });
    await waitFor(()=>expect(result.current.value).toBe("alpha-a"));
    answer={ ok:false,status:"unavailable",reason:"UPSTREAM_503" };
    rerender({ tick:1 });
    await waitFor(()=>expect(result.current.status).toBe("stale"));
    expect(result.current.value).toBe("alpha-a");
    answer={ ok:false,status:"denied",reason:"WORKSPACE_NOT_FOUND" };
    rerender({ tick:2 });
    await waitFor(()=>expect(result.current.value).toBeNull());
    expect(result.current.status).toBe("denied");
  });

  it("never retains another account/environment while its new request is pending", async () => {
    let resolve!: (value: Result<string>)=>void;
    const { result,rerender } = renderHook(({ id })=>useApiRead(
      ()=>id==="a:paper"?Promise.resolve({ ok:true as const,value:"secret-a" }):new Promise<Result<string>>(done=>{ resolve=done; }),
      [id],{ keepValue:true,identity:[id] }),{ initialProps:{ id:"a:paper" } });
    await waitFor(()=>expect(result.current.value).toBe("secret-a"));
    rerender({ id:"b:live" });
    expect(result.current.value).toBeNull();
    await act(async()=>resolve({ ok:true,value:"b-only" }));
    expect(result.current.value).toBe("b-only");
  });

  it("separates action, revision and note while retrying the exact same intent", () => {
    const key=(verb:string,rev:number,note:string)=>intentKey("session","operation",verb,JSON.stringify(["ws",rev,note]));
    expect(key("ACKNOWLEDGE",1,"")).toBe(key("ACKNOWLEDGE",1,""));
    expect(new Set([key("ACKNOWLEDGE",1,""),key("RESOLVE",1,"note"),key("RESOLVE",2,"note"),key("RESOLVE",2,"changed")]).size).toBe(4);
  });
});

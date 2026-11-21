/** Synthetic repository failures exercise auth's lazy-retirement boundary.
 * They are not a mounted current-human provider or source commissioning proof. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AuthService } from "../src/auth/auth.service";
import type { Argon2CredentialService } from "../src/auth/argon";
import type { ControlApiConfig } from "../src/config";
import type { PortalUser } from "../src/domain";
import type { SessionsRepository } from "../src/repos/sessions";

type SessionRow=NonNullable<Awaited<ReturnType<SessionsRepository["findByTokenHash"]>>>;
const drainRefusal=()=>Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"),{code:"P0001"});

function fixture() {
  const auth=new AuthService({} as Pool,{AUTH_MODE:"dev"} as ControlApiConfig,{} as Argon2CredentialService);
  const now=new Date(),future=new Date(now.getTime()+60_000);
  const row:SessionRow={sessionId:"TEST_ONLY-session",userId:"TEST_ONLY-user",state:"ACTIVE",sessionVersion:2,
    authenticationTime:now,idleExpiresAt:future,absoluteExpiresAt:future,accessSubject:null,accessTokenExpiresAt:null,
    csrfSecretHash:"TEST_ONLY-csrf-hash",activationId:null,createdAt:now,lastSeenAt:now,revokedAt:null,revokeReason:null};
  const user:PortalUser={userId:row.userId,username:"test-only-user",displayName:"TEST_ONLY",role:"USER",
    status:"ACTIVE",mustChangePassword:false,failedLoginCount:0,lockedUntil:null,sessionVersion:row.sessionVersion,
    createdAt:now,updatedAt:now,disabledAt:null,accountRevision:1,archivedAt:null};
  vi.spyOn(auth.sessions,"findByTokenHash").mockResolvedValue(row);
  const findUser=vi.spyOn(auth.users,"findById").mockResolvedValue(user);
  const revoke=vi.spyOn(auth.sessions,"revokeSession").mockResolvedValue(undefined);
  return {auth,row,user,findUser,revoke};
}

describe("ELP2-10 invalid sessions stay invalid while authority cleanup is draining",()=>{
  it.each(["missing","disabled","archived","generation"] as const)(
    "%s identity refuses authentication even when lazy revocation is deferred",async mode=>{
      const f=fixture();
      if(mode==="missing")f.findUser.mockResolvedValue(null);
      if(mode==="disabled")f.user.status="DISABLED";
      if(mode==="archived")f.user.archivedAt=new Date();
      if(mode==="generation")f.user.sessionVersion++;
      f.revoke.mockRejectedValue(drainRefusal());
      expect(await f.auth.sessionFromToken("TEST_ONLY-token")).toMatchObject({state:"REVOKED"});
      expect(f.revoke).toHaveBeenCalledExactlyOnceWith(f.row.sessionId,"identity_or_generation_revoked");
      expect(f.row.state).toBe("ACTIVE"); // No invented persisted bookkeeping.
    });

  it.each(["idleExpiresAt","absoluteExpiresAt"] as const)(
    "%s expiry is final even when the drain defers the expiry write",async field=>{
      const f=fixture();f.row[field]=new Date(Date.now()-1_000);f.revoke.mockRejectedValue(drainRefusal());
      expect(await f.auth.sessionFromToken("TEST_ONLY-token")).toMatchObject({state:"EXPIRED"});
      expect(f.revoke).toHaveBeenCalledExactlyOnceWith(f.row.sessionId,"expired");
      expect(f.row.state).toBe("ACTIVE");
    });

  it("a current active session neither mutates nor loses its original state",async()=>{
    const f=fixture();
    expect(await f.auth.sessionFromToken("TEST_ONLY-token")).toBe(f.row);
    expect(f.revoke).not.toHaveBeenCalled();
  });

  it("a different pending mutation may defer bookkeeping but not session invalidity",async()=>{
    const f=fixture();f.user.sessionVersion++;
    f.revoke.mockRejectedValue(Object.assign(new Error("CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED"),{code:"P0001"}));
    expect(await f.auth.sessionFromToken("TEST_ONLY-token")).toMatchObject({state:"REVOKED"});
  });

  it.each([
    Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED"),{code:"08006"}),
    Object.assign(new Error("unrelated policy failure"),{code:"P0001"}),
    Object.assign(new Error("CURRENT_HUMAN_DRAIN_REQUIRED "),{code:"P0001"}),
    Object.assign(new Error("lock not available"),{code:"55P03"}),
    new Error("database unavailable"),
  ])("does not swallow an unrelated cleanup error: %s",async error=>{
    const f=fixture();f.user.sessionVersion++;f.revoke.mockRejectedValue(error);
    await expect(f.auth.sessionFromToken("TEST_ONLY-token")).rejects.toBe(error);
  });
});

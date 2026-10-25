import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { oauthForwardPath, safeInternalPath } from "../lib/auth-paths";
import {
  accessTokenLooksLikePasswordRecovery,
  authTypeIndicatesRecovery,
  decodeJwtPayload,
  resolvePostAuthDestination,
} from "../lib/auth-recovery";
import {
  eligibilityFromAuthUser,
  userCanReceivePasswordResetEmail,
} from "../lib/auth-identities";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("authTypeIndicatesRecovery", () => {
  it("recognizes recovery type", () => {
    assert.equal(authTypeIndicatesRecovery("recovery"), true);
    assert.equal(authTypeIndicatesRecovery("signup"), false);
  });
});

describe("accessTokenLooksLikePasswordRecovery", () => {
  it("detects OTP recovery without OAuth", () => {
    const token = fakeJwt({ amr: [{ method: "otp", timestamp: 1 }] });
    assert.equal(accessTokenLooksLikePasswordRecovery(token), true);
  });

  it("rejects OAuth sessions", () => {
    const token = fakeJwt({ amr: [{ method: "oauth", provider: "google", timestamp: 1 }] });
    assert.equal(accessTokenLooksLikePasswordRecovery(token), false);
  });

  it("rejects password login AMR", () => {
    const token = fakeJwt({ amr: [{ method: "password", timestamp: 1 }] });
    assert.equal(accessTokenLooksLikePasswordRecovery(token), false);
  });
});

describe("resolvePostAuthDestination", () => {
  const otpToken = fakeJwt({ amr: [{ method: "otp", timestamp: 1 }] });

  it("honors forcedNext for recovery route", () => {
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: null,
        accessToken: otpToken,
        role: "diver",
        forcedNext: "/reset-password",
      }),
      "/reset-password",
    );
  });

  it("routes recovery type to reset-password", () => {
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: "recovery",
        accessToken: null,
        role: "diver",
      }),
      "/reset-password",
    );
  });

  it("rescues misrouted recovery when next defaulted to workspace", () => {
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: null,
        accessToken: otpToken,
        role: "diver",
      }),
      "/reset-password",
    );
  });

  it("keeps Google OAuth on workspace for divers", () => {
    const googleToken = fakeJwt({ amr: [{ method: "oauth", provider: "google", timestamp: 1 }] });
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: null,
        accessToken: googleToken,
        role: "diver",
      }),
      "/workspace",
    );
  });

  it("sends admins to dashboard unless resetting password", () => {
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: null,
        accessToken: fakeJwt({ amr: [{ method: "password", timestamp: 1 }] }),
        role: "admin",
      }),
      "/dashboard/admin",
    );
  });

  it("does not treat signup confirmation as recovery", () => {
    assert.equal(
      resolvePostAuthDestination({
        nextRaw: "/workspace",
        typeRaw: "signup",
        accessToken: otpToken,
        role: "diver",
      }),
      "/workspace",
    );
  });
});

describe("oauthForwardPath recovery", () => {
  it("sends homepage recovery codes to /auth/recovery with reset next", () => {
    const path = oauthForwardPath(
      "/",
      new URLSearchParams("code=abc&type=recovery"),
    );
    assert.equal(path, "/auth/recovery?code=abc&type=recovery&next=%2Freset-password");
  });

  it("still forwards ordinary OAuth to /auth/callback", () => {
    const path = oauthForwardPath("/", new URLSearchParams("code=96d76ae5-6f99-4bcf-b4f9-8b676f1f38de"));
    assert.equal(
      path,
      "/auth/callback?code=96d76ae5-6f99-4bcf-b4f9-8b676f1f38de&next=%2Fworkspace",
    );
  });

  it("does not loop on recovery route", () => {
    assert.equal(oauthForwardPath("/auth/recovery", new URLSearchParams("code=abc")), null);
  });
});

describe("password reset eligibility", () => {
  it("blocks Google-only accounts", () => {
    const user = {
      id: "1",
      identities: [{ provider: "google", id: "g" }],
      app_metadata: { provider: "google" },
    };
    assert.equal(userCanReceivePasswordResetEmail(user as never), false);
    assert.deepEqual(eligibilityFromAuthUser(user as never), { status: "google_only" });
  });

  it("allows email and linked Google", () => {
    const user = {
      id: "2",
      identities: [{ provider: "email", id: "e" }, { provider: "google", id: "g" }],
      app_metadata: { provider: "email" },
    };
    assert.equal(userCanReceivePasswordResetEmail(user as never), true);
  });
});

describe("decodeJwtPayload", () => {
  it("parses payload from fake token", () => {
    const token = fakeJwt({ sub: "user-1", amr: [] });
    assert.equal(decodeJwtPayload(token)?.sub, "user-1");
  });
});

describe("safeInternalPath", () => {
  it("keeps reset-password path", () => {
    assert.equal(safeInternalPath("/reset-password"), "/reset-password");
  });
});

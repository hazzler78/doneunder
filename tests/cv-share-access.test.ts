import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showsReferences } from "../lib/cv-access";
import {
  buildCvShareUrl,
  evaluateCvShareLinkRow,
  hashCvShareToken,
} from "../lib/cv-share-links";

describe("cv share access", () => {
  const diverId = "11111111-1111-4111-8111-111111111111";
  const otherDiver = "22222222-2222-4222-8222-222222222222";
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  it("accepts a valid unexpired unrevoked token for the matching diver", () => {
    assert.equal(
      evaluateCvShareLinkRow(
        { diver_id: diverId, expires_at: future, revoked_at: null },
        diverId,
      ),
      true,
    );
  });

  it("rejects expired, revoked, or wrong-diver tokens", () => {
    assert.equal(
      evaluateCvShareLinkRow(
        { diver_id: diverId, expires_at: past, revoked_at: null },
        diverId,
      ),
      false,
    );
    assert.equal(
      evaluateCvShareLinkRow(
        { diver_id: diverId, expires_at: future, revoked_at: new Date().toISOString() },
        diverId,
      ),
      false,
    );
    assert.equal(
      evaluateCvShareLinkRow(
        { diver_id: diverId, expires_at: future, revoked_at: null },
        otherDiver,
      ),
      false,
    );
    assert.equal(evaluateCvShareLinkRow(null, diverId), false);
  });

  it("builds share URLs with encoded query params", () => {
    const url = buildCvShareUrl("gareth", "abc+def/token");
    assert.match(url, /\/cv\/gareth\?share=/);
    assert.ok(url.includes(encodeURIComponent("abc+def/token")));
  });

  it("hashes tokens deterministically", () => {
    assert.equal(hashCvShareToken("test-token"), hashCvShareToken("test-token"));
    assert.notEqual(hashCvShareToken("a"), hashCvShareToken("b"));
  });

  it("hides references for share-link viewers", () => {
    assert.equal(showsReferences({ allowed: true, reason: "diver_shared" }), false);
    assert.equal(showsReferences({ allowed: true, reason: "active_company" }), false);
    assert.equal(showsReferences({ allowed: true, reason: "owner" }), true);
  });
});

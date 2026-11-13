import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificationsMentionedInNoExpiryMessage,
  messageClaimsTicketHasNoExpiry,
  replyClaimsLifetimeNoExpiryAlreadySaved,
} from "../lib/cert-lifetime-chat";

describe("cert lifetime chat pre-clear", () => {
  it("detects no-expiry claims", () => {
    assert.equal(messageClaimsTicketHasNoExpiry("My HSE Part 2 has no expiry"), true);
    assert.equal(messageClaimsTicketHasNoExpiry("My medical runs out in March 2027"), false);
  });

  it("matches named lifetime tickets in the message", () => {
    const hits = certificationsMentionedInNoExpiryMessage("My HSE Part 2 has no expiry", [
      { name: "HSE Part 2" },
      { name: "HSE Diver Medical" },
      { name: "BOSIET" },
    ]);
    assert.deepEqual(
      hits.map((cert) => cert.name),
      ["HSE Part 2"],
    );
  });

  it("flags misleading already-saved replies", () => {
    assert.equal(
      replyClaimsLifetimeNoExpiryAlreadySaved(
        "HSE Part 2 is already set as lifetime (no expiry) and confirmed. No update needed.",
      ),
      true,
    );
    assert.equal(
      replyClaimsLifetimeNoExpiryAlreadySaved("Cleared the stale expiry on HSE Part 2."),
      false,
    );
  });
});

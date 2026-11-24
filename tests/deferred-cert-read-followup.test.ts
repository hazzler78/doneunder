import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDeferredCertZeroReadMessage } from "../lib/deferred-cert-read-followup";

describe("buildDeferredCertZeroReadMessage", () => {
  it("asks for typed details and warns about matching", () => {
    const body = buildDeferredCertZeroReadMessage("Medical buceo .pdf");
    assert.match(body, /Medical buceo \.pdf/);
    assert.match(body, /certificate name/i);
    assert.match(body, /clearer scan/i);
    assert.match(body, /not count this file toward job matching/i);
  });

  it("points CV-shaped certificate uploads at the CV control when already misrouted", () => {
    const body = buildDeferredCertZeroReadMessage("Cv Diver Percio Salles.pdf", { cvMisroute: true });
    assert.match(body, /filename looks like.*CV/i);
    assert.match(body, /Seed CV/i);
    assert.doesNotMatch(body, /certificate name/i);
  });
});
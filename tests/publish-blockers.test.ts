import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAutoPublishSkippedMessage, formatManualPublishFailure } from "../lib/publish-blockers";

describe("publish blocker copy", () => {
  it("explains missing headline with a fix", () => {
    const text = formatManualPublishFailure({
      ok: false,
      errors: ["Headline is required. Add a Headline or Ambassador public headline, then save your profile."],
      warnings: [],
    });
    assert.match(text, /Headline/i);
    assert.match(text, /Hermes/i);
  });

  it("formats auto-publish validation failures as bullets", () => {
    const text = formatAutoPublishSkippedMessage({
      skippedReason: "validation_failed",
      validation: {
        ok: false,
        errors: ["Reference #1 (John) requires a phone number."],
        warnings: ["No certifications listed."],
      },
    });
    assert.match(text, /Could not auto-publish/i);
    assert.match(text, /•/);
    assert.match(text, /certifications/i);
  });
});

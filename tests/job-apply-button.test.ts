import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldShowJobApplyButton } from "../lib/jobs";
import { HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES } from "../lib/hermes-cert-eligibility";

describe("shouldShowJobApplyButton", () => {
  it("shows apply only when canApply is true and not yet applied", () => {
    assert.equal(shouldShowJobApplyButton({ canApply: true }), true);
    assert.equal(shouldShowJobApplyButton({ canApply: true, applied: true }), false);
    assert.equal(shouldShowJobApplyButton({ canApply: false }), false);
    assert.equal(shouldShowJobApplyButton({ canApply: false, applied: false }), false);
  });
});

describe("HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES", () => {
  it("tells Hermes not to rule on unseen documents", () => {
    assert.match(HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES, /certifications\[\]/i);
    assert.match(HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES, /Never declare an unseen/i);
    assert.match(HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES, /German G31/i);
    assert.match(HERMES_UNRECOGNIZED_MEDICAL_PROMPT_RULES, /confirm with the employer/i);
  });
});
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  berlinCalendarDay,
  isHelloPlatformFrom,
  normalizeEmail,
  parseSecondSendAllowlist,
} from "../lib/hello-email-guard";

describe("hello email guard helpers", () => {
  it("normalizes angled From headers and casing", () => {
    assert.equal(normalizeEmail("Hermes <Hello@DoneUnder.ai>"), "hello@doneunder.ai");
    assert.equal(normalizeEmail("  post@rovogdykk.no "), "post@rovogdykk.no");
  });

  it("detects hello@ platform From headers", () => {
    assert.equal(isHelloPlatformFrom("Hermes <hello@doneunder.ai>"), true);
    assert.equal(
      isHelloPlatformFrom("Gareth via doneunder.ai <hello@doneunder.ai>"),
      true,
    );
    assert.equal(isHelloPlatformFrom("Gareth Middleton <gareth@doneunder.ai>"), false);
  });

  it("formats Europe/Berlin calendar days as YYYY-MM-DD", () => {
    assert.equal(berlinCalendarDay(new Date("2026-10-30T10:00:00.000Z")), "2026-10-30");
    // Summer (CEST, UTC+2): 22:30 UTC is already the next Berlin calendar day.
    assert.equal(berlinCalendarDay(new Date("2026-07-15T22:30:00.000Z")), "2026-07-16");
  });

  it("parses second-send allowlist for today or pinned dates", () => {
    const today = "2026-10-30";
    const set = parseSecondSendAllowlist(
      "post@rovogdykk.no, other@example.com:2026-10-31  Third@X.com:2026-10-30",
      today,
    );
    assert.equal(set.has("post@rovogdykk.no"), true);
    assert.equal(set.has("other@example.com"), false);
    assert.equal(set.has("third@x.com"), true);
  });
});

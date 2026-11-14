import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCertDateReviewMessage,
  certDateReviewAlreadyShown,
  CERT_DATE_REVIEW_SOURCE,
  formatCertExpiryForReview,
} from "../lib/cert-date-review-nudge";

describe("cert date review nudge", () => {
  const CLASS_II_SURFACE =
    "Class II Commercial Diver Surface Supply Diving Plant and Machinery Open Bell / Diving Stage Air Diver - 50msw";

  it("shows stored expiry when set even if the ticket name looks lifetime", () => {
    const frozen = new Date("2026-11-14T08:00:00.000Z");
    assert.equal(
      formatCertExpiryForReview(
        {
          name: CLASS_II_SURFACE,
          expiry_date: "2026-10-24",
          no_expiry: null,
        },
        frozen,
      ),
      "expired on 24 Oct 2026",
    );
    assert.equal(
      formatCertExpiryForReview(
        {
          name: CLASS_II_SURFACE,
          expiry_date: "2028-06-01",
          no_expiry: null,
        },
        frozen,
      ),
      "1 Jun 2028",
    );
  });

  it("shows no expiry for lifetime tickets regardless of stored date", () => {
    assert.equal(
      formatCertExpiryForReview({
        name: "HSE Part 2",
        expiry_date: "2028-12-31",
        no_expiry: true,
      }),
      "no expiry",
    );
    assert.equal(
      formatCertExpiryForReview(
        {
          name: "Offshore Diver Medical",
          expiry_date: "2027-06-15",
        },
        new Date("2026-11-14T08:00:00.000Z"),
      ),
      "15 Jun 2027",
    );
    assert.equal(
      formatCertExpiryForReview({
        name: "BOSIET",
        expiry_date: null,
      }),
      "not on file",
    );
  });

  it("builds a warm message listing each certificate", () => {
    const text = buildCertDateReviewMessage([
      { name: "HSE Part 2", no_expiry: true, expiry_date: "2030-12-31" },
      { name: "Offshore Diver Medical", expiry_date: "2027-06-15" },
    ]);
    assert.match(text, /Quick check on your tickets/);
    assert.match(text, /HSE Part 2 — no expiry/);
    assert.match(text, /Offshore Diver Medical — 15 Jun 2027/);
    assert.match(text, /reply here with the correct date/i);
    assert.match(text, /any language/i);
  });

  it("detects once-only from assistant metadata marker", () => {
    assert.equal(certDateReviewAlreadyShown([]), false);
    assert.equal(
      certDateReviewAlreadyShown([
        { role: "assistant", metadata: { source: "photo-nudge-after-publish" } },
        { role: "user", metadata: {} },
      ]),
      false,
    );
    assert.equal(
      certDateReviewAlreadyShown([{ role: "assistant", metadata: { source: CERT_DATE_REVIEW_SOURCE } }]),
      true,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCertificateDates } from "../lib/dates";

describe("certificate date extraction", () => {
  it("pulls issue and expiry from 'date expiry date' junk in issuing_body", () => {
    const dates = extractCertificateDates(
      "TRAUMA-TRAINING sl (IDM/026) / IMCA recognised DMT-122-09 (IDSA 2224) - 19-10-2024 expiry 19-10-2026",
    );
    assert.equal(dates.issue_date, "2024-10-19");
    assert.equal(dates.expiry_date, "2026-10-19");
  });

  it("handles medical note style dates", () => {
    const dates = extractCertificateDates(
      "Dr Mark Downs (UK Offshore Medicals) - Annual medical, 08-04-2026 expiry 29-04-2027",
    );
    assert.equal(dates.issue_date, "2026-04-08");
    assert.equal(dates.expiry_date, "2027-04-29");
  });
});

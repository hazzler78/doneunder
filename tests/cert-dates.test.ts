import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeCertificateDates, extractCertificateDates, formatCertificateDate, parseFlexibleDate, resolveCertificateDates, yearSpanInText } from "../lib/dates";
import { isTicketExpired } from "../lib/jobs";

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

  it("does not turn a bare year into 1 January", () => {
    assert.equal(parseFlexibleDate("2026"), null);
    assert.equal(parseFlexibleDate("19-10-2026"), "2026-10-19");
  });

  it("keeps a 2025–2027 range as issued 2025 and valid through 2027", () => {
    const span = yearSpanInText("Offshore Diver Medical 2025–2027");
    assert.equal(span?.issue_date, "2025-01-01");
    assert.equal(span?.expiry_date, "2027-12-31");
    const dates = resolveCertificateDates({
      name: "Offshore Diver Medical",
      context: "Offshore Diver Medical 2025-2027",
    });
    assert.equal(formatCertificateDate(dates.issue_date), "2025");
    assert.equal(formatCertificateDate(dates.expiry_date), "2027");
    assert.equal(describeCertificateDates(dates.issue_date, dates.expiry_date), "Years: 2025–2027");
  });

  it("shows a lone year as a year, not an expiry", () => {
    const dates = resolveCertificateDates({ name: "HSE SCUBA 2025" });
    assert.equal(dates.issue_date, "2025-01-01");
    assert.equal(dates.expiry_date, null);
    assert.equal(describeCertificateDates(null, "2025-12-31"), "Year: 2025");
    assert.equal(isTicketExpired("2025-12-31", new Date("2026-10-19T08:00:00.000Z")), false);
  });
});

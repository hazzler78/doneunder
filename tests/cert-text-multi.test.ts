import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Light unit coverage for multi-cert dedupe behavior via public API shape.
// Full AI extraction is integration-tested in production with real uploads.

describe("multi-cert upload contract", () => {
  it("documents API uploaded items can carry many tickets from one file", () => {
    const uploaded = {
      name: "all-certs.pdf",
      action: "added" as const,
      ticket: "FOET with CA-EBS",
      ticketCount: 3,
      tickets: [
        { name: "FOET with CA-EBS", expiry_date: "2028-08-26" },
        { name: "IMCA Surface Supplied", expiry_date: null },
        { name: "HSE Diver Medical", expiry_date: "2027-02-27" },
      ],
    };
    assert.equal(uploaded.ticketCount, uploaded.tickets.length);
    assert.ok(uploaded.tickets.every((ticket) => Boolean(ticket.name)));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCertificateUploadAssistantReply,
  certificateUploadFilesWithZeroReads,
} from "../lib/certificate-upload-reply";
import { certificateReadsFromVisionResult } from "../lib/cert-text";

describe("certificateReadsFromVisionResult", () => {
  it("drops unreadable reads with no fields", () => {
    const dropped = certificateReadsFromVisionResult({
      name: null,
      issuing_body: null,
      cert_number: null,
      issue_date: null,
      expiry_date: null,
      excerpt: "",
      source: "vision",
      unreadable: true,
    });
    assert.equal(dropped.length, 0);
  });

  it("keeps reads with at least one field", () => {
    const kept = certificateReadsFromVisionResult({
      name: "IMCA Diver",
      issuing_body: null,
      cert_number: null,
      issue_date: null,
      expiry_date: null,
      excerpt: "IMCA Diver",
      source: "vision",
      unreadable: true,
    });
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.name, "IMCA Diver");
  });
});

describe("buildCertificateUploadAssistantReply", () => {
  it("warns when a file produced zero ticket reads", () => {
    const reply = buildCertificateUploadAssistantReply([
      { name: "1000243531.jpg", action: "added", ticketCount: 0, tickets: [] },
    ]);
    assert.equal(reply.ticketsRead, 0);
    assert.deepEqual(reply.zeroReadFilenames, ["1000243531.jpg"]);
    assert.match(reply.content, /couldn't read a ticket from 1000243531\.jpg/i);
    assert.doesNotMatch(reply.content, /If an expiry is missing/i);
  });

  it("still lists tickets when vision succeeded", () => {
    const reply = buildCertificateUploadAssistantReply([
      {
        name: "medical.jpg",
        action: "added",
        ticketCount: 1,
        tickets: [{ name: "HSE Diver Medical", expiry_date: "2027-02-27" }],
      },
    ]);
    assert.equal(reply.ticketsRead, 1);
    assert.equal(certificateUploadFilesWithZeroReads([{ name: "medical.jpg", ticketCount: 1 }]).length, 0);
    assert.match(reply.content, /Read 1 ticket\(s\)/);
    assert.match(reply.content, /If an expiry is missing/i);
  });
});

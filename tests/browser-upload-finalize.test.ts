import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificateItemAfterFinalizeGatewayTimeout,
  FINALIZE_GATEWAY_TIMEOUT_MESSAGE,
  isFinalizeGatewayTimeout,
  readApiJson,
} from "../lib/browser-upload";
import {
  buildDeferredFinalizeUploadItem,
  DEFERRED_CERTIFICATE_READ_NOTE,
  pendingCertificatePackReport,
} from "../app/api/diver/documents/finalize/route";

describe("certificate finalize upload resilience", () => {
  it("treats gateway timeouts on finalize as stored-but-still-reading", () => {
    assert.equal(isFinalizeGatewayTimeout(504), true);
    assert.equal(isFinalizeGatewayTimeout(500), false);
    const item = certificateItemAfterFinalizeGatewayTimeout("Domenik.C.Inhelder.IMCA.pdf");
    assert.equal(item.name, "Domenik.C.Inhelder.IMCA.pdf");
    assert.equal(item.readReport?.complete, false);
    assert.deepEqual(item.readWarnings, [FINALIZE_GATEWAY_TIMEOUT_MESSAGE]);
  });

  it("parse non-json finalize 504 without raw gateway text in the error field", async () => {
    const response = new Response("An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT", {
      status: 504,
      headers: { "Content-Type": "text/plain" },
    });
    const data = await readApiJson(response);
    assert.match(String(data.error), /Upload failed \(504\)/);
    assert.doesNotMatch(String(data.error), /FUNCTION_INVOCATION_TIMEOUT/);
  });

  it("returns a deferred finalize payload shape while pack read runs in the background", () => {
    const report = pendingCertificatePackReport();
    assert.equal(report.complete, false);
    const item = buildDeferredFinalizeUploadItem({
      fileName: "pack.pdf",
      stored: {
        path: "diver-id/certs/imca-log.pdf",
        name: "imca-log.pdf",
        mimeType: "application/pdf",
        action: "added",
      },
    });
    assert.equal(item.ticketCount, 0);
    assert.equal(item.readReport.complete, false);
    assert.deepEqual(item.readWarnings, [DEFERRED_CERTIFICATE_READ_NOTE]);
  });
});

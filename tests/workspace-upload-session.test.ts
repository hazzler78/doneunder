import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unsupportedCertificateTypeMessage } from "../lib/certificate-file-type";
import { CV_PROCESS_TIMEOUT_MESSAGE, UPLOAD_TIMEOUT_MESSAGE, withDeadline } from "../lib/upload-deadline";
import {
  CERT_UPLOAD_STATUS,
  CV_PROCESSING_STATUS,
  beginWorkspaceUpload,
  processRequestText,
  runWorkspaceUploadSession,
  settleWorkspaceUpload,
} from "../lib/workspace-upload-session";

const extensionlessName = "Hermes Demo notes.";

describe("workspace upload session", () => {
  it("does not enter the processing state when every file is rejected", async () => {
    const rejected = unsupportedCertificateTypeMessage(extensionlessName, { missingExtension: true });
    const start = beginWorkspaceUpload({
      hasCv: false,
      cvError: null,
      cvName: null,
      certificates: [{ name: extensionlessName, error: rejected }],
    });

    assert.equal(start.blocked, true);
    assert.equal(start.phase, null);
    assert.equal(start.activeStatus, null);
    assert.match(start.error ?? "", /Stored 0 file\(s\)/);
    assert.match(start.error ?? "", /Hermes Demo notes\./);
    assert.match(start.error ?? "", /no file extension/);
    assert.match(start.error ?? "", /not a recognisable certificate type/);
    assert.equal(processRequestText({ cvName: null, certNames: [extensionlessName] }), null);
    assert.doesNotMatch(start.error ?? "", /Please process these files/);
    assert.notEqual(start.activeStatus, CV_PROCESSING_STATUS);

    let becameBusy = false;
    const { settlement } = await runWorkspaceUploadSession({
      start,
      onBusy: () => {
        becameBusy = true;
      },
      onIdle: () => {},
      work: async () => {
        throw new Error("rejected files must not be uploaded");
      },
    });

    assert.equal(becameBusy, false);
    assert.equal(settlement.uploading, false);
    assert.equal(settlement.activeStatus, null);
    assert.equal(settlement.announcedProcess, false);
    assert.match(settlement.agentError ?? "", /Stored 0 file\(s\)/);
  });

  it("resets uploading and skips reload when the server stores zero files", async () => {
    const start = beginWorkspaceUpload({
      hasCv: false,
      cvError: null,
      cvName: null,
      certificates: [{ name: "ticket.pdf", error: null }],
    });
    assert.equal(start.blocked, false);
    assert.equal(start.activeStatus, CERT_UPLOAD_STATUS);

    let busy = false;
    let reloaded = false;
    const { settlement } = await runWorkspaceUploadSession({
      start,
      onBusy: () => {
        busy = true;
      },
      onIdle: () => {
        busy = false;
      },
      reload: async () => {
        reloaded = true;
      },
      work: async () => ({
        cvStored: false,
        cvProcessed: false,
        storedCertCount: 0,
        failures: ["ticket.pdf: storage unavailable"],
      }),
    });

    assert.equal(busy, false);
    assert.equal(reloaded, false);
    assert.equal(settlement.uploading, false);
    assert.equal(settlement.phase, null);
    assert.equal(settlement.announcedProcess, false);
    assert.equal(settlement.cvUpdatedLabel, null);
    assert.match(settlement.error ?? "", /Stored 0 file\(s\)/);
    assert.match(settlement.error ?? "", /storage unavailable/);
  });

  it("surfaces a server error and leaves the busy flag cleared", () => {
    const settlement = settleWorkspaceUpload({
      cvStored: false,
      cvProcessed: false,
      storedCertCount: 0,
      failures: [],
      requestFailed: true,
      requestError: "Could not process the CV. Try again in a moment.",
    });
    assert.equal(settlement.uploading, false);
    assert.equal(settlement.activeStatus, null);
    assert.equal(settlement.announcedProcess, false);
    assert.equal(settlement.reloadAfterIdle, false);
    assert.equal(settlement.agentError, "Could not process the CV. Try again in a moment.");
  });

  it("surfaces a CV processing timeout without keeping the uploading state", () => {
    const settlement = settleWorkspaceUpload({
      cvStored: true,
      cvProcessed: false,
      cvName: "diver-cv.pdf",
      storedCertCount: 0,
      failures: [],
      timedOut: true,
      requestError: CV_PROCESS_TIMEOUT_MESSAGE,
    });
    assert.equal(settlement.uploading, false);
    assert.equal(settlement.activeStatus, null);
    assert.match(settlement.error ?? "", /Processing your CV timed out/);
    assert.equal(settlement.announcedProcess, true);
    assert.equal(
      processRequestText({ cvName: "diver-cv.pdf", certNames: [] }),
      "Please process this CV PDF: diver-cv.pdf",
    );
  });

  it("clears uploading before a follow-up reload that never resolves", async () => {
    const events: string[] = [];
    let release = () => {};
    const hung = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = beginWorkspaceUpload({
      hasCv: true,
      cvError: null,
      cvName: "diver-cv.pdf",
      certificates: [],
    });
    assert.equal(start.activeStatus, CV_PROCESSING_STATUS);

    const pending = runWorkspaceUploadSession({
      start,
      onBusy: () => events.push("busy"),
      onIdle: () => events.push("idle"),
      onSettled: () => events.push("settled"),
      reload: () =>
        hung.then(() => {
          events.push("reloaded");
        }),
      work: async () => ({
        cvStored: true,
        cvProcessed: true,
        cvName: "diver-cv.pdf",
        storedCertCount: 0,
        failures: [],
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(events, ["busy", "idle", "settled"]);
    release();
    await pending;
    assert.deepEqual(events, ["busy", "idle", "settled", "reloaded"]);
  });

  it("clears uploading when the upload request throws", async () => {
    const events: string[] = [];
    const start = beginWorkspaceUpload({
      hasCv: true,
      cvError: null,
      cvName: "diver-cv.pdf",
      certificates: [],
    });
    await assert.rejects(
      runWorkspaceUploadSession({
        start,
        onBusy: () => events.push("busy"),
        onIdle: () => events.push("idle"),
        reload: async () => {
          events.push("reloaded");
        },
        work: async () => {
          throw new Error(CV_PROCESS_TIMEOUT_MESSAGE);
        },
      }),
      /timed out/,
    );
    assert.deepEqual(events, ["busy", "idle"]);
  });
});

describe("upload deadlines", () => {
  it("rejects a hung CV process with a clear timeout", async () => {
    await assert.rejects(
      withDeadline(new Promise(() => {}), 20, CV_PROCESS_TIMEOUT_MESSAGE),
      (error: unknown) => error instanceof Error && error.message === CV_PROCESS_TIMEOUT_MESSAGE,
    );
  });

  it("resolves when the work finishes first", async () => {
    assert.equal(await withDeadline(Promise.resolve("stored"), 50), "stored");
  });

  it("handles a late rejection so it is not unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown) => {
      unhandled.push(error);
    };
    process.on("unhandledRejection", onUnhandled);
    try {
      let rejectLate: (error: Error) => void = () => {};
      const late = new Promise<string>((_, reject) => {
        rejectLate = reject;
      });
      await assert.rejects(withDeadline(late, 20, UPLOAD_TIMEOUT_MESSAGE), /timed out/);
      rejectLate(new Error("late failure"));
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.deepEqual(unhandled, []);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

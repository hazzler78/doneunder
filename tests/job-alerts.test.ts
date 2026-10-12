import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatJobAlertEmail,
  formatJobAlertHermesMessage,
  isJobAlertable,
} from "../lib/job-alerts";
import { JOB_CATALOG } from "../lib/job-catalog";
import { isPublishNudgeSkipped } from "../lib/publish-nudge-skip";

describe("job alert gating", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");

  it("does not alert catalog jobs without postedAt", () => {
    for (const job of JOB_CATALOG) {
      assert.equal(isJobAlertable(job, now), false, job.id);
    }
  });

  it("alerts an open job posted recently", () => {
    assert.equal(
      isJobAlertable(
        {
          status: "open",
          closesAt: "2026-10-20T17:00:00.000Z",
          postedAt: "2026-10-11T08:00:00.000Z",
        },
        now,
      ),
      true,
    );
  });

  it("skips closed or filled jobs even with postedAt", () => {
    assert.equal(
      isJobAlertable(
        {
          status: "open",
          closesAt: "2026-10-01T00:00:00.000Z",
          postedAt: "2026-10-11T08:00:00.000Z",
        },
        now,
      ),
      false,
    );
    assert.equal(
      isJobAlertable(
        {
          status: "filled",
          closesAt: "2026-10-20T17:00:00.000Z",
          postedAt: "2026-10-11T08:00:00.000Z",
        },
        now,
      ),
      false,
    );
  });

  it("skips jobs older than the max age window", () => {
    assert.equal(
      isJobAlertable(
        {
          status: "open",
          closesAt: "2026-11-01T00:00:00.000Z",
          postedAt: "2026-09-01T08:00:00.000Z",
        },
        now,
        14 * 24 * 60 * 60 * 1000,
      ),
      false,
    );
  });
});

describe("job alert copy", () => {
  it("formats a plain-text email with match link", () => {
    const { subject, text } = formatJobAlertEmail({
      fullName: "Imanol Ruiz",
      username: "imanol",
      job: {
        id: "job-demo-2026-10",
        title: "Air divers — North Sea IRM",
        location: "Northern North Sea",
        scope: "offshore",
        mobilization: "72 hours",
        requiredCerts: ["IMCA", "BOSIET"],
        closesAt: "2026-10-18T17:00:00.000Z",
      },
    });
    assert.match(subject, /Air divers/);
    assert.match(text, /Hi Imanol/);
    assert.match(text, /workspace\?job=job-demo-2026-10/);
    assert.match(text, /IMCA, BOSIET/);
    assert.match(text, /Hermes/);
  });

  it("formats a short Hermes chat line with job id", () => {
    const msg = formatJobAlertHermesMessage({
      id: "job-demo-2026-10",
      title: "Air divers — North Sea IRM",
      location: "Northern North Sea",
      scope: "offshore",
    });
    assert.match(msg, /Air divers/);
    assert.match(msg, /job-demo-2026-10/);
    assert.match(msg, /match/i);
  });
});

describe("job alert skip list reuse", () => {
  it("reuses the publish-nudge unsubscribe list", () => {
    assert.equal(isPublishNudgeSkipped({ email: "jsh.even@gmail.com" }), true);
    assert.equal(isPublishNudgeSkipped({ username: "mikael" }), true);
  });
});

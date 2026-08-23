import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOB_CATALOG } from "../lib/job-catalog";
import { daysUntilClose, isJobOpen, listCatalogJobs, matchPromptForJob, scoreDiverAgainstJob } from "../lib/jobs";

describe("job expiry", () => {
  it("hides a listing after closesAt", () => {
    const job = {
      status: "open" as const,
      closesAt: "2026-08-01T00:00:00.000Z",
    };
    assert.equal(isJobOpen(job, new Date("2026-08-23T12:00:00.000Z")), false);
  });

  it("keeps a listing that has not closed", () => {
    const job = {
      status: "open" as const,
      closesAt: "2026-10-18T17:00:00.000Z",
    };
    assert.equal(isJobOpen(job, new Date("2026-08-23T12:00:00.000Z")), true);
  });

  it("does not show filled jobs even if the date is still open", () => {
    assert.equal(
      isJobOpen({ status: "filled", closesAt: "2026-12-01T00:00:00.000Z" }, new Date("2026-08-23")),
      false,
    );
  });

  it("lists only live catalog campaigns", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const jobs = listCatalogJobs(now);
    assert.ok(jobs.length >= 3);
    assert.ok(jobs.every((job) => isJobOpen(job, now)));
    const days = daysUntilClose(jobs[0]!.closesAt, now);
    assert.ok(days === null || days > 0);
  });

  it("scores a diver against a campaign without inventing tickets", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-dsv-dmt-2026-10");
    assert.ok(job);
    const match = scoreDiverAgainstJob(job, {
      certNames: ["IMCA Trainee Air Diving Supervisor", "OPITO BOSIET with HUET"],
      location: "Malmo, Sweden",
    });
    assert.equal(match.verdict, "possible");
    assert.ok(match.have.includes("IMCA"));
    assert.ok(match.missing.includes("DMT"));
    assert.ok(matchPromptForJob(job).includes(job.id));
    assert.ok(matchPromptForJob(job).includes("match_job"));
  });
});

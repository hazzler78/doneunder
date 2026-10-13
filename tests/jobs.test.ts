import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOB_CATALOG } from "../lib/job-catalog";
import {
  applicationDraft,
  applyAddressForJob,
  applyBlockReason,
  daysUntilClose,
  formatMatchReason,
  hasApplyInbox,
  isJobOpen,
  isTicketExpired,
  listCatalogJobs,
  applyPromptForJob,
  matchPromptForJob,
  resolveJobRef,
  scoreDiverAgainstJob,
} from "../lib/jobs";

describe("job expiry", () => {
  it("hides a listing after closesAt", () => {
    const job = {
      status: "open" as const,
      closesAt: "2026-08-01T00:00:00.000Z",
      applyEmail: "crew@contractor.test",
    };
    assert.equal(isJobOpen(job, new Date("2026-08-23T12:00:00.000Z")), false);
  });

  it("keeps a listing that has not closed", () => {
    const job = {
      status: "open" as const,
      closesAt: "2026-10-18T17:00:00.000Z",
      applyEmail: "crew@contractor.test",
    };
    assert.equal(isJobOpen(job, new Date("2026-08-23T12:00:00.000Z")), true);
  });

  it("does not show filled jobs even if the date is still open", () => {
    assert.equal(
      isJobOpen(
        { status: "filled", closesAt: "2026-12-01T00:00:00.000Z", applyEmail: "crew@contractor.test" },
        new Date("2026-08-23"),
      ),
      false,
    );
  });

  it("hides campaigns without a contractor inbox", () => {
    assert.equal(
      isJobOpen(
        { status: "open", closesAt: "2026-12-01T00:00:00.000Z", applyEmail: null },
        new Date("2026-10-13"),
      ),
      false,
    );
    assert.equal(hasApplyInbox({ applyEmail: null }), false);
    assert.equal(hasApplyInbox({ applyEmail: "bewerbung@baltic-taucher.de" }), true);
  });

  it("lists only live catalog campaigns with apply emails", () => {
    const now = new Date("2026-10-13T12:00:00.000Z");
    const jobs = listCatalogJobs(now);
    assert.ok(jobs.length >= 2);
    assert.ok(jobs.every((job) => isJobOpen(job, now)));
    assert.ok(jobs.every((job) => hasApplyInbox(job)));
    const days = daysUntilClose(jobs[0]!.closesAt, now);
    assert.ok(days === null || days > 0);
  });

  it("scores a diver against a campaign without inventing tickets", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-baltic-taucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(job, {
      certNames: ["IMCA Trainee Air Diving Supervisor"],
      location: "Malmo, Sweden",
    });
    assert.equal(match.verdict, "possible");
    assert.ok(match.have.includes("IMCA"));
    assert.ok(match.missing.includes("HSE Diver Medical"));
    assert.equal(match.canApply, false);
    assert.ok(matchPromptForJob(job).includes(job.id));
    assert.ok(matchPromptForJob(job).includes("match_job"));
    assert.ok(applyPromptForJob(job).includes(`job_id="${job.id}"`));
    assert.ok(applyPromptForJob(job).includes("confirmed=true"));
  });

  it("resolves a campaign from a title fragment so Hermes need not ask for an id", () => {
    const jobs = listCatalogJobs(new Date("2026-10-13T12:00:00.000Z"));
    const baltic = resolveJobRef(jobs, "baltic taucher");
    assert.equal(baltic?.id, "job-baltic-taucher-2026-11");
    const byId = resolveJobRef(jobs, "job-nordseetaucher-2026-11");
    assert.equal(byId?.title.includes("NORDSEETAUCHER"), true);
  });

  it("treats an expired required ticket as expired, not current", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nordseetaucher-2026-11");
    assert.ok(job);
    const now = new Date("2026-10-13T12:00:00.000Z");
    assert.equal(isTicketExpired("2025-03-01", now), true);
    assert.equal(isTicketExpired("2026-10-13", now), false);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "IMCA Air Diver", expiryDate: "2028-01-01" },
          { name: "HSE Diver Medical", expiryDate: "2025-01-10" },
        ],
        location: "Bremerhaven",
      },
      now,
    );
    assert.ok(match.have.includes("IMCA"));
    assert.ok(match.expired.includes("HSE Diver Medical"));
    assert.ok(!match.have.includes("HSE Diver Medical"));
    assert.equal(match.verdict, "possible");
    assert.equal(match.canApply, false);
    assert.match(applyBlockReason(match, job) ?? "", /HSE Diver Medical/);
    assert.match(formatMatchReason(match), /Expired: HSE Diver Medical/);
  });

  it("blocks apply when a required ticket is missing", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-baltic-taucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(job, {
      certs: [{ name: "IMCA Air Diver", expiryDate: "2028-01-01" }],
    });
    assert.ok(match.missing.includes("HSE Diver Medical"));
    assert.equal(match.canApply, false);
  });

  it("allows apply when every required ticket is current", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-baltic-taucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "IMCA Air Diver", expiryDate: "2028-01-01" },
          { name: "HSE Diver Medical", expiryDate: "2027-02-01" },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.equal(match.verdict, "strong");
    assert.equal(match.expired.length, 0);
    assert.equal(match.missing.length, 0);
    assert.equal(match.canApply, true);
    assert.equal(applyBlockReason(match, job), null);
  });

  it("sends apply only to the verified company inbox", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-baltic-taucher-2026-11");
    assert.ok(job);
    assert.equal(applyAddressForJob(job), "bewerbung@baltic-taucher.de");
    const draft = applicationDraft(job, "Gareth Darrin Middleton");
    assert.equal(draft.to, "bewerbung@baltic-taucher.de");
    assert.ok(draft.subject.includes(job.title));
    assert.equal(draft.attachCv, true);
    assert.equal(draft.attachCertificates, true);
    assert.equal(applyAddressForJob({ applyEmail: "crew@contractor.test" }), "crew@contractor.test");
    assert.equal(applyAddressForJob({ applyEmail: null }), null);
  });
});

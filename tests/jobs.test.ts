import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOB_CATALOG } from "../lib/job-catalog";
import {
  applicationDraft,
  applyAddressForJob,
  applyBlockReason,
  daysUntilClose,
  formatMatchReason,
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
    assert.equal(match.canApply, false);
    assert.ok(matchPromptForJob(job).includes(job.id));
    assert.ok(matchPromptForJob(job).includes("match_job"));
    assert.ok(applyPromptForJob(job).includes(`job_id="${job.id}"`));
    assert.ok(applyPromptForJob(job).includes("confirmed=true"));
  });

  it("resolves a campaign from a title fragment so Hermes need not ask for an id", () => {
    const jobs = listCatalogJobs(new Date("2026-08-23T12:00:00.000Z"));
    const sat = resolveJobRef(jobs, "saturation");
    assert.equal(sat?.id, "job-ncs-sat-2026-09");
    const byId = resolveJobRef(jobs, "job-wind-gbf-2026-10");
    assert.equal(byId?.title.includes("offshore wind"), true);
  });

  it("treats an expired required ticket as expired, not current", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nsea-irm-2026-09");
    assert.ok(job);
    const now = new Date("2026-08-23T12:00:00.000Z");
    assert.equal(isTicketExpired("2025-03-01", now), true);
    assert.equal(isTicketExpired("2026-08-23", now), false);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "IMCA Air Diver", expiryDate: "2028-01-01" },
          { name: "OPITO BOSIET", expiryDate: "2025-01-10" },
          { name: "OEUK Medical", expiryDate: "2027-02-01" },
        ],
        location: "Aberdeen",
      },
      now,
    );
    assert.ok(match.have.includes("IMCA"));
    assert.ok(match.have.includes("OEUK Medical"));
    assert.ok(match.expired.includes("BOSIET"));
    assert.ok(!match.have.includes("BOSIET"));
    assert.equal(match.verdict, "possible");
    assert.equal(match.canApply, false);
    assert.match(applyBlockReason(match) ?? "", /BOSIET/);
    assert.match(formatMatchReason(match), /Expired: BOSIET/);
  });

  it("blocks apply when a required ticket is missing", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nsea-irm-2026-09");
    assert.ok(job);
    const match = scoreDiverAgainstJob(job, {
      certs: [
        { name: "IMCA Air Diver", expiryDate: "2028-01-01" },
        { name: "OPITO BOSIET", expiryDate: "2028-01-01" },
      ],
    });
    assert.ok(match.missing.includes("OEUK Medical"));
    assert.equal(match.canApply, false);
  });

  it("allows apply when every required ticket is current", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nsea-irm-2026-09");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "IMCA Air Diver", expiryDate: "2028-01-01" },
          { name: "OPITO BOSIET", expiryDate: "2028-01-01" },
          { name: "OEUK Medical", expiryDate: "2027-02-01" },
        ],
      },
      new Date("2026-08-23T12:00:00.000Z"),
    );
    assert.equal(match.verdict, "strong");
    assert.equal(match.expired.length, 0);
    assert.equal(match.missing.length, 0);
    assert.equal(match.canApply, true);
    assert.equal(applyBlockReason(match), null);
  });

  it("applies via hello@doneunder.ai until a company gives an inbox", () => {
    const job = JOB_CATALOG[0]!;
    assert.equal(applyAddressForJob(job), "hello@doneunder.ai");
    const draft = applicationDraft(job, "Gareth Darrin Middleton");
    assert.equal(draft.to, "hello@doneunder.ai");
    assert.ok(draft.subject.includes(job.title));
    assert.equal(draft.attachCv, true);
    assert.equal(draft.attachCertificates, true);
    assert.equal(applyAddressForJob({ applyEmail: "crew@contractor.test" }), "crew@contractor.test");
  });
});

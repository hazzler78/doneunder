import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketSatisfiesRequirement } from "../lib/ticket-match";
import { JOB_CATALOG } from "../lib/job-catalog";
import { scoreDiverAgainstJob } from "../lib/jobs";

describe("ticketSatisfiesRequirement", () => {
  it("treats HSE Surface Supplied Top Up as IMCA competence", () => {
    assert.equal(ticketSatisfiesRequirement("IMCA", "Surface Supplied (Top Up)"), true);
    assert.equal(ticketSatisfiesRequirement("IMCA", "IMCA Surface Supplied (Top Up)"), true);
    assert.equal(ticketSatisfiesRequirement("IMCA", { name: "Surface Supplied Diver", issuingBody: "HSE" }), true);
  });

  it("does not let a medical ticket satisfy IMCA", () => {
    assert.equal(
      ticketSatisfiesRequirement("IMCA", "IMCA / HSE Diver Medical Fitness Certificate"),
      false,
    );
  });

  it("maps medical aliases both ways", () => {
    assert.equal(
      ticketSatisfiesRequirement("HSE Diver Medical", "IMCA / HSE Diver Medical Fitness Certificate"),
      true,
    );
    assert.equal(ticketSatisfiesRequirement("OEUK Medical", "OEUK Offshore Medical"), true);
    assert.equal(ticketSatisfiesRequirement("OEUK Medical", "OGUK Medical"), true);
    assert.equal(ticketSatisfiesRequirement("HSE Diver Medical", "Surface Supplied (Top Up)"), false);
  });

  it("treats FOET as BOSIET", () => {
    assert.equal(ticketSatisfiesRequirement("BOSIET", "OPITO FOET with CA-EBS"), true);
    assert.equal(ticketSatisfiesRequirement("BOSIET", "OPITO BOSIET with HUET"), true);
  });

  it("matches DMT labels", () => {
    assert.equal(ticketSatisfiesRequirement("DMT", "Diver Medic Technician"), true);
    assert.equal(ticketSatisfiesRequirement("DMT", "DMT Appraisal"), true);
  });

  it("does not treat bare SCUBA as IMCA", () => {
    assert.equal(ticketSatisfiesRequirement("IMCA", "SCUBA"), false);
  });

  it("does not treat a job title as an IMCA certificate", () => {
    assert.equal(ticketSatisfiesRequirement("IMCA", "Commercial Diver"), false);
    assert.equal(ticketSatisfiesRequirement("IMCA", "Air Diver"), false);
    assert.equal(ticketSatisfiesRequirement("IMCA", "Saturation Diver"), false);
  });
});

describe("scoreDiverAgainstJob with aliases", () => {
  it("lets Fernando-style pack apply to Baltic Taucher", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-baltic-taucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "IMCA / HSE Diver Medical Fitness Certificate", expiryDate: "2027-02-27" },
          { name: "IMCA Surface Supplied (Top Up)", expiryDate: null },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.deepEqual(match.missing, []);
    assert.equal(match.canApply, true);
    assert.ok(match.have.includes("IMCA"));
    assert.ok(match.have.includes("HSE Diver Medical"));
  });

  it("lets Top Up + medical clear Nordseetaucher", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nordseetaucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "Surface Supplied (Top Up)", expiryDate: null, issuingBody: "HSE" },
          { name: "HSE Diver Medical", expiryDate: "2027-01-01" },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.deepEqual(match.missing, []);
    assert.equal(match.canApply, true);
  });
});

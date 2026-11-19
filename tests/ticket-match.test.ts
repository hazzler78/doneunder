import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketNeedsMedicalReview, ticketSatisfiesRequirement } from "../lib/ticket-match";
import { JOB_CATALOG } from "../lib/job-catalog";
import { formatMatchReason, scoreDiverAgainstJob } from "../lib/jobs";

describe("ticketSatisfiesRequirement", () => {
  it("treats HSE Surface Supplied Top Up as IMCA competence", () => {
    assert.equal(ticketSatisfiesRequirement("IMCA", "Surface Supplied (Top Up)"), true);
    assert.equal(ticketSatisfiesRequirement("IMCA", "IMCA Surface Supplied (Top Up)"), true);
    assert.equal(ticketSatisfiesRequirement("IMCA", { name: "Surface Supplied Diver", issuingBody: "HSE" }), true);
  });

  it("treats IHK geprüfter Taucher requirement as IMCA/HSE diver competence", () => {
    assert.equal(ticketSatisfiesRequirement("IHK Geprüfter Taucher", "Geprüfter Taucher (IHK)"), true);
    assert.equal(ticketSatisfiesRequirement("IHK Geprüfter Taucher (or equivalent)", "Surface Supplied (Top Up)"), true);
    assert.equal(ticketSatisfiesRequirement("IHK Geprüfter Taucher", "Medical buceo"), false);
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

  it("rejects generic foreign hospital medicals for HSE and G31", () => {
    assert.equal(ticketSatisfiesRequirement("HSE Diver Medical", "Medical buceo"), false);
    assert.equal(ticketSatisfiesRequirement("G31 Tauchtauglichkeit", "Medical buceo"), false);
    assert.equal(ticketSatisfiesRequirement("G31 Tauchtauglichkeit", "G31 Tauchmedizin"), true);
    assert.equal(ticketSatisfiesRequirement("Tauchtauglichkeit", "Nachweis Tauchtauglichkeit G31"), true);
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

  it("counts Offshore Diver Medical as the diver medical", () => {
    assert.equal(ticketSatisfiesRequirement("HSE Diver Medical", "Offshore Diver Medical"), true);
    assert.equal(ticketSatisfiesRequirement("IMCA", "Offshore Diver Medical"), false);
  });

  it("flags ambiguous medicals for review", () => {
    assert.equal(ticketNeedsMedicalReview("G31 Tauchtauglichkeit", "Medical buceo"), true);
    assert.equal(ticketNeedsMedicalReview("HSE Diver Medical", "Medical buceo"), true);
    assert.equal(ticketNeedsMedicalReview("HSE Diver Medical", "HSE Diver Medical"), false);
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
          { name: "G31 Tauchtauglichkeit", expiryDate: "2027-02-27" },
          { name: "Geprüfter Taucher (IHK)", expiryDate: null },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.deepEqual(match.missing, []);
    assert.equal(match.canApply, true);
    assert.ok(match.have.includes("IHK Geprüfter Taucher"));
    assert.ok(match.have.includes("Tauchtauglichkeit"));
  });

  it("lets Top Up + G31 clear Nordseetaucher", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nordseetaucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "Surface Supplied (Top Up)", expiryDate: null, issuingBody: "HSE" },
          { name: "G31 — fit for diving", expiryDate: "2027-01-01" },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.deepEqual(match.missing, []);
    assert.equal(match.canApply, true);
  });

  it("needs review when only a loose foreign medical is on file", () => {
    const job = JOB_CATALOG.find((item) => item.id === "job-nordseetaucher-2026-11");
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "Surface Supplied (Top Up)", expiryDate: null, issuingBody: "HSE" },
          { name: "Medical buceo", expiryDate: "2027-01-01" },
        ],
      },
      new Date("2026-10-13T12:00:00.000Z"),
    );
    assert.ok(match.needsReview.includes("G31 Tauchtauglichkeit"));
    assert.equal(match.canApply, false);
    assert.match(formatMatchReason(match), /Needs review/i);
  });
});
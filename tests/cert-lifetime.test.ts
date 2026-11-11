import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificateNeedsExpiryDate,
  checkCertificateDates,
  isLifetimeCertificate,
  isLifetimeTicketType,
} from "../lib/cert-lifetime";
import { mergeDefinedCertificationPatch } from "../lib/certification-profile-utils";
import { validateDiverProfile } from "../lib/diver-profile-service";
import { JOB_CATALOG } from "../lib/job-catalog";
import { formatMatchReason, scoreDiverAgainstJob } from "../lib/jobs";

describe("lifetime ticket types (aligned with du_match/match.py + Danish)", () => {
  const lifetime: Array<[string, string?]> = [
    ["HSE Part 1 Surface Supplied Diver"],
    ["HSE SCUBA"],
    ["IMCA Surface Supplied (Top Up)"],
    ["IMCA Diver"],
    ["IMCA Closed Bell Diver"],
    ["Wet Bell Diver"],
    ["ADAS Part 3"],
    ["IDSA Level 2"],
    ["Assistant Life Support Technician (ALST)"],
    ["Air Diving Supervisor"],
    ["Trainee Air Diving Supervisor"],
    ["Surface Oriented Diver", "Petroleum Safety Authority Norway"],
    ["Norwegian Class B Diver Certificate"],
    ["Klasse B dykkersertifikat"],
    ["Danish Commercial Diver Certificate"],
    ["Erhvervsdykkercertifikat", "Søfartsstyrelsen"],
    ["Commercial Diver", "Arbejdstilsynet Denmark"],
    ["Dutch B4 Diver (Duikarbeid)"],
    ["Swedish Certificate of Diving Competence"],
    ["Certificat d'aptitude à l'hyperbarie (CAH) Classe II mention B"],
    ["Underwater Welder-Diver EN ISO 15618-1"],
    ["Chamber Operator"],
    ["Driving licence B"],
  ];
  for (const [name, issuer] of lifetime) {
    it(`treats "${name}" as lifetime`, () => {
      assert.equal(isLifetimeTicketType({ name, issuing_body: issuer }), true);
      assert.equal(certificateNeedsExpiryDate({ name, issuing_body: issuer, expiry_date: null }), false);
    });
  }

  const expiring: Array<[string, string?]> = [
    ["HSE Diver Medical"],
    ["Offshore Diver Medical", "IMCA"],
    ["OEUK Medical"],
    ["Danish Diver Medical"],
    ["OPITO BOSIET with CA-EBS"],
    ["OPITO FOET"],
    ["HUET"],
    ["Diver Medic Technician (DMT)"],
    ["IMCA DMT"],
    ["GWO Basic Safety Training"],
    ["H2S Awareness"],
    ["CSWIP 3.1U"],
    ["STCW Basic Safety"],
    ["First Aid at Work"],
  ];
  for (const [name, issuer] of expiring) {
    it(`requires an expiry for "${name}"`, () => {
      assert.equal(isLifetimeTicketType({ name, issuing_body: issuer }), false);
      assert.equal(certificateNeedsExpiryDate({ name, issuing_body: issuer, expiry_date: null }), true);
      assert.equal(certificateNeedsExpiryDate({ name, issuing_body: issuer, expiry_date: "2027-01-01" }), false);
    });
  }

  it("does not count a bare country as a lifetime approval", () => {
    assert.equal(isLifetimeTicketType({ name: "Course certificate", issuing_body: "Denmark" }), false);
    assert.equal(isLifetimeTicketType({ name: "Certification", issuing_body: "Norway" }), false);
  });

  it("lets the explicit no_expiry flag win over the name rule", () => {
    assert.equal(isLifetimeCertificate({ name: "Company induction", no_expiry: true }), true);
    assert.equal(certificateNeedsExpiryDate({ name: "Company induction", no_expiry: true }), false);
    assert.equal(isLifetimeCertificate({ name: "IMCA Diver", no_expiry: false }), false);
    assert.equal(certificateNeedsExpiryDate({ name: "IMCA Diver", no_expiry: false }), true);
  });
});

describe("expiry before issue date", () => {
  it("drops an expiry earlier than the issue date and explains why", () => {
    const check = checkCertificateDates({
      name: "HSE Diver Medical",
      issue_date: "2026-05-31",
      expiry_date: "2022-08-12",
    });
    assert.equal(check.expiry_date, null);
    assert.equal(check.rejected_expiry_date, "2022-08-12");
    assert.match(check.warning ?? "", /before issue/);
  });

  it("keeps normal dates", () => {
    const check = checkCertificateDates({ issue_date: "2026-05-31", expiry_date: "2027-05-30" });
    assert.equal(check.expiry_date, "2027-05-30");
    assert.equal(check.warning, null);
  });

  it("does not store an impossible expiry through an update patch", () => {
    const merged = mergeDefinedCertificationPatch(
      { name: "HSE Diver Medical", issue_date: "2026-05-31", expiry_date: undefined },
      { expiry_date: "2022-08-12" },
    );
    assert.equal(merged.expiry_date, undefined);
  });

  it("does not call a ticket expired when its expiry is before its issue date", () => {
    const job = JOB_CATALOG.find((item) => item.requiredCerts.some((cert) => /medical/i.test(cert)));
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "HSE Diver Medical", issueDate: "2026-05-31", expiryDate: "2022-08-12" },
          { name: "IMCA Surface Supplied (Top Up)", issuingBody: "HSE" },
          { name: "OPITO BOSIET", expiryDate: "2028-01-01" },
          { name: "OPITO FOET", expiryDate: "2028-01-01" },
        ],
      },
      new Date("2026-11-11T10:00:00Z"),
    );
    const medicalLabel = job.requiredCerts.find((cert) => /medical/i.test(cert))!;
    assert.equal(match.expired.includes(medicalLabel), false);
    assert.ok(match.unknownExpiry.includes(medicalLabel));
  });
});

describe("job matching and profile validation with lifetime tickets", () => {
  it("does not say 'No expiry on file' for a lifetime IMCA/HSE ticket", () => {
    const job = JOB_CATALOG.find((item) => item.requiredCerts.includes("IMCA"));
    assert.ok(job);
    const match = scoreDiverAgainstJob(
      job,
      {
        certs: [
          { name: "HSE Part 1 Surface Supplied", issuingBody: "HSE", expiryDate: null },
          { name: "HSE Diver Medical", expiryDate: "2027-04-29" },
          { name: "OPITO BOSIET", expiryDate: "2028-04-29" },
          { name: "OPITO FOET", expiryDate: "2028-04-29" },
        ],
      },
      new Date("2026-11-11T10:00:00Z"),
    );
    assert.ok(match.have.includes("IMCA"));
    assert.equal(match.unknownExpiry.includes("IMCA"), false);
    assert.doesNotMatch(formatMatchReason(match), /No expiry on file: .*IMCA/);
  });

  it("still flags an undated medical", () => {
    const job = JOB_CATALOG.find((item) => item.requiredCerts.some((cert) => /medical/i.test(cert)));
    assert.ok(job);
    const medicalLabel = job.requiredCerts.find((cert) => /medical/i.test(cert))!;
    const match = scoreDiverAgainstJob(job, { certs: [{ name: "HSE Diver Medical", issuingBody: "Dr Smith, HSE approved doctor", expiryDate: null }] });
    assert.ok(match.unknownExpiry.includes(medicalLabel));
  });

  it("only warns about missing expiry on tickets that expire", () => {
    const result = validateDiverProfile({
      headline: "Air Diver",
      bio: "Bio",
      location: "Bergen",
      experiences: [],
      references: [],
      certifications: [
        { name: "IMCA Surface Supplied Diver" },
        { name: "Norwegian Class B Diver Certificate" },
        { name: "Danish Commercial Diver Certificate" },
        { name: "HSE Diver Medical" },
      ],
    } as unknown as Parameters<typeof validateDiverProfile>[0]);
    const expiryWarnings = result.warnings.filter((warning) => /no expiry date/.test(warning));
    assert.equal(expiryWarnings.length, 1);
    assert.match(expiryWarnings[0], /HSE Diver Medical/);
  });
});

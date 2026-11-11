import type { DiverFormSource } from "@/lib/client-forms/types";

function formatDdMmYyyy(iso?: string | null) {
  if (!iso) return "";
  const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function formatPeriod(start?: string | null, end?: string | null) {
  const left = start?.trim() || "?";
  const right = end?.trim() || "Present";
  return `${left} – ${right}`;
}

export type BeaconCvFieldMap = {
  scalar: Record<string, string>;
  education: Array<Record<string, string>>;
  medical: Array<Record<string, string>>;
  certs: Array<Record<string, string>>;
  work: Array<Record<string, string>>;
  missing: string[];
};

export function buildBeaconCvFieldMap(source: DiverFormSource): BeaconCvFieldMap {
  const { profile, bundle, displayName, email, positionTitle } = source;
  const priv = bundle.privateDetails;
  const missing: string[] = [];

  const requireField = (label: string, value: string | null | undefined) => {
    const v = value?.trim();
    if (!v) missing.push(label);
    return v ?? "";
  };

  const passports = priv?.passports ?? [];
  const passport1 = passports[0];
  const passport2 = passports[1];

  const scalar: Record<string, string> = {
    "Full Name": requireField("full_name", displayName),
    Position: requireField("position", positionTitle || profile.profile.headline),
    Nationality: requireField("nationality", priv?.nationality),
    DateofBirth: requireField("date_of_birth", priv?.date_of_birth ? formatDdMmYyyy(priv.date_of_birth) : ""),
    PassportNo: passport1?.number ?? "",
    PassportIssueDate: formatDdMmYyyy(passport1?.issue_date),
    PassportExpiryDate: formatDdMmYyyy(passport1?.expiry_date),
    Passport2No: passport2?.number ?? "",
    Passport2IssueDate: formatDdMmYyyy(passport2?.issue_date),
    Passport2ExpiryDate: formatDdMmYyyy(passport2?.expiry_date),
    SeamanBookNo: priv?.seaman_book?.number ?? "",
    SeamanBookIssueDate: formatDdMmYyyy(priv?.seaman_book?.issue_date),
    SeamanBookExpiryDate: formatDdMmYyyy(priv?.seaman_book?.expiry_date),
    Weight: priv?.weight_kg != null ? String(priv.weight_kg) : "",
    Height: priv?.height_cm != null ? String(priv.height_cm) : "",
    BloodGroup: priv?.blood_group ?? "",
    MobilizationAirport: requireField("mobilization_airport", priv?.mobilization_airport ?? profile.profile.location),
    HomeAddress: requireField("home_address", priv?.home_address),
    ContactNumber: profile.profile.phone ?? "",
    EmailAddress: email ?? "",
    ExperienceSummary: profile.profile.bio?.trim() || profile.profile.headline,
  };

  if (!passport1?.number) missing.push("passport");
  if (!profile.profile.phone) missing.push("phone");

  const education = bundle.education.map((row) => ({
    EducationDegree: row.degree,
    EducationInstitute: row.institute,
    EducationYear: row.year_completed ?? "",
  }));

  const medical = profile.certifications
    .filter((c) => /\b(medical|fitness|diver medical|hse)\b/i.test(c.name))
    .map((c) => ({
      MedCourseName: c.name,
      MedCertNumber: c.cert_number ?? "",
      MedIssueDate: formatDdMmYyyy(c.issue_date),
      MedExpiryDate: formatDdMmYyyy(c.expiry_date),
    }));

  const certs = profile.certifications
    .filter((c) => !/\b(medical|fitness|diver medical|hse)\b/i.test(c.name))
    .map((c) => ({
      CourseName: c.name,
      CertNumber: c.cert_number ?? "",
      CertIssueDate: formatDdMmYyyy(c.issue_date),
      CertExpiryDate: formatDdMmYyyy(c.expiry_date),
    }));

  const work = profile.experiences.map((exp) => ({
    DatePeriod: formatPeriod(exp.date_start, exp.date_end),
    Company: exp.company,
    WorkScope: exp.work_scope || exp.summary || exp.project_name || "",
    Scope: exp.scope_system || exp.summary || "",
    PositionRank: exp.role_title,
    RigVesselName: exp.rig_vessel_name || exp.project_name || "",
    Client: exp.client_name || "",
    Location: exp.location || "",
  }));

  return { scalar, education, medical, certs, work, missing };
}

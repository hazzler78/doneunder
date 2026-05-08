export type DataSource = "manual" | "ai" | "linkedin";

export type DiverExperienceInput = {
  id?: string;
  company: string;
  project_name?: string;
  location?: string;
  role_title: string;
  date_start?: string;
  date_end?: string;
  summary?: string;
  source?: DataSource;
  source_ref?: string;
};

export type DiverCertificationInput = {
  id?: string;
  name: string;
  issue_date?: string;
  expiry_date?: string;
  cert_number?: string;
  issuing_body?: string;
  source?: DataSource;
  source_ref?: string;
};

export type DiverReferenceInput = {
  id?: string;
  name: string;
  company?: string;
  phone: string;
  email?: string;
  source?: DataSource;
  source_ref?: string;
};

export type DiverProfilePayload = {
  headline: string;
  bio: string;
  location: string;
  mobilization_notice: string;
  availability_status: "available" | "deployed";
  sat_hours: number;
  dive_hours: number;
  polished_cv_markdown?: string;
  polished_cv_json?: Record<string, unknown> | null;
  ambassador_public_headline?: string;
  ambassador_short_bio?: string;
  ambassador_key_highlights?: string[];
  headline_source?: DataSource;
  headline_source_ref?: string;
  bio_source?: DataSource;
  bio_source_ref?: string;
  import_batch_id?: string | null;
  experiences: DiverExperienceInput[];
  certifications: DiverCertificationInput[];
  references: DiverReferenceInput[];
};

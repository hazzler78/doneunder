import { z } from "zod";

export const DATA_SOURCES = ["manual", "ai", "linkedin"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const PROFILE_STATUSES = ["draft", "published"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const AVAILABILITY_STATUSES = ["available", "deployed"] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const sourceSchema = z.enum(DATA_SOURCES);

export const experienceInputSchema = z.object({
  id: z.string().uuid().optional(),
  company: z.string().min(1),
  project_name: z.string().optional(),
  location: z.string().optional(),
  role_title: z.string().min(1),
  date_start: z.string().optional(),
  date_end: z.string().optional(),
  summary: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

export const certificationInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
  cert_number: z.string().optional(),
  issuing_body: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

export const referenceInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  company: z.string().optional(),
  phone: z.string().min(1),
  email: z.string().optional(),
  source: sourceSchema.optional(),
  source_ref: z.string().optional(),
});

export const polishedCvJsonSchema = z.object({
  location: z.string().optional(),
  mobilization_notice: z.string().optional(),
  availability_status: z.enum(AVAILABILITY_STATUSES).optional(),
  sat_hours: z.number().int().min(0).optional(),
  dive_hours: z.number().int().min(0).optional(),
  experiences: z.array(experienceInputSchema.omit({ id: true, source: true, source_ref: true })).default([]),
  certifications: z.array(certificationInputSchema.omit({ id: true, source: true, source_ref: true })).default([]),
  references: z
    .array(
      z.object({
        name: z.string().min(1),
        company: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
    )
    .default([]),
});

export const diverProfilePayloadSchema = z.object({
  headline: z.string().max(180),
  bio: z.string().max(2000),
  location: z.string().max(180),
  mobilization_notice: z.string().max(180),
  availability_status: z.enum(AVAILABILITY_STATUSES).default("available"),
  sat_hours: z.number().int().min(0),
  dive_hours: z.number().int().min(0),
  polished_cv_markdown: z.string().max(40000).optional(),
  polished_cv_json: polishedCvJsonSchema.nullable().optional(),
  ambassador_public_headline: z.string().max(220).optional(),
  ambassador_short_bio: z.string().max(1200).optional(),
  ambassador_key_highlights: z.array(z.string().max(180)).max(12).optional(),
  headline_source: sourceSchema.optional(),
  headline_source_ref: z.string().optional(),
  bio_source: sourceSchema.optional(),
  bio_source_ref: z.string().optional(),
  import_batch_id: z.string().uuid().nullable().optional(),
  experiences: z.array(experienceInputSchema).max(50),
  certifications: z.array(certificationInputSchema).max(50),
  references: z.array(referenceInputSchema).max(20),
});

export const diverProfilePatchSchema = diverProfilePayloadSchema
  .partial()
  .extend({
    experiences: z.array(experienceInputSchema).max(50).optional(),
    certifications: z.array(certificationInputSchema).max(50).optional(),
    references: z.array(referenceInputSchema).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Patch payload cannot be empty." });

const experienceBodySchema = experienceInputSchema.omit({ id: true, source: true, source_ref: true });
const certificationBodySchema = certificationInputSchema.omit({ id: true, source: true, source_ref: true });
const referenceBodySchema = referenceInputSchema.omit({ id: true, source: true, source_ref: true });

export const experienceMatchSchema = z
  .object({
    id: z.string().uuid().optional(),
    company: z.string().min(1).optional(),
    role_title: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.id || value.company || value.role_title), {
    message: "Provide an experience id, company, or role title to match.",
  });

export const certificationMatchSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.id || value.name), {
    message: "Provide a certification id or name to match.",
  });

export const referenceMatchSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.id || value.name || value.company), {
    message: "Provide a reference id, name, or company to match.",
  });

/** Incremental CV edits from Hermes chat (add / update / remove / replace). */
export const conversationalCvUpdateSchema = z
  .object({
    headline: z.string().max(180).optional().describe("Professional CV headline in English"),
    bio: z.string().max(2000).optional().describe("Profile / CV summary in English"),
    location: z.string().max(180).optional(),
    mobilization_notice: z.string().max(180).optional(),
    availability_status: z.enum(AVAILABILITY_STATUSES).optional(),
    sat_hours: z.number().int().min(0).optional(),
    dive_hours: z.number().int().min(0).optional(),
    ambassador_public_headline: z.string().max(220).optional(),
    ambassador_short_bio: z.string().max(1200).optional(),
    ambassador_key_highlights: z.array(z.string().max(180)).max(12).optional(),
    add_experiences: z
      .array(experienceBodySchema)
      .max(20)
      .optional()
      .describe("New jobs to prepend on the CV. Most recent first. English summaries."),
    update_experiences: z
      .array(
        z.object({
          match: experienceMatchSchema,
          patch: experienceBodySchema.partial(),
        }),
      )
      .max(20)
      .optional()
      .describe("Change existing jobs. Match by id, company, or role title."),
    remove_experiences: z
      .array(experienceMatchSchema)
      .max(20)
      .optional()
      .describe("Remove jobs that match id, company, or role title."),
    replace_experiences: z
      .array(experienceBodySchema)
      .max(50)
      .optional()
      .describe("Replace the whole experience section. Only when the diver pastes a full CV."),
    add_certifications: z
      .array(certificationBodySchema)
      .max(20)
      .optional()
      .describe("New tickets/certs to add. Keep official certificate titles."),
    update_certifications: z
      .array(
        z.object({
          match: certificationMatchSchema,
          patch: certificationBodySchema.partial(),
        }),
      )
      .max(20)
      .optional(),
    remove_certifications: z.array(certificationMatchSchema).max(20).optional(),
    replace_certifications: z.array(certificationBodySchema).max(50).optional(),
    add_references: z.array(referenceBodySchema.partial({ phone: true })).max(10).optional(),
    update_references: z
      .array(
        z.object({
          match: referenceMatchSchema,
          patch: referenceBodySchema.partial(),
        }),
      )
      .max(10)
      .optional(),
    remove_references: z.array(referenceMatchSchema).max(10).optional(),
    replace_references: z.array(referenceBodySchema.partial({ phone: true })).max(20).optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Provide at least one CV change.",
  });

export type ConversationalCvUpdate = z.infer<typeof conversationalCvUpdateSchema>;

/** AI CV pipeline output — shared between process-cv route and seed scripts. */
export const aiCvOutputSchema = z.object({
  professional_headline: z.string().min(1).max(220),
  polished_cv_markdown: z.string().min(1),
  polished_cv_json: polishedCvJsonSchema,
  ambassador_page: z.object({
    public_headline: z.string().min(1).max(220),
    short_bio: z.string().min(1).max(1200),
    key_highlights: z.array(z.string().min(1).max(180)).max(12),
  }),
});

export type DiverExperienceInput = z.infer<typeof experienceInputSchema>;
export type DiverCertificationInput = z.infer<typeof certificationInputSchema>;
export type DiverReferenceInput = z.infer<typeof referenceInputSchema>;
export type PolishedCvJson = z.infer<typeof polishedCvJsonSchema>;
export type DiverProfilePayload = z.infer<typeof diverProfilePayloadSchema>;
export type DiverProfilePatch = z.infer<typeof diverProfilePatchSchema>;
export type AiCvOutput = z.infer<typeof aiCvOutputSchema>;

/** Canonical scalar fields stored on diver_profiles (snake_case). */
export type DiverProfileScalars = {
  headline: string;
  bio: string;
  location: string;
  mobilization_notice: string;
  availability_status: AvailabilityStatus;
  sat_hours: number;
  dive_hours: number;
  polished_cv_markdown: string | null;
  polished_cv_json: PolishedCvJson | null;
  ambassador_public_headline: string | null;
  ambassador_short_bio: string | null;
  ambassador_key_highlights: string[];
  headline_source: DataSource;
  headline_source_ref: string | null;
  bio_source: DataSource;
  bio_source_ref: string | null;
  import_batch_id: string | null;
  profile_status: ProfileStatus;
  published_at: string | null;
  cv_last_processed_at: string | null;
  last_verified_at: string | null;
  verified: boolean;
  updated_at: string | null;
};

export type DiverProfileRow = DiverProfileScalars & {
  user_id: string;
};

export type DiverExperienceRow = DiverExperienceInput & {
  id: string;
  sort_order?: number;
};

export type DiverCertificationRow = DiverCertificationInput & {
  id: string;
  sort_order?: number;
};

export type DiverReferenceRow = DiverReferenceInput & {
  id: string;
  sort_order?: number;
};

export type DiverProfileFull = {
  profile: DiverProfileScalars;
  experiences: DiverExperienceRow[];
  certifications: DiverCertificationRow[];
  references: DiverReferenceRow[];
};

export const DIVER_PROFILE_SCALAR_COLUMNS =
  "headline,bio,location,mobilization_notice,availability_status,sat_hours,dive_hours,polished_cv_markdown,polished_cv_json,ambassador_public_headline,ambassador_short_bio,ambassador_key_highlights,headline_source,headline_source_ref,bio_source,bio_source_ref,import_batch_id,profile_status,published_at,cv_last_processed_at,last_verified_at,verified,updated_at" as const;

export const DIVER_EXPERIENCE_COLUMNS =
  "id,company,project_name,location,role_title,date_start,date_end,summary,source,source_ref" as const;

export const DIVER_CERTIFICATION_COLUMNS =
  "id,name,issue_date,expiry_date,cert_number,issuing_body,source,source_ref" as const;

export const DIVER_REFERENCE_COLUMNS = "id,name,company,phone,email,source,source_ref" as const;

export function emptyDiverProfileScalars(): DiverProfileScalars {
  return {
    headline: "",
    bio: "",
    location: "",
    mobilization_notice: "",
    availability_status: "available",
    sat_hours: 0,
    dive_hours: 0,
    polished_cv_markdown: null,
    polished_cv_json: null,
    ambassador_public_headline: null,
    ambassador_short_bio: null,
    ambassador_key_highlights: [],
    headline_source: "manual",
    headline_source_ref: null,
    bio_source: "manual",
    bio_source_ref: null,
    import_batch_id: null,
    profile_status: "draft",
    published_at: null,
    cv_last_processed_at: null,
    last_verified_at: null,
    verified: false,
    updated_at: null,
  };
}

export type ProfileValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

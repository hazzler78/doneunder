export type UserRole = "diver" | "company" | "admin";

/** Demo/marketing card data — not the canonical DB profile model (see lib/diver-profile.ts). */
export type MockDiverCard = {
  id: string;
  username: string;
  fullName: string;
  headline: string;
  bio: string;
  satHours: number;
  diveHours: number;
  location: string;
  availabilityStatus: "available" | "deployed";
  mobilizationNotice: string;
  certifications: string[];
  languages: string[];
  specialties: string[];
  verified: boolean;
};

export type CompanyProfile = {
  id: string;
  companyName: string;
  location: string;
  subscriptionStatus: "active" | "past_due" | "canceled";
  plan: "149" | "199" | "249";
};

export type JobPost = {
  id: string;
  companyId: string;
  title: string;
  description: string;
  location: string;
  startDate: string;
  requiredCerts: string[];
  budgetRange: string;
  status: "open" | "filled" | "draft";
};

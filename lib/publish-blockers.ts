import type { ProfileValidationResult } from "@/lib/diver-profile";

type AutoPublishSkipReason =
  | "already_published"
  | "intentional_unpublish"
  | "not_ready"
  | "validation_failed";

const HEADLINE_HINT =
  "Add a headline in workspace (Headline field) or ask Hermes: “Set my headline to …”.";

export function formatValidationIssuesForDiver(validation: ProfileValidationResult) {
  const lines: string[] = [];
  for (const error of validation.errors) {
    if (/headline/i.test(error)) {
      lines.push(`Headline: still missing. ${HEADLINE_HINT}`);
      continue;
    }
    if (/reference/i.test(error) && /phone/i.test(error)) {
      lines.push(`Reference phone: ${error.replace(/^Reference #\d+ /, "")} Add a phone number or remove that reference.`);
      continue;
    }
    lines.push(error);
  }
  for (const warning of validation.warnings) {
    if (/^Bio is empty/i.test(warning)) {
      lines.push("Bio is empty — optional for publish, but a short summary helps contractors.");
      continue;
    }
    if (/^No certifications/i.test(warning)) {
      lines.push("No certifications listed — upload ticket PDFs or add certs in chat.");
      continue;
    }
    if (/^No professional experience/i.test(warning)) {
      lines.push("No jobs on your CV yet — paste a role in chat or re-upload a readable CV PDF.");
      continue;
    }
    lines.push(warning);
  }
  return lines;
}

export function formatAutoPublishSkippedMessage(input: {
  skippedReason: AutoPublishSkipReason;
  validation?: ProfileValidationResult;
}) {
  if (input.skippedReason === "intentional_unpublish") {
    return "Your page stays offline because you unpublished earlier. Say “Publish my profile” or tap Publish page when you want it live again.";
  }
  if (input.skippedReason === "not_ready") {
    return "Your profile is still empty — upload a CV PDF or add experience and certifications first.";
  }
  if (input.skippedReason === "validation_failed" && input.validation) {
    const issues = formatValidationIssuesForDiver(input.validation);
    return (
      "Could not auto-publish yet:\n" +
      issues.map((line) => `• ${line}`).join("\n") +
      "\n\nFix these in workspace or tell me what to change, then say “Publish my profile”."
    );
  }
  if (input.skippedReason === "validation_failed") {
    return `Could not auto-publish yet (profile validation failed). ${HEADLINE_HINT}`;
  }
  return "Your page is still a draft. Open Preview, then publish when it looks right.";
}

export function formatManualPublishFailure(validation: ProfileValidationResult) {
  const issues = formatValidationIssuesForDiver(validation);
  return (
    "Profile is not ready to publish:\n" +
    issues.map((line) => `• ${line}`).join("\n")
  );
}

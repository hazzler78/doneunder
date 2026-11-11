import type { SupabaseClient } from "@supabase/supabase-js";
import { detectClientFormKind } from "@/lib/client-forms/detect";
import { fillBeaconOffshoreCvDocx } from "@/lib/client-forms/beacon-offshore-cv";
import { fillBeaconPdpaPdf } from "@/lib/client-forms/beacon-pdpa-pdf";
import type { BeaconPdpaInput, ClientFormFillFailure, ClientFormFillResult, DiverFormSource } from "@/lib/client-forms/types";
import { DIVER_DOCUMENTS_BUCKET } from "@/lib/diver-documents";

export async function fillClientFormFromTemplate(
  templateBytes: Uint8Array,
  source: DiverFormSource,
  options?: { pdpa?: BeaconPdpaInput; filename?: string },
): Promise<ClientFormFillResult | ClientFormFillFailure> {
  const kind = detectClientFormKind(templateBytes, options?.filename);
  if (kind === "beacon_offshore_cv_docx") {
    return fillBeaconOffshoreCvDocx(templateBytes, source);
  }
  if (kind === "beacon_pdpa_pdf") {
    if (!options?.pdpa) {
      return {
        ok: false,
        error: "PDPA form requires explicit consent choices and signature from the diver.",
        kind,
        missingFields: ["pdpa_consent"],
      };
    }
    return fillBeaconPdpaPdf(templateBytes, options.pdpa);
  }
  return { ok: false, error: "Unrecognized client form template.", kind };
}

export async function storeClientFormOutput(
  supabase: SupabaseClient,
  diverId: string,
  fill: ClientFormFillResult,
  meta: { templateLabel?: string; templateStoragePath?: string },
) {
  const outputPath = `${diverId}/client-forms/${crypto.randomUUID()}/${fill.filename}`;
  const upload = await supabase.storage.from(DIVER_DOCUMENTS_BUCKET).upload(outputPath, fill.bytes, {
    contentType: fill.contentType,
    upsert: false,
  });
  if (upload.error) {
    return { ok: false as const, error: upload.error.message };
  }

  const { data, error } = await supabase
    .from("diver_client_forms")
    .insert({
      diver_id: diverId,
      form_kind: fill.kind,
      template_label: meta.templateLabel ?? null,
      template_storage_path: meta.templateStoragePath ?? null,
      output_storage_path: outputPath,
      output_filename: fill.filename,
      output_content_type: fill.contentType,
      status: "pending_approval",
      consent_snapshot: fill.consentSnapshot ?? null,
      missing_fields: fill.missingFields,
    })
    .select("id,status,output_filename,output_storage_path,form_kind,missing_fields,created_at")
    .single();

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, record: data };
}

export async function approveClientForm(supabase: SupabaseClient, diverId: string, formId: string) {
  const { data, error } = await supabase
    .from("diver_client_forms")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", formId)
    .eq("diver_id", diverId)
    .eq("status", "pending_approval")
    .select("id,status,output_filename,output_storage_path,output_content_type,form_kind")
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Form not found or already approved." };
  return { ok: true as const, record: data };
}

export async function downloadClientFormBytes(supabase: SupabaseClient, storagePath: string) {
  const { data, error } = await supabase.storage.from(DIVER_DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) return { ok: false as const, error: error?.message ?? "Download failed." };
  const buf = new Uint8Array(await data.arrayBuffer());
  return { ok: true as const, bytes: buf };
}

export async function getApprovedClientFormAttachment(
  supabase: SupabaseClient,
  diverId: string,
  formId: string,
) {
  const { data, error } = await supabase
    .from("diver_client_forms")
    .select("output_filename,output_storage_path,output_content_type,status")
    .eq("id", formId)
    .eq("diver_id", diverId)
    .maybeSingle();

  if (error || !data) return { ok: false as const, error: error?.message ?? "Form not found." };
  if (data.status !== "approved") {
    return { ok: false as const, error: "Client form must be approved before attaching to email." };
  }
  const file = await downloadClientFormBytes(supabase, data.output_storage_path);
  if (!file.ok) return file;
  return {
    ok: true as const,
    filename: data.output_filename,
    content: file.bytes,
    contentType: data.output_content_type,
  };
}

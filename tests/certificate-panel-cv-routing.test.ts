import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  certificatePanelCvMisrouteLooksLike,
  certificatePanelCvMisrouteNote,
} from "../lib/certificate-panel-cv-routing";
import { looksLikeMainCvFilename } from "../lib/document-names";

describe("certificate panel CV routing helpers", () => {
  it("detects Percio Salles CV filename", () => {
    assert.equal(looksLikeMainCvFilename("Cv Diver Percio Salles.pdf"), true);
  });

  it("flags misroutes only when a CV is already stored", () => {
    assert.equal(
      certificatePanelCvMisrouteLooksLike("Cv Diver Percio Salles.pdf", true),
      true,
    );
    assert.equal(
      certificatePanelCvMisrouteLooksLike("Cv Diver Percio Salles.pdf", false),
      false,
    );
  });

  it("notes CV upload for misrouted filenames", () => {
    const note = certificatePanelCvMisrouteNote("Cv Diver Percio Salles.pdf");
    assert.match(note, /looks like a CV/i);
    assert.doesNotMatch(note, /certificate name/i);
  });
});
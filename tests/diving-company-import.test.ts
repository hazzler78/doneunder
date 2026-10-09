import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCompanyDraftsFromHtml,
  parseAdcMembersHtml,
  resolveImportUrl,
} from "../lib/diving-company-import";

const fixture = `
<div class="singleMemberInit" data-address="Michael Smith, 282 Moira Road, Lisburn, County Antrim, , BT28 2TU, Northern Ireland" data-website="https://www.abcomarine.co.uk" data-tel="028 9262 2111" data-name-type="ABCO Divers Ltd - Full Member"></div>
<div class="singleMemberInit" data-address="" data-website="" data-tel="" data-name-type=""></div>
<div class="singleMemberInit" data-address="Alpha Marine Services Ltd, , 6 Dunstone Road, Plymstock, Plymouth, PL9 8RQ, UK" data-website="https://www.alphamarineservicesltd.com" data-tel="" data-name-type="Alpha Marine Services Ltd - Associate Member"></div>
<div class="singleMemberInit" data-address="Alistair Baird, Unit 19 Highland Avenue, Sandbank Business Park, Dunoon, Argyle, , PA23 8PB, Scotland" data-website="https://www.shearwatermarine.co.uk" data-tel="01369 705949" data-name-type="Shearwater Marine Services Ltd - Full Member"></div>
<div class="singleMemberInit" data-address="Alistair Baird, Unit 19 Highland Avenue, Sandbank Business Park, Dunoon, Argyle, , PA23 8PB, Scotland" data-website="https://www.shearwatermarine.co.uk" data-tel="01369 705949" data-name-type="Shearwater Marine Services Ltd - Full Member"></div>
`;

describe("ADC company import", () => {
  it("maps adc-uk.info home to Find A Member", () => {
    assert.equal(resolveImportUrl("https://www.adc-uk.info/"), "https://www.adc-uk.info/find-a-member/");
    assert.equal(
      resolveImportUrl("https://www.adc-uk.info/find-a-member/"),
      "https://www.adc-uk.info/find-a-member/",
    );
  });

  it("parses Full Members with website and dedupes", () => {
    const all = parseAdcMembersHtml(fixture);
    assert.equal(all.length, 3);
    const full = extractCompanyDraftsFromHtml(fixture, "https://www.adc-uk.info/find-a-member/", {
      fullMembersOnly: true,
    });
    assert.equal(full.parser, "adc_members");
    assert.equal(full.drafts.length, 2);
    assert.ok(full.drafts.every((d) => d.memberType === "Full Member"));
    assert.equal(full.drafts[0]!.website, "https://www.abcomarine.co.uk");
    assert.equal(full.drafts[0]!.country, "UK");
    assert.equal(full.drafts[0]!.hire_graduates, true);
    assert.match(full.drafts[0]!.notes, /no CV blast/i);
  });

  it("can include associates when requested", () => {
    const all = extractCompanyDraftsFromHtml(fixture, "https://www.adc-uk.info/find-a-member/", {
      fullMembersOnly: false,
    });
    assert.equal(all.drafts.length, 3);
    assert.ok(all.drafts.some((d) => d.memberType === "Associate Member"));
  });
});

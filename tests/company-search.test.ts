import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { criteriaFromForm, friendlyRpcError, MAX_TEASERS, parseSearchRows } from "../lib/company-search";

const teaser = {
  certs_valid: 3,
  dive_hours_band: "1000-2000",
  sat_hours_band: "not declared",
  available: true,
  verified: false,
  medical_valid: true,
  welding: false,
};

describe("company search", () => {
  it("parses form criteria", () => {
    const form = new FormData();
    form.set("certs", "HSE SCUBA, IMCA Sat\nCSWIP 3.1U");
    form.set("min_dive_hours", "500");
    form.set("available_only", "on");
    const parsed = criteriaFromForm(form);
    assert.ok(parsed.success);
    assert.deepEqual(parsed.data.certs, ["HSE SCUBA", "IMCA Sat", "CSWIP 3.1U"]);
    assert.equal(parsed.data.min_dive_hours, 500);
    assert.equal(parsed.data.available_only, true);
    assert.equal(parsed.data.verified_only, false);
  });

  it("rejects more than 10 certs", () => {
    const form = new FormData();
    form.set("certs", Array.from({ length: 11 }, (_, i) => `c${i}`).join(","));
    assert.equal(criteriaFromForm(form).success, false);
  });

  it("caps teasers at 10 and drops rows with unexpected shape", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ search_id: "s1", slot: i + 1, teaser }));
    rows[2] = { search_id: "s1", slot: 3, teaser: { full_name: "Leak" } as never };
    const parsed = parseSearchRows(rows);
    assert.equal(parsed.searchId, "s1");
    assert.equal(parsed.teasers.length, MAX_TEASERS - 1);
    for (const row of parsed.teasers) {
      assert.deepEqual(Object.keys(row.teaser).sort(), Object.keys(teaser).sort());
    }
  });

  it("strips unknown keys from teasers (no PII passthrough)", () => {
    const parsed = parseSearchRows([{ search_id: "s", slot: 1, teaser: { ...teaser, email: "x@y.z" } }]);
    assert.equal("email" in parsed.teasers[0].teaser, false);
  });

  it("maps RPC errors", () => {
    assert.match(friendlyRpcError("rate_limited"), /20 per hour/);
    assert.match(friendlyRpcError("already_revealed"), /new search/);
    assert.match(friendlyRpcError("weird"), /went wrong/);
  });
});

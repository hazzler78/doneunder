import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublishNudgeSkipped } from "../lib/publish-nudge-skip";

describe("publish nudge skip list", () => {
  it("skips an address that unsubscribed", () => {
    assert.equal(isPublishNudgeSkipped({ email: "jsh.even@gmail.com", username: "jsh.even" }), true);
    assert.equal(isPublishNudgeSkipped({ email: "  JSH.EVEN@gmail.com " }), true);
  });

  it("still skips the internal tester account", () => {
    assert.equal(isPublishNudgeSkipped({ email: "mikael@doneunder.ai", username: "mikael" }), true);
  });

  it("does not skip other divers", () => {
    assert.equal(isPublishNudgeSkipped({ email: "diver@example.com", username: "diver" }), false);
  });
});

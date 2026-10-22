import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDateInTimeZone,
  certExpiryLabel,
  certExpiryStatus,
  clampLeadDays,
  daysUntilExpiry,
  dueReminderSteps,
  isReminderCert,
  isSkippedReminderAccount,
  planCertExpiryReminders,
  reminderEmailCopy,
  reminderSentKey,
  type ReminderCandidate,
} from "../lib/cert-expiry";

const NOW = new Date("2026-10-22T10:00:00.000Z");

function daysAhead(days: number) {
  const today = calendarDateInTimeZone(NOW);
  const utc = Date.parse(`${today}T00:00:00Z`) + days * 86_400_000;
  return new Date(utc).toISOString().slice(0, 10);
}

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    diverId: "diver-1",
    email: "gareth@doneunder.ai",
    username: "gareth",
    fullName: "Gareth Middleton",
    enabled: true,
    leadDays: 30,
    certs: [
      {
        id: "cert-1",
        name: "OPITO BOSIET",
        expiryDate: daysAhead(30),
        confirmed: true,
      },
    ],
    sentKeys: [],
    ...overrides,
  };
}

describe("certificate expiry dates", () => {
  it("uses the Berlin calendar day", () => {
    assert.equal(calendarDateInTimeZone(NOW), "2026-10-22");
    assert.equal(calendarDateInTimeZone(new Date("2026-10-21T23:30:00.000Z")), "2026-10-22");
    assert.equal(calendarDateInTimeZone(new Date("2026-10-22T22:30:00.000Z")), "2026-10-23");
  });

  it("counts the expiry day as zero and the next day as expired", () => {
    assert.equal(daysUntilExpiry(daysAhead(0), NOW), 0);
    assert.equal(daysUntilExpiry(daysAhead(-1), NOW), -1);
    assert.equal(certExpiryStatus(0, 30), "today");
    assert.equal(certExpiryStatus(-1, 30), "expired");
    assert.equal(certExpiryLabel("today"), "Expires today");
    assert.equal(certExpiryLabel("expired"), "Expired");
  });

  it("marks expires soon inside the lead window, capped at 30 days", () => {
    assert.equal(certExpiryStatus(30, 30), "soon");
    assert.equal(certExpiryStatus(31, 30), "ok");
    assert.equal(certExpiryStatus(45, 90), "ok");
    assert.equal(certExpiryStatus(30, 90), "soon");
    assert.equal(certExpiryLabel("soon"), "Expires soon");
  });

  it("returns null days when the date is missing", () => {
    assert.equal(daysUntilExpiry(null, NOW), null);
    assert.equal(daysUntilExpiry("   ", NOW), null);
    assert.deepEqual(dueReminderSteps({ daysUntil: null, leadDays: 30, enabled: true }), []);
    assert.equal(isReminderCert("OPITO BOSIET", null), false);
    assert.equal(isReminderCert("Not provided", daysAhead(10)), false);
  });

  it("sends the lead step across the catch-up window, then 7, then the expiry day", () => {
    assert.deepEqual(dueReminderSteps({ daysUntil: 30, leadDays: 30, enabled: true }), ["lead"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 29, leadDays: 30, enabled: true }), ["lead"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 8, leadDays: 30, enabled: true }), ["lead"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 7, leadDays: 30, enabled: true }), ["7"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 1, leadDays: 30, enabled: true }), ["7"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 0, leadDays: 30, enabled: true }), ["0"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: -4, leadDays: 30, enabled: true }), ["0"]);
  });

  it("does not repeat a step that was already sent", () => {
    assert.deepEqual(
      dueReminderSteps({ daysUntil: 20, leadDays: 30, enabled: true, alreadySent: ["lead"] }),
      [],
    );
    assert.deepEqual(
      dueReminderSteps({ daysUntil: -2, leadDays: 30, enabled: true, alreadySent: ["0"] }),
      [],
    );
  });

  it("follows a custom lead and skips lead when it is 7 or less", () => {
    assert.deepEqual(dueReminderSteps({ daysUntil: 14, leadDays: 14, enabled: true }), ["lead"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 10, leadDays: 14, enabled: true }), ["lead"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 15, leadDays: 14, enabled: true }), []);
    assert.deepEqual(dueReminderSteps({ daysUntil: 7, leadDays: 7, enabled: true }), ["7"]);
    assert.deepEqual(dueReminderSteps({ daysUntil: 3, leadDays: 3, enabled: true }), ["7"]);
    assert.equal(clampLeadDays(0), 1);
    assert.equal(clampLeadDays(400), 365);
  });

  it("sends nothing when reminders are off", () => {
    assert.deepEqual(dueReminderSteps({ daysUntil: 7, leadDays: 30, enabled: false }), []);
  });

  it("skips demo and test accounts", () => {
    assert.equal(isSkippedReminderAccount({ email: "elin@demo.doneunder.ai", username: "elin" }), true);
    assert.equal(isSkippedReminderAccount({ email: "real@doneunder.ai", username: "gareth-demo" }), true);
    assert.equal(isSkippedReminderAccount({ email: "real@doneunder.ai", username: "alex-test" }), true);
    assert.equal(isSkippedReminderAccount({ email: "gareth@doneunder.ai", username: "gareth" }), false);
  });

  it("plans one lead reminder and a new one after the expiry date changes", () => {
    const first = planCertExpiryReminders([candidate()], NOW);
    assert.equal(first.length, 1);
    assert.equal(first[0]?.step, "lead");
    assert.equal(first[0]?.daysUntil, 30);

    const sent = planCertExpiryReminders(
      [
        candidate({
          sentKeys: [
            reminderSentKey({
              diverId: "diver-1",
              certName: "OPITO BOSIET",
              expiryDate: daysAhead(30),
              step: "lead",
            }),
          ],
        }),
      ],
      NOW,
    );
    assert.equal(sent.length, 0);

    const renewed = planCertExpiryReminders(
      [
        candidate({
          certs: [{ id: "cert-2", name: "OPITO BOSIET", expiryDate: daysAhead(40), confirmed: true }],
          sentKeys: [
            reminderSentKey({
              diverId: "diver-1",
              certName: "OPITO BOSIET",
              expiryDate: daysAhead(30),
              step: "lead",
            }),
          ],
        }),
      ],
      NOW,
    );
    assert.equal(renewed.length, 0);

    const renewedInsideWindow = planCertExpiryReminders(
      [
        candidate({
          certs: [{ id: "cert-2", name: "OPITO BOSIET", expiryDate: daysAhead(20), confirmed: true }],
          sentKeys: [
            reminderSentKey({
              diverId: "diver-1",
              certName: "OPITO BOSIET",
              expiryDate: daysAhead(30),
              step: "lead",
            }),
          ],
        }),
      ],
      NOW,
    );
    assert.equal(renewedInsideWindow.length, 1);
    assert.equal(renewedInsideWindow[0]?.expiryDate, daysAhead(20));
  });

  it("skips unconfirmed dates, empty names, and disabled or demo divers", () => {
    const planned = planCertExpiryReminders(
      [
        candidate({
          certs: [{ id: "cert-1", name: "OPITO BOSIET", expiryDate: daysAhead(10), confirmed: false }],
        }),
        candidate({ diverId: "diver-2", enabled: false }),
        candidate({ diverId: "diver-3", email: "elin@demo.doneunder.ai", username: "elin" }),
        candidate({
          diverId: "diver-4",
          certs: [{ id: "cert-4", name: "Not provided", expiryDate: daysAhead(10), confirmed: true }],
        }),
      ],
      NOW,
    );
    assert.equal(planned.length, 0);
  });

  it("keeps email copy free of addresses", () => {
    for (const step of ["lead", "7", "0"] as const) {
      const copy = reminderEmailCopy({
        certName: "OEUK Medical",
        expiryDate: "2027-03-27",
        step,
        daysUntil: step === "0" ? 0 : 12,
        fullName: "hidden@doneunder.ai",
      });
      assert.equal(copy.subject.includes("@"), false);
      assert.equal(copy.body.includes("@"), false);
      assert.match(copy.body, /^Hi there,/);
    }
  });
});

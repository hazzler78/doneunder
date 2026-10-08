import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markdownToEmailHtml, markdownToPlainText, prepareOutboundEmailBody } from "../lib/email-body";

const schoolDraft = `Hi,

Please find below a short one-page overview of DoneUnder that you can forward to your graduating students.

---

**DoneUnder – Overview for Commercial Diving Schools**

**What is DoneUnder?**
DoneUnder is a free professional platform built specifically for commercial divers.

**Why it helps your graduates**
- Students create a professional, employer-ready profile in minutes
- All certifications (IMCA, BOSIET, medical, etc.) are stored and easy to share
- No cost to the diver or the school

**Contact**
Gareth Darrin Middleton
[Online CV](https://doneunder.ai/cv/gareth)

---

Happy to answer any questions.

Best regards,
Gareth Darrin Middleton`;

describe("email body markdown", () => {
  it("strips markdown markers from the plain-text part", () => {
    const text = markdownToPlainText(schoolDraft);
    assert.equal(text.includes("**"), false);
    assert.equal(text.includes("---"), false);
    assert.match(text, /DoneUnder – Overview for Commercial Diving Schools/);
    assert.match(text, /• Students create a professional/);
    assert.match(text, /Online CV \(https:\/\/doneunder\.ai\/cv\/gareth\)/);
  });

  it("renders bold, lists, and links in the HTML part", () => {
    const html = markdownToEmailHtml(schoolDraft);
    assert.match(html, /<strong>DoneUnder – Overview for Commercial Diving Schools<\/strong>/);
    assert.match(html, /<strong>What is DoneUnder\?<\/strong>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<li>Students create a professional/);
    assert.match(html, /<a href="https:\/\/doneunder\.ai\/cv\/gareth">Online CV<\/a>/);
    assert.match(html, /<hr>/);
    assert.equal(html.includes("<script"), false);
  });

  it("escapes raw HTML in the body", () => {
    const html = markdownToEmailHtml('Hello <script>alert("x")</script> **friend**');
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /<strong>friend<\/strong>/);
  });

  it("prepares both parts for Resend", () => {
    const prepared = prepareOutboundEmailBody("**Hello**\n- one");
    assert.equal(prepared.text, "Hello\n• one");
    assert.match(prepared.html, /<strong>Hello<\/strong>/);
    assert.match(prepared.html, /<li>one<\/li>/);
  });
});

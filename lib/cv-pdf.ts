import { englishPublicText } from "@/lib/english";
import type { DiverProfileFull } from "@/lib/diver-profile";

type PdfLine = {
  text: string;
  size: number;
  bold?: boolean;
  gapAfter?: number;
};

function formatCvDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function sanitizeFilenamePart(value: string) {
  const slug = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "Diver";
}

export function cvPdfFilename(displayName: string) {
  return `${sanitizeFilenamePart(displayName)}-CV.pdf`;
}

export function certificatesPdfFilename(displayName: string) {
  return `${sanitizeFilenamePart(displayName)}-Certificates.pdf`;
}

function wrapWords(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= maxChars) {
      current = word;
    } else {
      for (let index = 0; index < word.length; index += maxChars) {
        const chunk = word.slice(index, index + maxChars);
        if (index + maxChars >= word.length) current = chunk;
        else lines.push(chunk);
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

export function buildCvPdfLines(profile: DiverProfileFull, displayName: string): PdfLine[] {
  const p = profile.profile;
  const headline = englishPublicText(p.ambassador_public_headline || p.headline) || "Commercial Diver CV";
  const summary = englishPublicText(p.ambassador_short_bio || p.bio) || "Professional summary not provided yet.";
  const lines: PdfLine[] = [
    { text: displayName.trim() || "Commercial Diver", size: 18, bold: true, gapAfter: 4 },
    { text: headline, size: 12, bold: true, gapAfter: 4 },
    {
      text: [
        englishPublicText(p.location) || "Location not provided",
        p.mobilization_notice ? englishPublicText(p.mobilization_notice) : null,
      ]
        .filter(Boolean)
        .join(" • "),
      size: 10,
      gapAfter: 14,
    },
    { text: "Professional Summary", size: 13, bold: true, gapAfter: 6 },
    { text: summary, size: 10, gapAfter: 12 },
    { text: "Career Metrics", size: 13, bold: true, gapAfter: 6 },
    {
      text: `Saturation hours: ${p.sat_hours > 0 ? p.sat_hours.toLocaleString() : "Not declared"}`,
      size: 10,
    },
    {
      text: `Dive hours: ${p.dive_hours > 0 ? p.dive_hours.toLocaleString() : "Not declared"}`,
      size: 10,
      gapAfter: 12,
    },
    { text: "Professional Experience", size: 13, bold: true, gapAfter: 8 },
  ];

  if (profile.experiences.length === 0) {
    lines.push({ text: "No project history has been added yet.", size: 10, gapAfter: 12 });
  } else {
    for (const item of profile.experiences) {
      const start = formatCvDate(item.date_start);
      const end = formatCvDate(item.date_end) ?? (item.date_start ? "Present" : null);
      const dates = start || end ? `${start ?? "Start"} – ${end ?? "Present"}` : null;
      lines.push({
        text: `${englishPublicText(item.role_title)} • ${englishPublicText(item.company)}`,
        size: 11,
        bold: true,
        gapAfter: 2,
      });
      const meta = [item.project_name, item.location, dates]
        .filter(Boolean)
        .map((part) => (typeof part === "string" ? englishPublicText(part) || part : part))
        .join(" • ");
      if (meta) lines.push({ text: meta, size: 9, gapAfter: 2 });
      if (item.summary) lines.push({ text: englishPublicText(item.summary), size: 10, gapAfter: 8 });
      else lines.push({ text: " ", size: 8, gapAfter: 6 });
    }
  }

  lines.push({ text: "Certifications", size: 13, bold: true, gapAfter: 8 });
  if (profile.certifications.length === 0) {
    lines.push({ text: "No certifications listed yet.", size: 10, gapAfter: 12 });
  } else {
    for (const cert of profile.certifications) {
      lines.push({ text: englishPublicText(cert.name), size: 11, bold: true, gapAfter: 2 });
      lines.push({
        text: [
          cert.issuing_body,
          cert.cert_number ? `#${cert.cert_number}` : null,
          `Issued: ${formatCvDate(cert.issue_date) ?? "Not provided"}`,
          `Expires: ${formatCvDate(cert.expiry_date) ?? "Not provided"}`,
        ]
          .filter(Boolean)
          .join(" • "),
        size: 9,
        gapAfter: 8,
      });
    }
  }

  lines.push({ text: "References", size: 13, bold: true, gapAfter: 8 });
  if (profile.references.length === 0) {
    lines.push({ text: "References available on request.", size: 10 });
  } else {
    for (const ref of profile.references) {
      lines.push({ text: ref.name, size: 11, bold: true, gapAfter: 2 });
      lines.push({
        text: [ref.company, ref.phone, ref.email].filter(Boolean).join(" • "),
        size: 9,
        gapAfter: 8,
      });
    }
  }

  return lines;
}

function pdfEscape(text: string) {
  let encoded = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === "\\" || char === "(" || char === ")") {
      encoded += `\\${char}`;
    } else if (code === 0x2013 || code === 0x2014) {
      encoded += "-";
    } else if (code === 0x2018 || code === 0x2019) {
      encoded += "'";
    } else if (code === 0x201c || code === 0x201d) {
      encoded += '"';
    } else if (code === 0x2022) {
      encoded += "-";
    } else if (code < 128) {
      encoded += char;
    } else if (code <= 255) {
      encoded += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      encoded += "?";
    }
  }
  return encoded;
}

function maxCharsForSize(size: number) {
  return Math.max(28, Math.floor(495 / (size * 0.52)));
}

export function renderCvPdf(lines: PdfLine[]): Buffer {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const objects: string[] = [];
  const pages: number[] = [];

  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const fontRegular = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBold = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  let content = "";
  let y = pageHeight - margin;
  const flushPage = () => {
    const stream = `BT\n${content}ET\n`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pages.push(pageId);
    content = "";
    y = pageHeight - margin;
  };

  const writeLine = (line: PdfLine) => {
    const wrapped = wrapWords(line.text.replace(/\s+/g, " ").trim() || " ", maxCharsForSize(line.size));
    for (const part of wrapped) {
      if (y < margin + 24) flushPage();
      const font = line.bold ? "F2" : "F1";
      content += `/${font} ${line.size} Tf\n`;
      content += `1 0 0 1 ${margin} ${y.toFixed(2)} Tm\n`;
      content += `(${pdfEscape(part)}) Tj\n`;
      y -= line.size + 4;
    }
    y -= line.gapAfter ?? 2;
  };

  for (const line of lines) writeLine(line);
  if (content || pages.length === 0) flushPage();

  const kids = pages.map((id) => `${id} 0 R`).join(" ");
  const pagesId = addObject(`<< /Type /Pages /Count ${pages.length} /Kids [ ${kids} ] >>`);
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const patched = objects.map((body) => body.replace("/Parent 0 0 R", `/Parent ${pagesId} 0 R`));
  let offset = 0;
  const header = "%PDF-1.4\n";
  const chunks: Buffer[] = [Buffer.from(header, "utf8")];
  offset += header.length;
  const xref: number[] = [0];
  patched.forEach((body, index) => {
    xref.push(offset);
    const objectText = `${index + 1} 0 obj\n${body}\nendobj\n`;
    const buf = Buffer.from(objectText, "utf8");
    chunks.push(buf);
    offset += buf.length;
  });

  const xrefStart = offset;
  let xrefTable = `xref\n0 ${patched.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= patched.length; index += 1) {
    xrefTable += `${String(xref[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${patched.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefTable + trailer, "utf8"));
  return Buffer.concat(chunks);
}

export function buildDiverCvPdf(profile: DiverProfileFull, displayName: string) {
  return renderCvPdf(buildCvPdfLines(profile, displayName));
}

export function buildDiverCertificatesPdf(profile: DiverProfileFull, displayName: string) {
  const lines: PdfLine[] = [
    { text: displayName.trim() || "Commercial Diver", size: 18, bold: true, gapAfter: 4 },
    { text: "Certification records", size: 13, bold: true, gapAfter: 12 },
  ];

  if (profile.certifications.length === 0) {
    lines.push({
      text: "No certifications have been listed on this profile yet.",
      size: 10,
    });
  } else {
    for (const cert of profile.certifications) {
      lines.push({ text: englishPublicText(cert.name), size: 11, bold: true, gapAfter: 2 });
      lines.push({
        text: [
          cert.issuing_body,
          cert.cert_number ? `#${cert.cert_number}` : null,
          `Issued: ${formatCvDate(cert.issue_date) ?? "Not provided"}`,
          `Expires: ${formatCvDate(cert.expiry_date) ?? "Not provided"}`,
        ]
          .filter(Boolean)
          .join(" • "),
        size: 9,
        gapAfter: 8,
      });
    }
  }

  return renderCvPdf(lines);
}

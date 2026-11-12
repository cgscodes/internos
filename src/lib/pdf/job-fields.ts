import { dateInput } from "../validation/tracking.ts";
export const PDF_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 40,
  characters: 19000,
  milliseconds: 15000,
} as const;
export function validatePdfBytes(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > PDF_LIMITS.bytes)
    throw new Error("Choose a PDF up to 10 MB.");
  if (
    new TextDecoder()
      .decode(bytes.subarray(0, 8))
      .match(/^%PDF-(?:1\.[0-7]|2\.0)/) === null
  )
    throw new Error("This file is not a supported PDF.");
}
export function parseJobText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const labeled = (label: string) =>
    lines
      .find((line) =>
        new RegExp(`^(?:${label})\\s*[:：]\\s*\\S`, "i").test(line),
      )
      ?.replace(new RegExp(`^(?:${label})\\s*[:：]\\s*`, "i"), "") || "";
  const company = labeled("Company|Employer|Organization");
  const title =
    labeled("Job title|Position|Role|Title") ||
    lines.find(
      (line) =>
        /\b(intern(ship)?|co[ -]?op|graduate)\b/i.test(line) &&
        line.length <= 160,
    ) ||
    "";
  const location =
    labeled("Location|Work location") ||
    lines.find((line) => /^(Remote|Hybrid|On[ -]site)$/i.test(line)) ||
    "";
  const employment =
    labeled("Employment type|Job type|Position type") ||
    text.match(/\b(Co[ -]?op|Internship|Graduate)\b/i)?.[0] ||
    "";
  const type = /co[ -]?op/i.test(employment)
    ? "Co-op"
    : /intern/i.test(employment)
      ? "Internship"
      : /graduate/i.test(employment)
        ? "Graduate"
        : "";
  const rawDeadline = labeled(
    "Application deadline|Apply by|Deadline|Closing date",
  );
  let deadline = rawDeadline.match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || "";
  if (!deadline && /^[A-Za-z]+ \d{1,2},? \d{4}$/.test(rawDeadline)) {
    const date = new Date(`${rawDeadline} UTC`);
    if (Number.isFinite(date.getTime()))
      deadline = date.toISOString().slice(0, 10);
  }
  if (!dateInput.safeParse(deadline).success) deadline = "";
  const salary =
    labeled("Salary|Compensation|Pay|Pay range") ||
    text.match(
      /(?:\$|£|€)\s?\d[\d,.]*(?:\s*(?:-|–|to)\s*(?:\$|£|€)?\s?\d[\d,.]*)?(?:\s*(?:per|\/)\s*(?:hour|hr|year|annum))?/i,
    )?.[0] ||
    "";
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"\])]+/g)].map((match) =>
    match[0].replace(/[.,;]+$/, ""),
  );
  const url =
    labeled("Source URL|Job URL|Posting URL|Original posting URL") ||
    (urls.length === 1 ? urls[0] : "");
  return {
    company,
    title,
    location,
    type,
    deadline,
    salary,
    url,
    description: text,
  };
}
export type ImportedJob = ReturnType<typeof parseJobText>;

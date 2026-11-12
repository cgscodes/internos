import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "../src/lib/pdf/extract.ts";
import {
  PDF_LIMITS,
  parseJobText,
  validatePdfBytes,
} from "../src/lib/pdf/job-fields.ts";
import { jobLines, jobPdf } from "./helpers/job-pdf.mjs";

test("PDF selectable text extraction preserves description and identifies explicit job fields", async () => {
  const text = await extractPdfText(new Uint8Array(jobPdf(jobLines)));
  const fields = parseJobText(text);
  assert.equal(fields.company, "Import Test Studio");
  assert.equal(fields.title, "Engineering Intern");
  assert.equal(fields.location, "Remote");
  assert.equal(fields.type, "Internship");
  assert.equal(fields.deadline, "2099-12-01");
  assert.equal(fields.salary, "$25 per hour");
  assert.equal(fields.url, "https://example.test/intern");
  assert.equal(fields.description, text);
  assert.match(text, /Build thoughtful software/);
});
test("missing and ambiguous fields stay empty, unsupported employment is reviewed", () => {
  const fields = parseJobText(
    "General opportunity\nEmployment type: Full-time\nDeadline: 03/04/27\nhttps://one.test\nhttps://two.test",
  );
  for (const key of [
    "company",
    "title",
    "location",
    "type",
    "deadline",
    "salary",
    "url",
  ] as const)
    assert.equal(fields[key], "");
});
test("PDF size and actual signature are validated independently of MIME/name", () => {
  assert.throws(
    () => validatePdfBytes(new Uint8Array(PDF_LIMITS.bytes + 1)),
    /10 MB/,
  );
  assert.throws(
    () => validatePdfBytes(new TextEncoder().encode("<html>fake.pdf</html>")),
    /not a supported PDF/,
  );
  const boundary = new Uint8Array(PDF_LIMITS.bytes);
  boundary.set(new TextEncoder().encode("%PDF-1.7"));
  assert.doesNotThrow(() => validatePdfBytes(boundary));
});
test("corrupt, image-only, excessive-page, excessive-text, and cancelled PDFs fail gracefully", async () => {
  await assert.rejects(
    extractPdfText(new TextEncoder().encode("%PDF-1.7\ncorrupt")),
    /encrypted, corrupt, or unsupported/,
  );
  await assert.rejects(
    extractPdfText(new Uint8Array(jobPdf([]))),
    /No selectable text/,
  );
  await assert.rejects(
    extractPdfText(new Uint8Array(jobPdf(["Text"], 41))),
    /40 pages/,
  );
  await assert.rejects(
    extractPdfText(new Uint8Array(jobPdf(["x".repeat(20000)], 1, 200000))),
    /19,000/,
  );
  await assert.rejects(
    extractPdfText(new Uint8Array(jobPdf(jobLines)), AbortSignal.abort()),
    /cancelled/,
  );
});
test("PDF URLs remain inert description text; extraction performs no external fetches", async () => {
  const original = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (() => {
    fetched = true;
    throw new Error("External fetch forbidden");
  }) as typeof fetch;
  try {
    await extractPdfText(
      new Uint8Array(
        jobPdf([
          "Source URL: http://127.0.0.1/private",
          "https://external.test/asset",
        ]),
      ),
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("encrypted PDFs are rejected, including those that open without a password", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const name of ["encrypted-job", "encrypted-open-job"]) {
    const bytes = await readFile(
      new URL(`./fixtures/${name}.pdf`, import.meta.url),
    );
    await assert.rejects(extractPdfText(new Uint8Array(bytes)), /encrypted/i);
  }
});

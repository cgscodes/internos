import { z } from "zod";
import { dateInput, statuses } from "../validation/tracking.ts";
import type { Application } from "../models.ts";
import type { PdfPage, PdfTextItem } from "./extract.ts";

const jobTypes = ["Internship", "Co-op", "Graduate"] as const;
const identityFields = {
  id: z.uuid(),
  import_key: z.string().regex(/^[a-f0-9]{64}:\d+:\d+$/),
  job_id: z.uuid().nullable(),
};

// Extraction is evidence, not a promise that a row can already be saved.
export const extractedPdfRowSchema = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  location: z.string().default(""),
  applied_on: z.string().default(""),
  source_status: z.string().default(""),
  type: z.string().default(""),
});
export const importDraftSchema = extractedPdfRowSchema.extend({
  ...identityFields,
  source_applied_on: z.string().default(""),
  status: z.union([z.enum(statuses), z.literal("")]),
  type: z.union([z.enum(jobTypes), z.literal("")]),
  reviewed: z.boolean().default(false),
  selected: z.boolean().default(true),
  warnings: z.array(z.string()).default([]),
  page: z.int().positive(),
});
export type ImportRow = z.infer<typeof importDraftSchema>;

// The API and client confirmation use the same strict persistence contract.
export const finalizedImportRowSchema = z.object({
  ...identityFields,
  company: z
    .string()
    .trim()
    .min(1, "Company is required.")
    .max(120, "Company must be at most 120 characters."),
  title: z
    .string()
    .trim()
    .min(1, "Job title is required.")
    .max(160, "Job title must be at most 160 characters."),
  location: z
    .string()
    .trim()
    .max(160, "Location must be at most 160 characters."),
  applied_on: z
    .string()
    .trim()
    .transform((value) => parseAppliedDate(value) || value)
    .pipe(
      z.iso.date({
        error:
          "Enter a valid application date; missing dates stay unknown until corrected.",
      }),
    ),
  source_status: z.string().trim().max(120),
  status: z.enum(statuses, {
    error: "Status needs confirmation. Choose an InternOS status.",
  }),
  type: z.enum(jobTypes, {
    error:
      "Job type needs confirmation. Choose Internship, Co-op, or Graduate.",
  }),
  reviewed: z.literal(true, {
    error: "Confirm this row after reviewing its fields and status mapping.",
  }),
});
// Kept for existing import consumers; drafts must use importDraftSchema instead.
export const importRowSchema = finalizedImportRowSchema;
export const importFieldsSchema = finalizedImportRowSchema.omit({
  reviewed: true,
});

export function normalizeExtractedRow(
  input: z.input<typeof extractedPdfRowSchema>,
) {
  const raw = extractedPdfRowSchema.parse(input);
  return {
    ...raw,
    source_applied_on: raw.applied_on,
    applied_on: parseAppliedDate(raw.applied_on),
    status: mapHandshakeStatus(raw.source_status),
    type:
      jobTypes.find(
        (type) => type.toLowerCase() === raw.type.trim().toLowerCase(),
      ) || "",
  };
}
export function importValidationMessages(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  rowNumber: number,
) {
  return issues.map((issue) => `Row ${rowNumber}: ${issue.message}`);
}
const statusMappings = new Map<string, Application["status"]>([
  ...statuses.map((status) => [status.toLowerCase(), status] as const),
  ["interviewing", "Interview"],
  ["offered", "Offer"],
  ["hired", "Offer"],
]);
export function mapHandshakeStatus(value: string): Application["status"] | "" {
  return statusMappings.get(value.trim().toLowerCase()) || "";
}
export function parseAppliedDate(value: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text))
    return dateInput.safeParse(text).success ? text : "";
  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (numeric) {
    // Handshake short years explicitly denote 2000–2099; never use the current year.
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3];
    const iso = `${year}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`;
    return dateInput.safeParse(iso).success ? iso : "";
  }
  if (!/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(text)) return "";
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const parts = text.replace(",", "").split(/\s+/);
  const month = months.indexOf(parts[0].slice(0, 3).toLowerCase()) + 1;
  const iso = `${parts[2]}-${String(month).padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  return month && dateInput.safeParse(iso).success ? iso : "";
}
type Field = "company" | "title" | "applied_on" | "location" | "source_status";
function header(text: string): Field | undefined {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(company|employer|organization)$/.test(normalized)) return "company";
  if (/^(role|job title|job|position|title)$/.test(normalized)) return "title";
  if (
    /^(date applied|applied date|application date|applied on)$/.test(normalized)
  )
    return "applied_on";
  if (/^(location|locations)$/.test(normalized)) return "location";
  if (/^(status|application status)$/.test(normalized)) return "source_status";
}
function lines(items: PdfTextItem[]) {
  const result: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of [...items]
    .filter((i) => i.text.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = result.find(
      (l) =>
        Math.abs(l.y - item.y) <= Math.max(2, Math.min(item.height * 0.25, 4)),
    );
    if (line) line.items.push(item);
    else result.push({ y: item.y, items: [item] });
  }
  return result.map((l) => ({
    ...l,
    items: l.items.sort((a, b) => a.x - b.x),
  }));
}
/** Column starts come from actual page coordinates; rows are bounded by role/company anchors. */
export function parseTracker(
  pages: PdfPage[],
  fingerprint: string,
): ImportRow[] {
  const rows: ImportRow[] = [];
  let columns: { field: Field; x: number }[] = [];
  for (const page of pages) {
    const bands = lines(page.items);
    const firstHeaderY = bands.find(
      (band) =>
        band.items.some((item) => header(item.text) === "company") &&
        band.items.some((item) => header(item.text) === "title"),
    )?.y;
    let current:
      | {
          fields: Record<Field, string[]>;
          y: number;
          lastY: number;
          inactive: boolean;
        }
      | undefined;
    let ordinal = 0;
    const finish = () => {
      if (!current) return;
      const get = (field: Field) =>
        current!.fields[field].join(" ").replace(/\s+/g, " ").trim();
      const company = get("company"),
        title = get("title"),
        rawDate = get("applied_on"),
        source_status = get("source_status");
      if (!company && !title) {
        current = undefined;
        return;
      }
      const normalized = normalizeExtractedRow({
        company,
        title,
        location: get("location"),
        applied_on: rawDate,
        source_status,
      });
      const { applied_on, status } = normalized;
      const warnings: string[] = [];
      if (current.inactive)
        warnings.push(
          "Listing inactive; this does not indicate applicant rejection",
        );
      for (const [name, value] of [
        ["Company", company],
        ["Job title", title],
        ["Location", get("location")],
      ])
        if (/(?:…|\.{3})/.test(value))
          warnings.push(
            `${name} is truncated; preserve or correct from a known source`,
          );
      if (!applied_on)
        warnings.push("Missing or ambiguous application date; enter manually");
      if (!status)
        warnings.push(
          `Review source status: ${source_status || "missing"}. Closed/inactive is not rejection; Reviewed is not Interview`,
        );
      if (/hired/i.test(source_status))
        warnings.push("Hired maps to Offer; confirm this mapping");
      rows.push(
        importDraftSchema.parse({
          id: crypto.randomUUID(),
          import_key: `${fingerprint}:${page.number}:${++ordinal}`,
          ...normalized,
          job_id: null,
          reviewed: false,
          selected: true,
          warnings,
          page: page.number,
        }),
      );
      current = undefined;
    };
    for (const band of bands) {
      if (firstHeaderY !== undefined && band.y < firstHeaderY) continue;
      // pdf.js may split multiword headings into separate items.
      const candidates = band.items
        .map((item, index) => {
          for (let length = 3; length >= 1; length--) {
            const group = band.items.slice(index, index + length);
            if (
              group.length !== length ||
              group.some(
                (g, j) =>
                  j > 0 && g.x - (group[j - 1].x + group[j - 1].width) > 24,
              )
            )
              continue;
            const field = header(group.map((g) => g.text).join(" "));
            if (field) return { field, x: item.x };
          }
          return null;
        })
        .filter((v): v is { field: Field; x: number } => !!v);
      if (
        new Set(candidates.map((c) => c.field)).size >= 3 &&
        candidates.some((c) => c.field === "title") &&
        candidates.some((c) => c.field === "company")
      ) {
        finish();
        columns = [
          ...new Map(candidates.map((c) => [c.field, c])).values(),
        ].sort((a, b) => a.x - b.x);
        continue;
      }
      if (!columns.length || band.y > page.height - 32 || band.y < 24) continue;
      const all = band.items.map((i) => i.text).join(" ");
      if (
        /https?:\/\/|^\d+\s*(?:\/|of)\s*\d+$|^(?:Handshake|Home|Jobs|My jobs|Career center|Applications|Job tracker|Page \d+)$/i.test(
          all.trim(),
        )
      ) {
        finish();
        continue;
      }
      const cells: Partial<Record<Field, string[]>> = {};
      const inactive =
        /^(?:inactive(?: listing)?|closed listing|job (?:is )?(?:no longer available|unavailable)|listing (?:closed|inactive))$/i;
      for (const item of band.items) {
        const column = [...columns].reverse().find((c) => item.x >= c.x - 8);
        if (
          current &&
          band.y > current.y + 4 &&
          inactive.test(item.text.trim()) &&
          column?.field !== "source_status"
        ) {
          current.inactive = true;
          continue;
        }
        if (column) (cells[column.field] ||= []).push(item.text);
      }
      // Each table row starts at a company or role baseline, with dates/status as corroboration.
      const starts =
        !!(cells.company?.length || cells.title?.length) &&
        (!!cells.applied_on?.length ||
          !!cells.source_status?.length ||
          (!!cells.company?.length && !!cells.title?.length));
      if (
        starts &&
        current &&
        band.y - current.y > 8 &&
        (cells.applied_on?.length ||
          cells.source_status?.length ||
          band.y - current.lastY > 24)
      )
        finish();
      if (!current) {
        if (!starts) continue;
        current = {
          y: band.y,
          lastY: band.y,
          inactive: false,
          fields: {
            company: [],
            title: [],
            applied_on: [],
            location: [],
            source_status: [],
          },
        };
      }
      if (band.y - current.lastY > 64) {
        finish();
        continue;
      }
      current.lastY = band.y;
      for (const field of Object.keys(cells) as Field[])
        current.fields[field].push(...cells[field]!);
    }
    finish();
  }
  if (rows.length > 500)
    throw new Error("Import no more than 500 rows per session.");
  return rows;
}
const normal = (s: string) => s.trim().toLowerCase();
export function matchingApplication(
  row: Pick<
    ImportRow,
    "company" | "title" | "location" | "job_id" | "applied_on"
  >,
  applications: Application[],
) {
  return applications.find(
    (a) =>
      (row.job_id
        ? a.job_id === row.job_id
        : normal(a.company) === normal(row.company) &&
          normal(a.title) === normal(row.title) &&
          normal(a.location) === normal(row.location)) &&
      (a.applied_on === row.applied_on ||
        !["Rejected", "Withdrawn"].includes(a.status)),
  );
}
export function rowValidation(row: ImportRow) {
  return importRowSchema.safeParse(row);
}

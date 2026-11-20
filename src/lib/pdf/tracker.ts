import { z } from "zod";
import { dateInput, statuses } from "../validation/tracking.ts";
import type { Application } from "../models.ts";
import type { PdfPage, PdfTextItem } from "./extract.ts";

const jobTypes = ["Internship", "Co-op", "Graduate", "Unknown"] as const;
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
    .max(120, "Company must be at most 120 characters.")
    .refine(
      (value) => !value || /[\p{L}\p{N}]/u.test(value),
      "Company is required. Enter an identifiable company.",
    ),
  title: z
    .string()
    .trim()
    .min(1, "Job title is required.")
    .max(160, "Job title must be at most 160 characters.")
    .refine(
      (value) => !value || /[\p{L}\p{N}]/u.test(value),
      "Job title is required. Enter an identifiable job title.",
    ),
  location: z
    .string()
    .trim()
    .max(160, "Location must be at most 160 characters."),
  applied_on: z
    .string()
    .nullable()
    .transform((value) => value?.trim() || null)
    .transform((value) =>
      value === null ? null : parseAppliedDate(value) || value,
    )
    .pipe(
      z.iso
        .date({
          error: "Enter a valid application date or leave it blank if unknown.",
        })
        .nullable(),
    ),
  source_status: z.string().trim().max(120),
  status: z.enum(statuses, {
    error: "Status needs confirmation. Choose an InternOS status.",
  }),
  type: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? "Unknown" : value,
    z.enum(jobTypes, { error: "Choose a supported job type or Unknown." }),
  ),
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
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  const words = normalized.split(" ");
  return (
    statusMappings.get(normalized) ||
    (words.every((word) => word === words[0])
      ? statusMappings.get(words[0])
      : "") ||
    ""
  );
}
export function parseAppliedDate(value: string) {
  const text = value
    .trim()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-");
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
type Column = { field: Field; x: number; width: number; height: number };
const inactiveListing =
  /^(?:inactive(?: listing)?|closed listing|job (?:is )?(?:no longer available|unavailable)|listing (?:closed|inactive))$/i;
const sourceStatusLabel =
  /^(?:Applied|Interviewing|Interview|Assessment|Hired|Declined|Saved|Closed|Reviewed|Rejected|Withdrawn|Offer|Offered|Preparing|Ready|Inactive|Unavailable)$/i;
const dateFragment =
  /^(?:[\d/.,-]+|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+\d{1,2},?(?:\s+\d{2,4})?)?)$/i;

function tableHeader(bands: ReturnType<typeof lines>, index: number) {
  const band = bands[index];
  const columns: Column[] = [];
  for (let i = 0; i < band.items.length; i++) {
    const item = band.items[i];
    for (let count = 3; count >= 1; count--) {
      const group = band.items.slice(i, i + count);
      if (
        group.length !== count ||
        group.some(
          (part, j) =>
            j > 0 && part.x - (group[j - 1].x + group[j - 1].width) > 24,
        )
      )
        continue;
      const field = header(group.map((part) => part.text).join(" "));
      if (!field) continue;
      columns.push({
        field,
        x: item.x,
        width: group.at(-1)!.x + group.at(-1)!.width - item.x,
        height: item.height,
      });
      i += count - 1; // Keep the start of multiword headings, not the last matching word.
      break;
    }
  }
  let bottom = band.y;
  const below = bands[index + 1];
  for (const item of band.items) {
    if (
      !/^(?:Date|Application|Job)$/i.test(item.text.trim()) ||
      !below ||
      below.y - band.y > Math.max(18, item.height * 1.8)
    )
      continue;
    const suffix = below.items.find(
      (part) =>
        Math.abs(part.x - item.x) < 24 && header(`${item.text} ${part.text}`),
    );
    const field = suffix && header(`${item.text} ${suffix.text}`);
    if (field && suffix && !columns.some((c) => c.field === field)) {
      columns.push({
        field,
        x: item.x,
        width: Math.max(item.width, suffix.width),
        height: item.height,
      });
      bottom = below.y;
    }
  }
  if (
    !columns.some((c) => c.field === "company") ||
    !columns.some((c) => c.field === "title") ||
    columns.length < 3
  )
    return null;
  return {
    columns: [
      ...new Map(columns.map((column) => [column.field, column])).values(),
    ].sort((a, b) => a.x - b.x),
    bottom,
  };
}

function cellColumn(item: PdfTextItem, columns: Column[]): Field | undefined {
  const date = columns.find((c) => c.field === "applied_on");
  const location = columns.find((c) => c.field === "location");
  const status = columns.find((c) => c.field === "source_status");
  const role = columns.find((c) => c.field === "title");
  const text = item.text.trim();
  // Compact, centered metadata may begin left of its heading. Keep its geometric
  // neighborhood as a guard so a company named "Applied" is never moved to Status.
  if (
    date &&
    item.x > (role ? (role.x + role.width + date.x) / 2 : date.x - 60) &&
    item.x < (location?.x ?? status?.x ?? date.x + 140) &&
    (parseAppliedDate(text) ||
      (/^[\d/\s.,-]+$/.test(text) && /[/.,-]/.test(text)))
  )
    return "applied_on";
  if (
    status &&
    item.x > (location?.x ?? status.x - 100) &&
    (sourceStatusLabel.test(text) ||
      item.x >= status.x - Math.max(24, status.width))
  )
    return "source_status";
  const column = [...columns].reverse().find((c) => item.x >= c.x - 8);
  if (
    column?.field === "applied_on" &&
    location &&
    !dateFragment.test(text) &&
    item.x + item.width / 2 > (date!.x + date!.width + location.x) / 2
  )
    return "location";
  return column?.field;
}

/** Assign all five columns to shared row bands before normalizing any cell. */
export function parseTracker(
  pages: PdfPage[],
  fingerprint: string,
): ImportRow[] {
  const rows: ImportRow[] = [];
  let columns: Column[] = [];
  for (const page of pages) {
    const bands = lines(page.items);
    let ordinal = 0;
    const headers = bands.map((_, index) => tableHeader(bands, index));
    const firstHeader = headers.findIndex(Boolean);
    let body: {
      y: number;
      cells: Partial<Record<Field, PdfTextItem[]>>;
      inactive: boolean;
    }[] = [];
    const flush = () => {
      if (!body.length) return;
      type Group = { top: number; bottom: number; bands: typeof body };
      const groups: Group[] = [];
      // Company/role baselines define shared rows. Metadata is attached only after
      // every row boundary is known, including when it appears before the title.
      for (const band of body) {
        if (!band.cells.company?.length && !band.cells.title?.length) continue;
        const previous = groups.at(-1);
        const lineHeight = Math.max(
          8,
          ...Object.values(band.cells)
            .flat()
            .map((item) => item.height),
        );
        const hasBoth =
          !!band.cells.company?.length && !!band.cells.title?.length;
        const hasMetadata =
          !!band.cells.applied_on?.length || !!band.cells.source_status?.length;
        if (
          !previous ||
          band.y - previous.bottom > lineHeight * 1.8 ||
          (hasBoth && hasMetadata && band.y - previous.top > lineHeight * 0.8)
        )
          groups.push({ top: band.y, bottom: band.y, bands: [] });
        else previous.bottom = band.y;
      }
      // A dated/status-bearing table row with no identity must remain visible as
      // invalid, rather than donating its metadata to a neighboring application.
      for (const band of body) {
        if (
          !band.cells.applied_on?.length ||
          groups.some(
            (group) => band.y >= group.top - 24 && band.y <= group.bottom + 24,
          )
        )
          continue;
        const hasStatus = body.some(
          (other) =>
            other.cells.source_status?.length &&
            Math.abs(other.y - band.y) <= 20,
        );
        if (hasStatus) groups.push({ top: band.y, bottom: band.y, bands: [] });
      }
      groups.sort((a, b) => a.top - b.top);
      for (const band of body) {
        const group = groups.reduce<Group | undefined>(
          (nearest, candidate) =>
            !nearest ||
            Math.abs(band.y - (candidate.top + candidate.bottom) / 2) <
              Math.abs(band.y - (nearest.top + nearest.bottom) / 2)
              ? candidate
              : nearest,
          undefined,
        );
        if (group && band.y >= group.top - 24 && band.y <= group.bottom + 48)
          group.bands.push(band);
      }
      for (const group of groups) {
        const get = (field: Field) => {
          const items = group.bands
            .flatMap((band) => band.cells[field] || [])
            .sort((a, b) => a.y - b.y || a.x - b.x);
          return items
            .filter(
              (item, index) =>
                !items
                  .slice(0, index)
                  .some(
                    (other) =>
                      other.text === item.text &&
                      Math.abs(other.x - item.x) < 1 &&
                      Math.abs(other.y - item.y) < 1,
                  ),
            )
            .map((item) => item.text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        };
        const normalized = normalizeExtractedRow({
          company: get("company"),
          title: get("title"),
          location: get("location"),
          applied_on: get("applied_on"),
          source_status: get("source_status"),
        });
        const warnings: string[] = [];
        if (group.bands.some((band) => band.inactive))
          warnings.push("Listing inactive; applicant outcome unknown");
        for (const [label, value] of [
          ["Company", normalized.company],
          ["Job title", normalized.title],
          ["Location", normalized.location],
        ])
          if (/(?:…|\.{3})/.test(value)) warnings.push(`${label} is truncated`);
        if (/hired/i.test(normalized.source_status))
          warnings.push("Hired maps to Offer");
        rows.push(
          importDraftSchema.parse({
            ...normalized,
            id: crypto.randomUUID(),
            import_key: `${fingerprint}:${page.number}:${++ordinal}`,
            job_id: null,
            selected: true,
            reviewed: false,
            warnings,
            page: page.number,
          }),
        );
      }
      body = [];
    };
    let headerBottom = -Infinity;
    for (const [index, band] of bands.entries()) {
      if (firstHeader >= 0 && index < firstHeader) continue;
      const heading = headers[index];
      if (heading) {
        flush();
        columns = heading.columns;
        headerBottom = heading.bottom;
        continue;
      }
      if (
        !columns.length ||
        band.y <= headerBottom + 2 ||
        band.y < 24 ||
        band.y > page.height - 32
      )
        continue;
      const text = band.items
        .map((item) => item.text)
        .join(" ")
        .trim();
      if (
        /https?:\/\/|^\d+\s*(?:\/|of)\s*\d+$|^(?:Handshake|Home|Jobs|My jobs|Career center|Applications|Job tracker|Page \d+)$/i.test(
          text,
        )
      )
        continue;
      const cells: Partial<Record<Field, PdfTextItem[]>> = {};
      let inactive = false;
      for (const item of band.items) {
        const field = cellColumn(item, columns);
        if (
          inactiveListing.test(item.text.trim()) &&
          field !== "source_status"
        ) {
          inactive = true;
          continue;
        }
        if (field) (cells[field] ||= []).push(item);
      }
      body.push({ y: band.y, cells, inactive });
    }
    flush();
  }
  if (rows.length > 500)
    throw new Error("Import no more than 500 rows per session.");
  return rows;
}

/** Informational extraction warnings never participate in persistence validation. */
export function reviewImportRow(row: ImportRow) {
  const validation = importFieldsSchema.safeParse(row);
  const errors = validation.success
    ? []
    : validation.error.issues.map((issue) => issue.message);
  const warnings = row.warnings.filter(
    (warning) =>
      !/truncated|Missing or ambiguous|Review source status/i.test(warning),
  );
  for (const [label, value] of [
    ["Company", row.company],
    ["Job title", row.title],
    ["Location", row.location],
  ])
    if (/(?:…|\.{3})/.test(value)) warnings.push(`${label} is truncated`);
  return {
    errors,
    warnings: [...new Set(warnings)],
    eligible: errors.length === 0,
    needsAttention: errors.length > 0,
  };
}
export function prepareSelectedImports(rows: ImportRow[]) {
  const ready: {
    index: number;
    row: ImportRow;
    data: z.infer<typeof finalizedImportRowSchema>;
  }[] = [];
  const skipped: { index: number; row: ImportRow; errors: string[] }[] = [];
  rows.forEach((row, index) => {
    if (!row.selected) return;
    const result = finalizedImportRowSchema.safeParse(row);
    if (result.success) ready.push({ index, row, data: result.data });
    else
      skipped.push({
        index,
        row,
        errors: result.error.issues.map((issue) => issue.message),
      });
  });
  return { ready, skipped };
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

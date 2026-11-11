import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applicationSchema,
  profileSchema,
  statuses,
} from "../src/lib/models.ts";
const app = {
  id: "00000000-0000-4000-8000-000000000001",
  company: "Test",
  title: "Intern",
  location: "Remote",
  type: "Internship",
  source: "Manual",
  url: "",
  deadline: "",
  status: "Saved",
  notes: "",
  important_date: "",
  created_at: "2026-11-11T12:00:00.000Z",
};
test("all nine application stages validate", () => {
  for (const status of statuses)
    assert.ok(applicationSchema.safeParse({ ...app, status }).success);
});
test("rejects invalid links, dates, statuses, and excessive notes", () => {
  for (const fields of [
    { url: "javascript:alert(1)" },
    { url: "ftp://example.org" },
    { deadline: "2026-02-30" },
    { important_date: "tomorrow" },
    { status: "Unknown" },
    { notes: "x".repeat(10001) },
    { company: "" },
    { id: "not-a-uuid" },
  ])
    assert.equal(
      applicationSchema.safeParse({ ...app, ...fields }).success,
      false,
    );
});
test("profile requires a name and bounds personal data", () => {
  assert.equal(
    profileSchema.safeParse({
      full_name: " ",
      education: "",
      skills: "",
      interests: "",
      locations: "",
    }).success,
    false,
  );
  assert.ok(
    profileSchema.safeParse({
      full_name: "Alex",
      education: "CS",
      skills: "React",
      interests: "Design",
      locations: "Remote",
    }).success,
  );
});

test("accepts PostgreSQL timestamps with explicit UTC offsets", () => {
  assert.ok(
    applicationSchema.safeParse({
      ...app,
      created_at: "2026-11-11T12:00:00+00:00",
    }).success,
  );
});

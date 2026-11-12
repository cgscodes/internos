export class TrackingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new TrackingError(
      "An application or job already exists. Open the existing record, or reapply after rejection or withdrawal.",
      409,
    );
  if (error.code === "P0002" || error.code === "PGRST116")
    throw new TrackingError(
      "This record was not found or is not editable by your account.",
      404,
    );
  if (["42501", "23503", "28000"].includes(error.code || ""))
    throw new TrackingError(
      "You do not have permission to use this record.",
      403,
    );
  if (["PGRST202", "42703", "42P01"].includes(error.code || ""))
    throw new TrackingError(
      "The database needs the Phase 2 application-tracking migration. Apply 002_application_tracking.sql, then reload.",
      503,
    );
  // Do not return raw database errors: detail fields may contain private row values.
  throw new TrackingError(
    "Unable to save or load this record. Please try again.",
    500,
  );
}

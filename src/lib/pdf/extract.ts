import { PDF_LIMITS, validatePdfBytes } from "./job-fields.ts";

/** Data-only text extraction. No rendering, actions, annotations, attachments or remote resources. */
export async function extractPdfText(bytes: Uint8Array, signal?: AbortSignal) {
  validatePdfBytes(bytes);
  if (signal?.aborted) throw new Error("Import cancelled.");
  const pdf = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (signal?.aborted) throw new Error("Import cancelled.");
  const nativeWorker =
    typeof window === "undefined"
      ? undefined
      : new Worker(`/pdf.worker-${pdf.version}.min.mjs`, { type: "module" });
  const worker = nativeWorker
    ? pdf.PDFWorker.create({ port: nativeWorker })
    : undefined;
  class NoExternalData {
    async fetch() {
      throw new Error("External PDF resources are not supported.");
    }
  }
  const task = pdf.getDocument({
    worker,
    data: bytes,
    verbosity: 0,
    stopAtErrors: true,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    BinaryDataFactory: NoExternalData,
  });
  let rejectLimit: (error: Error) => void = () => {};
  const limit = new Promise<never>((_, reject) => {
    rejectLimit = reject;
  });
  let stopped = false;
  const stop = (message: string) => {
    stopped = true;
    nativeWorker?.terminate();
    worker?.destroy();
    rejectLimit(new Error(message));
    void task.destroy().catch(() => {});
  };
  const timeout = setTimeout(
    () => stop("PDF processing timed out. Try a shorter text PDF."),
    PDF_LIMITS.milliseconds,
  );
  const cancel = () => stop("Import cancelled.");
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await Promise.race([
      limit,
      (async () => {
        const document = await task.promise;
        if ((await document.getPermissions()) !== null)
          throw new Error(
            "Encrypted PDFs are not supported. Export an unencrypted copy.",
          );
        if (document.numPages > PDF_LIMITS.pages)
          throw new Error("Use a PDF with no more than 40 pages.");
        let text = "";
        for (let number = 1; number <= document.numPages; number++) {
          const page = await document.getPage(number);
          const stream = page
            .streamTextContent({ disableNormalization: false })
            .getReader();
          try {
            while (true) {
              const chunk = await stream.read();
              if (chunk.done) break;
              for (const item of chunk.value.items) {
                if (!("str" in item)) continue;
                text += item.str + (item.hasEOL ? "\n" : " ");
                if (text.length > PDF_LIMITS.characters)
                  throw new Error(
                    "Extracted text exceeds 19,000 characters. Use a shorter job PDF; text is never silently truncated.",
                  );
              }
            }
          } finally {
            stream.releaseLock();
          }
          text += "\n\n";
          page.cleanup();
        }
        if (!text.trim())
          throw new Error(
            "No selectable text found. Scanned/image PDFs need a text export; OCR is not available.",
          );
        return text.trim();
      })(),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Choose|This file|Use a PDF|Extracted|No selectable|PDF processing|Import cancelled)/.test(
        error.message,
      )
    )
      throw error;
    throw new Error(
      "This PDF is encrypted, corrupt, or unsupported. Export an unencrypted PDF with selectable text and try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    if (!stopped) await task.destroy().catch(() => {});
    nativeWorker?.terminate();
    worker?.destroy();
  }
}

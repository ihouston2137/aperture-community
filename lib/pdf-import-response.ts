/** Proxies and upload gateways may return HTML or an empty body on failure. */
export type PdfImportResult = { id: string; convertedPages?: number; fallbackPages?: number; warnings?: string[] };
export async function readPdfImportResponse(response: Response): Promise<PdfImportResult> {
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== "string" || !/^[a-f0-9]{24}$/i.test(result.id)) {
    const fallback = response.status === 413
      ? "The upload was rejected as too large. Try a smaller PDF."
      : response.status === 504 || response.status === 408
        ? "The import timed out. Check the presentations list before trying again."
        : "The import could not be confirmed. Check the presentations list before trying again.";
    throw new Error(typeof result?.error === "string" ? result.error : fallback);
  }
  return { id: result.id,
    ...(Number.isInteger(result.convertedPages) ? { convertedPages: result.convertedPages } : {}),
    ...(Number.isInteger(result.fallbackPages) ? { fallbackPages: result.fallbackPages } : {}),
    ...(Array.isArray(result.warnings) ? { warnings: result.warnings.filter((warning: unknown) => typeof warning === "string") } : {}),
  };
}

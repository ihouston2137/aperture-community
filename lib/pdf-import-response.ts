/** Proxies and upload gateways may return HTML or an empty body on failure. */
export async function readPdfImportResponse(response: Response): Promise<{ id: string }> {
  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.id !== "string" || !/^[a-f0-9]{24}$/i.test(result.id)) {
    const fallback = response.status === 413
      ? "The upload was rejected as too large. Try a smaller PDF."
      : response.status === 504 || response.status === 408
        ? "The import timed out. Check the presentations list before trying again."
        : "The import could not be confirmed. Check the presentations list before trying again.";
    throw new Error(typeof result?.error === "string" ? result.error : fallback);
  }
  return { id: result.id };
}

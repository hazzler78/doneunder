/** Only allow same-origin relative paths after OAuth. */
export function safeInternalPath(next: string | null | undefined, fallback = "/workspace") {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
    return next;
  }
  return fallback;
}

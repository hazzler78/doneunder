/** Build a workspace deep-link that prefills Hermes with highlighted preview text. */
export function workspaceFixHref(selectedText: string, note?: string) {
  const quote = selectedText.replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!quote) return "/workspace";
  const prompt = [
    "Please fix this part of my CV:",
    "",
    `"${quote}"`,
    "",
    note?.trim() || "Improve or correct it, and save the change.",
  ].join("\n");
  return `/workspace?fix=${encodeURIComponent(prompt)}`;
}

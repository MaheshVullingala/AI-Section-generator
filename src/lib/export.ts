import type { DesignSystem, SectionCode } from "./types";
import { tokensToCss } from "./tokens";

export interface ExportOptions {
  /** Include the design system tokens as CSS variables scoped to the section. */
  includeTokens: boolean;
}

function tokenCss(ds: DesignSystem, rootClass: string) {
  return tokensToCss(ds, `.${rootClass}`);
}

/** One paste-ready block: <style>, markup, <script>. */
export function buildSnippet(code: SectionCode, ds: DesignSystem, rootClass: string, opts: ExportOptions): string {
  const css = [opts.includeTokens ? tokenCss(ds, rootClass) : "", code.css].filter(Boolean).join("\n\n");
  const fonts = opts.includeTokens ? ds.fontImports.map((u) => `<link rel="stylesheet" href="${u}">`).join("\n") : "";
  return [
    `<!-- Generated section: ${rootClass} -->`,
    fonts,
    `<style>\n${css}\n</style>`,
    code.html,
    code.js.trim() ? `<script>\n${code.js}\n</script>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A complete HTML document for previewing or sharing the section on its own. */
export function buildStandalonePage(code: SectionCode, ds: DesignSystem, rootClass: string, title = "Section preview"): string {
  const fonts = ds.fontImports.map((u) => `<link rel="stylesheet" href="${u}">`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
${fonts}
<style>
${tokensToCss(ds, ":root")}
html, body { margin: 0; padding: 0; background: var(--color-background, #fff); }
${code.css}
</style>
</head>
<body>
${code.html}
${code.js.trim() ? `<script>\n${code.js}\n</script>` : ""}
</body>
</html>`;
}

export function downloadFile(filename: string, contents: string, type = "text/html") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

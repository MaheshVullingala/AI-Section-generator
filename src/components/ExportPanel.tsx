"use client";
import { useState } from "react";
import { buildSnippet, buildStandalonePage, downloadFile } from "@/lib/export";
import type { DesignSystem, SectionCode } from "@/lib/types";
import { Button, Card, cx } from "./ui";

type Tab = "full" | "html" | "css" | "js";

export function ExportPanel({ code, designSystem, rootClass, title }: { code: SectionCode; designSystem: DesignSystem; rootClass: string; title: string }) {
  const [tab, setTab] = useState<Tab>("full");
  const [includeTokens, setIncludeTokens] = useState(true);
  const [copied, setCopied] = useState("");
  const snippet = buildSnippet(code, designSystem, rootClass, { includeTokens });
  const text = tab === "full" ? snippet : tab === "html" ? code.html : tab === "css" ? code.css : code.js;
  const fileBase = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tab);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("error");
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">Export</h3>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={includeTokens} onChange={(e) => setIncludeTokens(e.target.checked)} />
          Include design tokens in the snippet
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Turn tokens off if the site already defines the same CSS variables globally. The standalone page always includes them.
      </p>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["full", "Full code"],
            ["html", "HTML"],
            ["css", "CSS"],
            ["js", "JS"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx("rounded-md px-3 py-1.5 text-sm", tab === t ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700")}
          >
            {label}
          </button>
        ))}
      </div>
      <pre className="max-h-80 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">{text || "(empty)"}</pre>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>{copied === tab ? "Copied" : copied === "error" ? "Copy failed" : "Copy code"}</Button>
        <Button variant="secondary" onClick={() => downloadFile(`${fileBase}-snippet.html`, snippet)}>
          Download snippet .html
        </Button>
        <Button variant="secondary" onClick={() => downloadFile(`${fileBase}.html`, buildStandalonePage(code, designSystem, rootClass, title))}>
          Download standalone page
        </Button>
      </div>
    </Card>
  );
}

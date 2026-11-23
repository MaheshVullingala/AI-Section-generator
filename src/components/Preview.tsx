"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buildStandalonePage } from "@/lib/export";
import type { Breakpoint, DesignSystem, SectionCode } from "@/lib/types";
import { sortBreakpoints } from "./BreakpointEditor";
import { cx } from "./ui";

// Reports the document height to the parent so the iframe can size itself.
// The iframe is sandboxed without allow-same-origin, so postMessage is the only channel.
const HEIGHT_REPORTER = `<script>(function(){var id=window.name;function s(){parent.postMessage({sgFrame:id,height:document.documentElement.scrollHeight},"*")}new ResizeObserver(s).observe(document.documentElement);window.addEventListener("load",s);s();})();</script>`;

function Frame({ srcDoc, width, maxWidth, maxHeight }: { srcDoc: string; width: number; maxWidth: number; maxHeight?: number }) {
  const name = `sgf-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.sgFrame === name && typeof e.data.height === "number") setHeight(Math.min(e.data.height, 6000));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [name]);
  const scale = Math.min(1, maxWidth / width);
  const h = maxHeight ? Math.min(height, maxHeight) : height;
  return (
    <div style={{ width: width * scale, height: h * scale }} className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <iframe
        name={name}
        title="Section preview"
        sandbox="allow-scripts allow-popups allow-forms"
        srcDoc={srcDoc.replace("</body>", `${HEIGHT_REPORTER}</body>`)}
        style={{ width, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="absolute left-0 top-0 border-0"
      />
    </div>
  );
}

export function Preview({
  code,
  designSystem,
  rootClass,
  breakpoints,
  compact,
}: {
  code: SectionCode;
  designSystem: DesignSystem;
  rootClass: string;
  breakpoints: Breakpoint[];
  compact?: boolean;
}) {
  const bps = sortBreakpoints(breakpoints);
  const [mode, setMode] = useState<"single" | "all">("single");
  const [width, setWidth] = useState(bps[bps.length - 1]?.width ?? 1280);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1000);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const srcDoc = useMemo(() => buildStandalonePage(code, designSystem, rootClass), [code, designSystem, rootClass]);

  if (compact) {
    return (
      <div ref={wrapRef} className="w-full">
        <Frame srcDoc={srcDoc} width={bps[bps.length - 1]?.width ?? 1280} maxWidth={avail} maxHeight={1200} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {bps.map((b) => (
          <button
            key={b.name + b.width}
            onClick={() => {
              setMode("single");
              setWidth(b.width);
            }}
            className={cx(
              "rounded-md border px-3 py-1.5 text-sm",
              mode === "single" && width === b.width ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700",
            )}
          >
            {b.name} <span className="text-slate-500">{b.width}</span>
          </button>
        ))}
        <button
          onClick={() => setMode("all")}
          className={cx(
            "rounded-md border px-3 py-1.5 text-sm",
            mode === "all" ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700",
          )}
        >
          All side by side
        </button>
        {mode === "single" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            Custom
            <input type="range" min={320} max={1920} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            <span className="w-16 tabular-nums">{width}px</span>
          </label>
        )}
      </div>
      <div ref={wrapRef} className="w-full overflow-x-auto rounded-xl bg-slate-100 p-3">
        {mode === "single" ? (
          <div className="flex justify-center">
            <Frame srcDoc={srcDoc} width={width} maxWidth={avail - 24} />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            {bps.map((b) => (
              <div key={b.name + b.width} className="shrink-0 space-y-1">
                <p className="text-xs font-medium text-slate-600">
                  {b.name} · {b.width}px
                </p>
                <Frame srcDoc={srcDoc} width={b.width} maxWidth={Math.max(220, b.width * 0.4)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

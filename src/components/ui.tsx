"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded px-3.5 py-2 font-mono text-xs font-medium uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        variant === "primary" && "sg-glow bg-indigo-600 text-white hover:bg-indigo-500",
        variant === "secondary" && "border border-indigo-600 bg-transparent text-indigo-600 hover:bg-indigo-600 hover:text-white sg-glow",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100",
        variant === "danger" && "text-red-600 hover:bg-red-50",
        className,
      )}
    />
  );
}

export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {children}
      {help && <span className="block text-xs text-slate-500">{help}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(inputCls, "min-h-24 font-[inherit]", p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Card({ children, className, lock }: { children: ReactNode; className?: string; lock?: boolean }) {
  return <div className={cx("rounded-md border border-slate-200 bg-white p-5", lock && "sg-lock", className)}>{children}</div>;
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded border px-3 py-1.5 text-sm transition",
        active ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
      )}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

/** A live signal trace, used in place of a spinner while Claude works. */
export function Waveform({ className }: { className?: string }) {
  return (
    <svg className={cx("sg-wave", className)} viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden>
      <path d="M0 20 L12 20 L18 6 L26 34 L34 10 L42 30 L50 20 L62 20 L68 8 L76 32 L84 12 L92 28 L100 20 L120 20" />
    </svg>
  );
}

/** Section Generator mark: a chip outline with a blinking core. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="relative inline-block shrink-0 rounded-[4px] border-2 border-indigo-600" style={{ width: size, height: size }} aria-hidden>
      <span className="sg-blink absolute inset-[4px] rounded-[1px] bg-indigo-600" />
    </span>
  );
}

export { cx };

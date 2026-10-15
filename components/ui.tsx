"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Spinner } from "@/components/indikator-proses";
import { cn } from "@/lib/format";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "danger-quiet" | "ghost";
  busy?: boolean;
};

const buttonVariant = {
  primary: "border border-transparent bg-aksi text-white shadow-sm hover:bg-aksi/90 focus-visible:ring-aksi-lembut",
  secondary: "border border-garis-kuat bg-kartu text-tinta-2 shadow-sm hover:border-aksi/50 hover:bg-kanvas hover:text-tinta focus-visible:ring-aksi-lembut",
  danger: "border border-transparent bg-gagal text-white shadow-sm hover:bg-gagal/90 focus-visible:ring-gagal-lembut",
  "danger-quiet": "border border-transparent bg-transparent text-gagal hover:bg-gagal-lembut focus-visible:ring-gagal-lembut",
  ghost: "border border-transparent bg-transparent text-tinta-2 hover:bg-kanvas hover:text-tinta focus-visible:ring-aksi-lembut",
} as const;

export function Button({
  variant = "secondary",
  busy = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-55",
        buttonVariant[variant],
        className,
      )}
    >
      {busy && <Spinner className="h-4 w-4 shrink-0" />}
      {children}
    </button>
  );
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ id, label, required, optional, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-tinta-2">
        {label}
        {required && <span className="ml-1 text-gagal" aria-hidden="true">*</span>}
        {optional && <span className="ml-1 font-normal text-tinta-3">(opsional)</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-relaxed text-tinta-3">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-garis-kuat bg-kartu px-3 text-[14px] text-tinta shadow-sm outline-none transition placeholder:text-tinta-3 focus:border-aksi focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:cursor-not-allowed disabled:bg-kanvas disabled:text-tinta-3",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] w-full resize-y rounded-lg border border-garis-kuat bg-kartu px-3 py-2.5 text-[14px] leading-relaxed text-tinta shadow-sm outline-none transition placeholder:text-tinta-3 focus:border-aksi focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:cursor-not-allowed disabled:bg-kanvas disabled:text-tinta-3",
        className,
      )}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  wrapClassName?: string;
};

export function Select({ className, wrapClassName, children, ...props }: SelectProps) {
  return (
    <span className={cn("relative inline-flex w-full min-w-0", wrapClassName)}>
      <select
        {...props}
        className={cn(
          "h-10 w-full min-w-0 appearance-none rounded-lg border border-garis-kuat bg-kartu py-2 pl-3 pr-9 text-[14px] text-tinta shadow-sm outline-none transition focus:border-aksi focus-visible:ring-4 focus-visible:ring-aksi-lembut disabled:cursor-not-allowed disabled:bg-kanvas disabled:text-tinta-3",
          className,
        )}
      >
        {children}
      </select>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-3">
        <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    </span>
  );
}

type FeedbackProps = {
  kind: "success" | "error" | "warning" | "info";
  children: ReactNode;
  className?: string;
};

const feedbackStyle = {
  success: "border-lulus/25 bg-lulus-lembut text-lulus",
  error: "border-gagal/30 bg-gagal-lembut text-gagal",
  warning: "border-tertunda/30 bg-tertunda-lembut text-tertunda",
  info: "border-aksi/25 bg-aksi-lembut text-aksi",
} as const;

export function Feedback({ kind, children, className }: FeedbackProps) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
      className={cn("flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed", feedbackStyle[kind], className)}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="mt-0.5 h-4 w-4 shrink-0">
        {kind === "success" ? (
          <path d="m4.5 10.25 3.5 3.5 7.5-7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        ) : kind === "error" ? (
          <path d="M10 6.25v4.5m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        ) : (
          <path d="M10 6.25v4.5m0 3h.01M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
        )}
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

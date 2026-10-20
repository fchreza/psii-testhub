"use client";

// Adapted from useLayouts Save Button (MIT); see docs/licenses/uselayouts-MIT.txt.
// Source: https://uselayouts.com/r/save-button.json
import type { ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui";
import { Spinner } from "@/components/indikator-proses";
import { cn } from "@/lib/format";

type SaveButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  children: string;
  loadingText: string;
  success?: boolean;
  successText?: string;
};

/** Status dikendalikan pemanggil, bukan timer: galat tidak pernah dianggap sukses. */
export function SaveButton({
  children, loadingText, success = false, successText = "Tersimpan",
  busy = false, disabled, className, ...props
}: SaveButtonProps) {
  const reducedMotion = useReducedMotion();
  const animate = reducedMotion === false;
  const status = busy ? "loading" : success ? "success" : "idle";
  const text = busy ? loadingText : success ? successText : children;

  return (
    <Button
      {...props}
      disabled={disabled || busy}
      aria-label={props["aria-label"] ?? text}
      aria-busy={busy || undefined}
      className={cn(
        "relative whitespace-nowrap",
        busy && "cursor-wait disabled:bg-kanvas disabled:text-tinta-2 disabled:opacity-100",
        className,
      )}
    >
      {/* Reservasi ukuran kedua label mencegah tombol dan field sebelahnya bergeser. */}
      <span className="grid items-center justify-items-center" aria-hidden="true">
        {[children, loadingText, ...(success ? [successText] : [])].map((label, index) => (
          <span key={index} className="invisible col-start-1 row-start-1">{label}</span>
        ))}
        <AnimatePresence initial={false}>
          <motion.span
            key={status}
            className="col-start-1 row-start-1 inline-block"
            initial={animate ? { opacity: 0, y: 3, filter: "blur(3px)" } : false}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={animate ? { opacity: 0, y: -3, filter: "blur(3px)" } : { opacity: 0 }}
            transition={{ duration: animate ? 0.16 : 0 }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{text}</span>
      <AnimatePresence initial={false}>
        {status !== "idle" && (
          <motion.span
            key="indicator"
            aria-hidden="true"
            initial={animate ? { opacity: 0, scale: 0.75 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: animate ? 0.75 : 1 }}
            transition={{ duration: animate ? 0.16 : 0 }}
            className={cn(
              "pointer-events-none absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full ring-2 ring-kartu",
              busy ? "bg-kanvas text-tinta-2" : "bg-lulus text-white",
            )}
          >
            {busy ? <Spinner className="size-3.5" /> : (
              <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                <path d="m4.5 10 3.5 3.5 7.5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

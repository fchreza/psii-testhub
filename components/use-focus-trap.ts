import { useEffect, useRef } from "react";

/** Keep keyboard focus inside an open modal and restore it to the opener on close. */
export function useFocusTrap<T extends HTMLElement>(open: boolean, onEscape?: () => void) {
  const dialogRef = useRef<T>(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const daftarFokus = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((el) => !el.hasAttribute("hidden") && el.getClientRects().length > 0);

    const frame = requestAnimationFrame(() => {
      const awal = dialog.querySelector<HTMLElement>("[autofocus]") ?? daftarFokus()[0] ?? dialog;
      awal.focus();
    });

    const tanganiKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onEscapeRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const fokus = daftarFokus();
      if (!fokus.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      if (event.shiftKey && (document.activeElement === pertama || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        terakhir.focus();
      } else if (!event.shiftKey && (document.activeElement === terakhir || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        pertama.focus();
      }
    };

    document.addEventListener("keydown", tanganiKeyboard, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", tanganiKeyboard, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return dialogRef;
}

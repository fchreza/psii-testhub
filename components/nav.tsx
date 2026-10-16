"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { TombolKeluar } from "@/components/tombol-keluar";
import type { Peran } from "@/lib/gerbang";

export function Nav({ aktif, peran }: {
  aktif?: "beranda" | "proyek" | "dashboard" | "admin";
  peran: Peran;
}) {
  type Kunci = "beranda" | "proyek" | "dashboard" | "admin";
  const penguji = peran === "INTERNAL_KEMENKEU" || peran === "EKSTERNAL_KEMENKEU";
  const tautan: { href: string; label: string; kunci: Kunci }[] = penguji ? [
    { href: "/proyek", label: "Proyek", kunci: "proyek" },
  ] : [
    { href: "/", label: "Beranda", kunci: "beranda" },
    { href: "/dashboard", label: "Dashboard", kunci: "dashboard" },
    { href: "/proyek", label: "Proyek", kunci: "proyek" },
  ];
  if (peran === "ADMIN" || peran === "PIMPINAN") tautan.push({ href: "/dashboard/admin", label: "Administrasi", kunci: "admin" });

  const [menuMobileTerbuka, setMenuMobileTerbuka] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const tombolMenuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuMobileTerbuka) return;

    const tutupKlikLuar = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target)) {
        setMenuMobileTerbuka(false);
      }
    };
    const tutupEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuMobileTerbuka(false);
        tombolMenuRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", tutupKlikLuar);
    document.addEventListener("keydown", tutupEscape);
    return () => {
      document.removeEventListener("pointerdown", tutupKlikLuar);
      document.removeEventListener("keydown", tutupEscape);
    };
  }, [menuMobileTerbuka]);

  return (
    <nav
      ref={navRef}
      aria-label="Navigasi utama"
      onBlurCapture={(event) => {
        const berikutnya = event.relatedTarget;
        if (menuMobileTerbuka && berikutnya instanceof Node && !event.currentTarget.contains(berikutnya)) {
          setMenuMobileTerbuka(false);
        }
      }}
      className="sticky top-0 z-20 border-b border-garis bg-kartu/95 shadow-xs shadow-tinta/2.5 backdrop-blur-sm"
    >
      <div className="relative mx-auto flex min-h-14 max-w-[1400px] items-center gap-1 px-3 sm:px-6">
        <Link href={penguji ? "/proyek" : "/"} aria-label="PSII TestHub" className="mr-2 flex shrink-0 items-center rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-aksi">
          <Image src="/brand/psii-testhub-symbol.svg" alt="" width={64} height={64}
            className="h-7 w-7 sm:hidden" />
          <Image src="/brand/psii-testhub-logo-horizontal-color.svg" alt="" width={482} height={104}
            className="hidden h-7 w-auto sm:block" />
        </Link>

        <div className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
          {tautan.map((t) => (
            <Link key={t.href} href={t.href}
              aria-current={aktif === t.kunci ? "page" : undefined}
              className={
                (aktif === t.kunci
                  ? "bg-aksi-lembut font-semibold text-aksi"
                  : "font-medium text-tinta-2 hover:bg-kanvas hover:text-tinta") +
                " shrink-0 rounded-lg px-2.5 py-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aksi sm:px-3 sm:text-[13.5px]"
              }>
              {t.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden shrink-0 pl-2 md:block">
          <TombolKeluar />
        </div>

        <button
          ref={tombolMenuRef}
          type="button"
          aria-label={menuMobileTerbuka ? "Tutup menu navigasi" : "Buka menu navigasi"}
          aria-expanded={menuMobileTerbuka}
          aria-controls="nav-mobile-panel"
          onClick={() => setMenuMobileTerbuka((terbuka) => !terbuka)}
          className="sentuh ml-auto inline-flex min-w-11 items-center justify-center gap-2 rounded-lg border border-garis-kuat bg-kartu px-3 text-[13.5px] font-semibold text-tinta transition-colors hover:bg-kanvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aksi md:hidden"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            {menuMobileTerbuka ? (
              <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            )}
          </svg>
          <span>Menu</span>
        </button>

        <div
          id="nav-mobile-panel"
          hidden={!menuMobileTerbuka}
          className="absolute left-3 right-3 top-full z-30 mt-2 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-garis bg-kartu p-2 shadow-lg shadow-tinta/10 md:hidden"
        >
          <ul className="grid gap-1">
            {tautan.map((t) => (
              <li key={t.href}>
                <Link href={t.href}
                  aria-current={aktif === t.kunci ? "page" : undefined}
                  onClick={() => setMenuMobileTerbuka(false)}
                  className={
                    (aktif === t.kunci
                      ? "bg-aksi-lembut font-semibold text-aksi"
                      : "text-tinta-2 hover:bg-kanvas hover:text-tinta") +
                    " flex min-h-11 items-center rounded-lg px-3 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aksi"
                  }>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-garis px-1 pt-2">
            <TombolKeluar />
          </div>
        </div>
      </div>
    </nav>
  );
}

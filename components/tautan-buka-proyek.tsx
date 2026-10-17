"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { Spinner } from "@/components/indikator-proses";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
};

export function TautanBukaProyek({ href, children, className, "aria-label": ariaLabel }: Props) {
  const [membuka, setMembuka] = useState(false);

  function tandaiMembuka(event: MouseEvent<HTMLAnchorElement>) {
    // Jangan menutupi halaman saat membuka tab baru atau memakai navigasi modifikasi.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.currentTarget.target === "_blank") return;
    setMembuka(true);
  }

  return (
    <>
      <Link href={href} onClick={tandaiMembuka} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
      {membuka && (
        <div role="status" aria-live="polite" aria-atomic="true" aria-busy="true"
          className="fixed inset-0 z-[100] grid place-items-center bg-tinta/35 p-4 backdrop-blur-[2px]">
          <div className="flex w-full max-w-sm items-center gap-4 rounded-lg border border-garis bg-kartu p-5 shadow-xl sm:p-6">
            <Spinner className="h-8 w-8 shrink-0 text-aksi" />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-tinta">Membuka proyek…</p>
              <p className="mt-1 text-[13px] leading-relaxed text-tinta-2">Memuat ringkasan dan skenario.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

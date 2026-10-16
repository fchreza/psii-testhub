import Link from "next/link";
import Image from "next/image";
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

  return (
    <nav aria-label="Navigasi utama" className="sticky top-0 z-20 border-b border-garis bg-kartu/95 shadow-xs shadow-tinta/2.5 backdrop-blur-sm">
      <div className="mx-auto flex min-h-14 max-w-[1400px] items-center gap-1 px-3 sm:px-6">
        <Link href={penguji ? "/proyek" : "/"} aria-label="PSII TestHub" className="mr-2 flex shrink-0 items-center rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-aksi">
          <Image src="/brand/psii-testhub-symbol.svg" alt="" width={64} height={64}
            className="h-7 w-7 sm:hidden" />
          <Image src="/brand/psii-testhub-logo-horizontal-color.svg" alt="" width={482} height={104}
            className="hidden h-7 w-auto sm:block" />
        </Link>
        <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {tautan.map((t) => (
            <Link key={t.href} href={t.href}
              aria-current={aktif === t.kunci ? "page" : undefined}
              className={
                (aktif === t.kunci
                  ? "bg-aksi-lembut font-semibold text-aksi"
                  : "font-medium text-tinta-2 hover:bg-kanvas hover:text-tinta") +
                " shrink-0 rounded-lg px-2.5 py-2 text-[13px] transition-colors sm:px-3 sm:text-[13.5px]"
              }>
              {t.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto shrink-0 pl-2">
          <TombolKeluar />
        </div>
      </div>
    </nav>
  );
}

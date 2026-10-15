import Link from "next/link";
import { TombolKeluar } from "@/components/tombol-keluar";
import type { Peran } from "@/lib/gerbang";

export function Nav({ aktif, peran }: {
  aktif?: "beranda" | "proyek" | "dashboard" | "admin";
  peran: Peran;
}) {
  type Kunci = "beranda" | "proyek" | "dashboard" | "admin";
  const tautan: { href: string; label: string; kunci: Kunci }[] = [
    { href: "/", label: "Beranda", kunci: "beranda" },
    { href: "/dashboard", label: "Dashboard", kunci: "dashboard" },
    { href: "/proyek", label: "Proyek", kunci: "proyek" },
  ];
  if (peran === "ADMIN" || peran === "PIMPINAN") tautan.push({ href: "/dashboard/admin", label: "Administrasi", kunci: "admin" });

  return (
    <nav aria-label="Navigasi utama" className="sticky top-0 z-20 border-b border-garis bg-kartu/95 shadow-sm shadow-tinta/[0.025] backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[1400px] items-center gap-1 px-3 sm:px-6">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 rounded-md px-1 py-1 focus-visible:outline-2 focus-visible:outline-aksi">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-tinta text-[11px] font-bold text-white">T</span>
          <span className="hidden text-[14px] font-bold tracking-tight text-tinta sm:block">TestHub</span>
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

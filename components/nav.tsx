import Link from "next/link";
import { TombolKeluar } from "@/components/tombol-keluar";
import type { Peran } from "@/lib/gerbang";

/**
 * Navigasi atas.
 *
 * KENAPA TIDAK ADA SIDEBAR: aplikasi ini dipakai untuk melihat dan mengisi
 * tabel, bukan berpindah-pindah cepat. Beberapa tautan di atas cukup, dan
 * tanpa sidebar tidak ada keadaan "terbuka/tertutup" yang harus diingat.
 *
 * Padding dan jarak diperkecil di layar kecil: diukur di 375px, versi pertama
 * membuat tombol "Keluar" berakhir di 382px — melewati lebar layar sehingga
 * seluruh halaman bisa digulir ke kanan.
 */
export function Nav({ aktif, peran }: { aktif?: "beranda" | "proyek" | "pengguna"; peran: Peran }) {
  type Kunci = "beranda" | "proyek" | "pengguna";
  const tautan: { href: string; label: string; kunci: Kunci }[] = [
    { href: "/", label: "Beranda", kunci: "beranda" },
    { href: "/proyek", label: "Proyek", kunci: "proyek" },
  ];
  if (peran === "ADMIN") {
    tautan.push({ href: "/pengguna", label: "Pengguna", kunci: "pengguna" });
  }

  return (
    <nav className="border-b border-garis bg-kartu">
      <div className="mx-auto flex max-w-[1400px] items-center gap-0.5 px-3 py-2 sm:gap-1 sm:px-6 sm:py-2.5">
        <span className="mr-2 hidden shrink-0 text-[15px] font-bold tracking-tight text-tinta sm:block">
          TestHub
        </span>
        {tautan.map((t) => (
          <Link key={t.href} href={t.href}
            aria-current={aktif === t.kunci ? "page" : undefined}
            className={
              (aktif === t.kunci
                ? "rounded font-medium text-aksi"
                : "rounded text-tinta-2 hover:bg-kanvas") +
              " shrink-0 px-2 py-2 text-[13.5px] sm:px-3 sm:text-[14px]"
            }>
            {t.label}
          </Link>
        ))}
        <div className="ml-auto min-w-0 shrink-0">
          <TombolKeluar />
        </div>
      </div>
    </nav>
  );
}

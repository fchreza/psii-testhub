import { NextResponse, type NextRequest } from "next/server";
import { originSama } from "@/lib/validasi-bukti";

/**
 * Gerbang lapis PERTAMA: membelokkan permintaan yang jelas belum masuk.
 *
 * KENAPA MASIH PERLU PEMERIKSAAN DI HALAMAN DAN API:
 * Middleware hanya melihat COOKIE ADA ATAU TIDAK — ia tidak bisa membaca
 * database (berjalan di edge, tanpa koneksi Postgres) dan tidak memverifikasi
 * tanda tangannya. Jadi ini menahan permintaan kosong, bukan menggantikan
 * pemeriksaan sesungguhnya di `lib/gerbang.ts`.
 *
 * Dua lapis dengan pembagian tugas yang jelas: yang ini murah dan cepat, yang
 * di dalam yang menentukan.
 */
const PUBLIK = [
  "/masuk", "/api/v1/masuk",
  "/pulihkan-sandi", "/api/v1/sandi/lupa", "/api/v1/sandi/atur",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Semua perubahan API berasal dari antarmuka same-origin; Origin kosong,
  // null, atau lintas situs ditolak di gerbang pertama. Cookie tetap SameSite=Lax.
  if (pathname.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (!originSama(req.headers.get("origin"), req.url)) {
      return NextResponse.json({ pesan: "Permintaan lintas situs ditolak." }, { status: 403 });
    }
  }

  if (PUBLIK.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  if (!req.cookies.has("th_sesi")) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ pesan: "Belum masuk" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/masuk";
    // Simpan tujuan supaya setelah masuk pengguna kembali ke halaman yang tadi
    // dibuka, bukan dilempar ke beranda.
    if (pathname !== "/") url.searchParams.set("lanjut", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Kecualikan berkas statis. Tanpa pengecualian ini, permintaan CSS dan
   * gambar ikut diblokir — halaman masuk akan tampil tanpa gaya sama sekali,
   * dan itu terlihat seperti aplikasinya rusak.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};

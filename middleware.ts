import { NextResponse, type NextRequest } from "next/server";

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
const PUBLIK = ["/masuk", "/api/v1/masuk"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    if (pathname !== "/") url.searchParams.set("lanjut", pathname);
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

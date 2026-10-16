import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * SESI DAN SANDI
 *
 * KENAPA TIDAK PAKAI PUSTAKA AUTENTIKASI:
 * Kebutuhan di sini satu: "apakah orang ini pengguna terdaftar, dan apa
 * perannya?" Pustaka autentikasi membawa model izin yang jauh lebih besar dari
 * kebutuhan ini, dan bagian yang tidak dipakai tetap harus dipahami saat ada
 * masalah.
 *
 * Yang TIDAK dikorbankan: sandi tetap di-hash scrypt (bukan SHA), cookie tetap
 * ditandatangani, dan perbandingan tetap waktu-tetap.
 */

const NAMA_COOKIE = "th_sesi";
const UMUR_DETIK = 60 * 60 * 24 * 14; // 14 hari

function kunci(): string {
  const k = process.env.SESI_SECRET;
  if (!k || k.length < 16) {
    /*
     * Gagal KERAS, bukan diam-diam memakai nilai bawaan.
     * Kunci cadangan berarti siapa pun yang membaca kode ini bisa memalsukan
     * sesi — dan tidak ada yang tampak rusak.
     */
    throw new Error(
      "SESI_SECRET belum diatur (minimal 16 karakter). Buat dengan: openssl rand -hex 32",
    );
  }
  return k;
}

/** Hash sandi. scrypt sudah ada di Node, jadi tidak perlu dependensi. */
export function hashSandi(sandi: string): string {
  const garam = randomBytes(16);
  const kunciTurunan = scryptSync(sandi, garam, 64);
  return `scrypt$${garam.toString("hex")}$${kunciTurunan.toString("hex")}`;
}

/**
 * Periksa sandi.
 *
 * KENAPA timingSafeEqual: perbandingan `===` berhenti di karakter pertama yang
 * berbeda, jadi waktu balasannya membocorkan berapa karakter awal yang sudah
 * benar. Untuk sandi, itu cukup untuk menebak huruf demi huruf.
 */
export function periksaSandi(sandi: string, tersimpan: string | null): boolean {
  if (!tersimpan) return false;
  const [algo, garamHex, kunciHex] = tersimpan.split("$");
  if (algo !== "scrypt" || !garamHex || !kunciHex) return false;
  const kunciTurunan = scryptSync(sandi, Buffer.from(garamHex, "hex"), 64);
  const asli = Buffer.from(kunciHex, "hex");
  if (asli.length !== kunciTurunan.length) return false;
  return timingSafeEqual(asli, kunciTurunan);
}

/** Bangkitkan sandi awal. Tanpa karakter yang mudah tertukar: 0/O, 1/l/I. */
export function sandiAcak(panjang = 12): string {
  const abjad = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return [...randomBytes(panjang)].map((x) => abjad[x % abjad.length]).join("");
}

/** Tanda tangan isi cookie: `<userId>.<versiSesi>.<kedaluwarsa>.<tandaTangan>` */
function tandatangani(isi: string): string {
  return createHmac("sha256", kunci()).update(isi).digest("hex").slice(0, 32);
}

export function buatToken(userId: string, versi = 0): string {
  const kedaluwarsa = Math.floor(Date.now() / 1000) + UMUR_DETIK;
  const isi = `${userId}.${versi}.${kedaluwarsa}`;
  return `${isi}.${tandatangani(isi)}`;
}

export function bacaToken(token: string | undefined): { userId: string; versi: number } | null {
  if (!token) return null;
  const bagian = token.split(".");
  let userId: string, versi: number, kedaluwarsaStr: string, tanda: string, isi: string;
  if (bagian.length === 3) {
    // Cookie versi lama tetap dapat dipakai sampai kedaluwarsa; versi default 0.
    [userId, kedaluwarsaStr, tanda] = bagian;
    versi = 0; isi = `${userId}.${kedaluwarsaStr}`;
  } else if (bagian.length === 4) {
    const [versiStr] = bagian.slice(1, 2);
    [userId, , kedaluwarsaStr, tanda] = bagian;
    versi = Number(versiStr);
    if (!Number.isSafeInteger(versi) || versi < 0) return null;
    isi = `${userId}.${versi}.${kedaluwarsaStr}`;
  } else return null;
  const benar = tandatangani(isi);
  if (tanda.length !== benar.length) return null;
  if (!timingSafeEqual(Buffer.from(tanda), Buffer.from(benar))) return null;
  const kedaluwarsa = Number(kedaluwarsaStr);
  if (!Number.isFinite(kedaluwarsa) || kedaluwarsa < Math.floor(Date.now() / 1000)) return null;
  return { userId, versi };
}

export async function pasangCookie(userId: string, versi = 0) {
  const c = await cookies();
  c.set(NAMA_COOKIE, buatToken(userId, versi), {
    httpOnly: true,      // JavaScript di halaman tidak boleh membacanya
    sameSite: "lax",     // tidak ikut dari situs lain, tapi ikut saat dibuka dari tautan
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UMUR_DETIK,
  });
}

export async function hapusCookie() {
  const c = await cookies();
  c.delete(NAMA_COOKIE);
}

/** Sesi saat ini, atau null. Tidak melempar kalau kunci belum diatur. */
export async function sesiSekarang(): Promise<{ userId: string; versi: number } | null> {
  try {
    const c = await cookies();
    return bacaToken(c.get(NAMA_COOKIE)?.value);
  } catch {
    return null;
  }
}

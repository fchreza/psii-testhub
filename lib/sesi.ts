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

/** Tanda tangan isi cookie: `<userId>.<kedaluwarsa>.<tandaTangan>` */
function tandatangani(isi: string): string {
  return createHmac("sha256", kunci()).update(isi).digest("hex").slice(0, 32);
}

export function buatToken(userId: string): string {
  const kedaluwarsa = Math.floor(Date.now() / 1000) + UMUR_DETIK;
  const isi = `${userId}.${kedaluwarsa}`;
  return `${isi}.${tandatangani(isi)}`;
}

export function bacaToken(token: string | undefined): string | null {
  if (!token) return null;
  const bagian = token.split(".");
  if (bagian.length !== 3) return null;
  const [userId, kedaluwarsaStr, tanda] = bagian;
  const benar = tandatangani(`${userId}.${kedaluwarsaStr}`);
  if (tanda.length !== benar.length) return null;
  if (!timingSafeEqual(Buffer.from(tanda), Buffer.from(benar))) return null;
  const kedaluwarsa = Number(kedaluwarsaStr);
  if (!Number.isFinite(kedaluwarsa) || kedaluwarsa < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

export async function pasangCookie(userId: string) {
  const c = await cookies();
  c.set(NAMA_COOKIE, buatToken(userId), {
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
export async function sesiSekarang(): Promise<{ userId: string } | null> {
  try {
    const c = await cookies();
    const id = bacaToken(c.get(NAMA_COOKIE)?.value);
    return id ? { userId: id } : null;
  } catch {
    return null;
  }
}

/** Batas percobaan masuk. Disimpan di memori proses. */
const percobaan = new Map<string, { jumlah: number; sampai: number }>();
const MAKS_PERCOBAAN = 10;
const JEDA_MS = 15 * 60 * 1000;

/**
 * KENAPA PER-EMAIL, BUKAN PER-IP:
 * Satu kantor biasanya keluar lewat satu alamat IP. Membatasi per-IP berarti
 * satu orang salah ketik sepuluh kali akan mengunci seluruh subdit.
 */
export function bolehCoba(email: string): { boleh: boolean; sisaMenit?: number } {
  const c = percobaan.get(email.toLowerCase());
  if (!c || c.sampai <= Date.now()) return { boleh: true };
  if (c.jumlah < MAKS_PERCOBAAN) return { boleh: true };
  return { boleh: false, sisaMenit: Math.ceil((c.sampai - Date.now()) / 60000) };
}

export function catatGagal(email: string) {
  const k = email.toLowerCase();
  const c = percobaan.get(k);
  if (!c || c.sampai <= Date.now()) percobaan.set(k, { jumlah: 1, sampai: Date.now() + JEDA_MS });
  else c.jumlah += 1;
}

export function bersihkanPercobaan(email: string) {
  percobaan.delete(email.toLowerCase());
}

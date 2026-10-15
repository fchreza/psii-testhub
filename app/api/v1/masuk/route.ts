import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { periksaSandi, pasangCookie, bolehCoba, catatGagal, bersihkanPercobaan } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isi = await req.json().catch(() => null) as { email?: string; sandi?: string } | null;

  if (!isi?.email || !isi?.sandi) {
    return NextResponse.json({ pesan: "Email dan sandi wajib diisi" }, { status: 400 });
  }

  const email = isi.email.trim().toLowerCase().slice(0, 160);

  const batas = bolehCoba(email);
  if (!batas.boleh) {
    return NextResponse.json(
      { pesan: `Terlalu banyak percobaan. Coba lagi dalam ${batas.sisaMenit} menit.` },
      { status: 429 },
    );
  }

  try {
    const [p] = (await klienMentah.unsafe(
      `SELECT id, nama, peran, sandi_hash, sesi_versi, aktif FROM th_users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    )) as unknown as { id: string; nama: string; peran: string; sandi_hash: string | null; sesi_versi: number; aktif: boolean }[];

    /*
     * Pesan galat SENGAJA SAMA untuk "email tidak terdaftar", "sandi salah",
     * dan "belum diaktifkan".
     *
     * KENAPA: pesan yang berbeda memberi tahu penyerang email mana yang
     * terdaftar. Itu informasi yang tidak perlu diberikan.
     */
    const gagal = NextResponse.json({ pesan: "Email atau sandi salah" }, { status: 401 });

    if (!p) {
      catatGagal(email);
      // Tetap jalankan pemeriksaan sandi tiruan supaya waktu balasannya tidak
      // membedakan "email tidak ada" dari "sandi salah".
      periksaSandi(isi.sandi, null);
      return gagal;
    }
    if (!p.aktif || !periksaSandi(isi.sandi, p.sandi_hash)) {
      catatGagal(email);
      return gagal;
    }

    bersihkanPercobaan(email);
    await pasangCookie(p.id, Number(p.sesi_versi));
    return NextResponse.json({ ok: true, nama: p.nama, peran: p.peran });
  } catch (e) {
    console.error("[masuk]", e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal masuk" }, { status: 500 });
  }
}

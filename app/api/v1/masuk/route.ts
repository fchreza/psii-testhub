import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { periksaSandi, pasangCookie } from "@/lib/sesi";
import { bolehCoba, bersihkanPercobaan } from "@/lib/pembatas-login";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isi = await req.json().catch(() => null) as { email?: string; sandi?: string } | null;

  if (!isi?.email || !isi?.sandi) {
    return NextResponse.json({ pesan: "Email dan sandi wajib diisi" }, { status: 400 });
  }

  const email = isi.email.trim().toLowerCase().slice(0, 160);

  try {
    const batas = await bolehCoba(email);
    if (!batas.boleh) {
      return NextResponse.json(
        { pesan: `Terlalu banyak percobaan. Coba lagi dalam ${batas.sisaMenit} menit.` },
        { status: 429 },
      );
    }

    const [p] = (await klienMentah.unsafe(
      `SELECT id, nama, peran, sandi_hash, sesi_versi, aktif FROM th_users WHERE lower(email) = $1 LIMIT 1`,
      [email],
    )) as unknown as { id: string; nama: string; peran: string; sandi_hash: string | null; sesi_versi: number; aktif: boolean }[];

    /* Pesan galat sengaja sama agar tidak membocorkan apakah email terdaftar. */
    const gagal = NextResponse.json({ pesan: "Email atau sandi salah" }, { status: 401 });

    if (!p) {
      // Pemeriksaan sandi tiruan menjaga waktu respons serupa untuk email tak dikenal.
      periksaSandi(isi.sandi, null);
      return gagal;
    }
    if (!p.aktif || !periksaSandi(isi.sandi, p.sandi_hash)) return gagal;

    await bersihkanPercobaan(email);
    await pasangCookie(p.id, Number(p.sesi_versi));
    return NextResponse.json({ ok: true, nama: p.nama, peran: p.peran });
  } catch (e) {
    console.error("[masuk] layanan autentikasi/limiter tidak tersedia", e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Layanan masuk sementara tidak tersedia." }, { status: 503 });
  }
}

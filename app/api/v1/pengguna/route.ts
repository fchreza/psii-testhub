import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { bolehKelolaPengguna, PERAN_AKUN, wajibMasukApi } from "@/lib/gerbang";
import { hashSandi, sandiAcak } from "@/lib/sesi";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  const saya = auth.pengguna;
  if (!bolehKelolaPengguna(saya.peran)) {
    return NextResponse.json({ pesan: "Hanya Admin yang boleh mengelola pengguna." }, { status: 403 });
  }
  const isi = await req.json().catch(() => null) as
    { aksi?: string; email?: string; nama?: string; jabatan?: string; peran?: string; userId?: string } | null;
  if (!isi?.aksi) return NextResponse.json({ pesan: "Aksi wajib diisi." }, { status: 400 });

  try {
    if (isi.aksi === "tambah") {
      const email = (isi.email ?? "").trim().toLowerCase().slice(0, 160);
      const nama = (isi.nama ?? "").trim().slice(0, 120);
      const jabatan = (isi.jabatan ?? "").trim().slice(0, 80) || null;
      const peran = isi.peran ?? "INTERNAL_PSII";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ pesan: "Email tidak sah." }, { status: 400 });
      if (!nama) return NextResponse.json({ pesan: "Nama wajib diisi." }, { status: 400 });
      if (!(PERAN_AKUN as readonly string[]).includes(peran)) return NextResponse.json({ pesan: "Peran tidak sah." }, { status: 400 });
      const [ada] = (await klienMentah.unsafe(`SELECT id FROM th_users WHERE lower(email) = $1`, [email])) as unknown as { id: string }[];
      if (ada) return NextResponse.json({ pesan: "Email itu sudah terdaftar." }, { status: 409 });
      const sandi = sandiAcak();
      const [baru] = (await klienMentah.unsafe(
        `INSERT INTO th_users (email, nama, jabatan, peran, sandi_hash, aktif)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
        [email, nama, jabatan, peran, hashSandi(sandi)],
      )) as unknown as { id: string }[];
      return NextResponse.json({ id: baru.id, sandi });
    }

    if (!["aktif", "nonaktif", "sandi_baru", "ubah_peran"].includes(isi.aksi)) {
      return NextResponse.json({ pesan: "Aksi tidak dikenal." }, { status: 400 });
    }
    if (!isi.userId || !UUID.test(isi.userId)) return NextResponse.json({ pesan: "ID pengguna tidak sah." }, { status: 400 });

    if (isi.aksi === "nonaktif") {
      if (isi.userId === saya.id) return NextResponse.json({ pesan: "Tidak bisa menonaktifkan akun sendiri." }, { status: 400 });
      const [target] = (await klienMentah.unsafe(`SELECT peran, aktif FROM th_users WHERE id = $1::uuid`, [isi.userId])) as unknown as { peran: string; aktif: boolean }[];
      if (!target) return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
      if (target.aktif && target.peran === "ADMIN") {
        const [n] = (await klienMentah.unsafe(`SELECT count(*)::int AS n FROM th_users WHERE aktif AND peran = 'ADMIN'`)) as unknown as { n: number }[];
        if (n.n <= 1) return NextResponse.json({ pesan: "Admin aktif terakhir tidak dapat dinonaktifkan." }, { status: 400 });
      }
      await klienMentah.unsafe(`UPDATE th_users SET aktif = false, sesi_versi = sesi_versi + 1 WHERE id = $1::uuid`, [isi.userId]);
      return NextResponse.json({ ok: true });
    }

    if (isi.aksi === "aktif") {
      const hasil = await klienMentah.unsafe(`UPDATE th_users SET aktif = true, sesi_versi = sesi_versi + 1 WHERE id = $1::uuid`, [isi.userId]);
      if (hasil.count === 0) return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    if (isi.aksi === "sandi_baru") {
      const sandi = sandiAcak();
      const hasil = await klienMentah.unsafe(`UPDATE th_users SET sandi_hash = $1, sesi_versi = sesi_versi + 1 WHERE id = $2::uuid`, [hashSandi(sandi), isi.userId]);
      if (hasil.count === 0) return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
      return NextResponse.json({ ok: true, sandi });
    }

    const peranBaru = isi.peran ?? "";
    if (!(PERAN_AKUN as readonly string[]).includes(peranBaru)) return NextResponse.json({ pesan: "Peran tidak sah." }, { status: 400 });
    const [target] = (await klienMentah.unsafe(`SELECT peran, aktif FROM th_users WHERE id = $1::uuid`, [isi.userId])) as unknown as { peran: string; aktif: boolean }[];
    if (!target) return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
    if (isi.userId === saya.id && peranBaru !== "ADMIN") return NextResponse.json({ pesan: "Anda tidak dapat menurunkan peran akun sendiri." }, { status: 400 });
    if (target.aktif && target.peran === "ADMIN" && peranBaru !== "ADMIN") {
      const [n] = (await klienMentah.unsafe(`SELECT count(*)::int AS n FROM th_users WHERE aktif AND peran = 'ADMIN'`)) as unknown as { n: number }[];
      if (n.n <= 1) return NextResponse.json({ pesan: "Peran Admin aktif terakhir tidak dapat diubah." }, { status: 400 });
    }
    await klienMentah.unsafe(`UPDATE th_users SET peran = $1 WHERE id = $2::uuid`, [peranBaru, isi.userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[pengguna]", isi.aksi, e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal menyimpan perubahan pengguna." }, { status: 500 });
  }
}

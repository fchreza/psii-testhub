import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { wajibMasukApi } from "@/lib/gerbang";
import { hashSandi, sandiAcak } from "@/lib/sesi";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const PERAN_SAH = ["ADMIN","PIMPINAN","PM","QA","DEVELOPER","BUSINESS_USER","EKSTERNAL"];

/**
 * Kelola pengguna.
 *
 * KENAPA HANYA ADMIN: pengguna eksternal harus diundang dengan sengaja, dan
 * peran menentukan apa yang boleh mereka lihat. Kalau semua orang bisa
 * menambah pengguna, batas akses per-proyek jadi tidak berarti.
 */
export async function POST(req: Request) {
  // Sesi diperiksa SEBELUM isi permintaan disentuh: bentuk balasan tidak boleh
  // memberi tahu apa pun kepada yang belum masuk.
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  if (saya.peran !== "ADMIN") {
    return NextResponse.json({ pesan: "Hanya admin yang boleh mengelola pengguna" }, { status: 403 });
  }

  const isi = await req.json().catch(() => null) as
    { aksi?: string; email?: string; nama?: string; jabatan?: string; peran?: string;
      userId?: string } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });

  try {
    if (isi.aksi === "tambah") {
      const email = (isi.email ?? "").trim().toLowerCase().slice(0, 160);
      const nama = (isi.nama ?? "").trim().slice(0, 120);
      const peran = (isi.peran ?? "QA").trim();

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return NextResponse.json({ pesan: "Email tidak sah" }, { status: 400 });
      }
      if (!nama) return NextResponse.json({ pesan: "Nama wajib diisi" }, { status: 400 });
      if (!PERAN_SAH.includes(peran)) {
        return NextResponse.json({ pesan: `Peran tidak dikenal: ${peran}` }, { status: 400 });
      }

      const [ada] = (await klienMentah.unsafe(
        `SELECT id FROM th_users WHERE lower(email) = $1`, [email],
      )) as unknown as { id: string }[];
      if (ada) return NextResponse.json({ pesan: "Email itu sudah terdaftar" }, { status: 409 });

      const sandi = sandiAcak();
      const [baru] = (await klienMentah.unsafe(
        `INSERT INTO th_users (email, nama, jabatan, peran, sandi_hash, aktif)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
        [email, nama, (isi.jabatan ?? "").trim().slice(0, 80) || null, peran, hashSandi(sandi)],
      )) as unknown as { id: string }[];

      /*
       * Sandi awal dikembalikan SEKALI di sini, dan tidak pernah bisa dibaca
       * lagi. Hanya hash-nya yang tersimpan — jadi kalau admin kehilangan sandi
       * ini, jalannya adalah membuat sandi baru, bukan melihat yang lama.
       */
      return NextResponse.json({ id: baru.id, sandi });
    }

    if (isi.aksi === "nonaktif" || isi.aksi === "aktif") {
      if (!isi.userId || !UUID.test(isi.userId)) {
        return NextResponse.json({ pesan: "userId tidak sah" }, { status: 400 });
      }
      // Jangan biarkan admin menonaktifkan dirinya sendiri: kalau itu terjadi
      // dan ia satu-satunya admin, tidak ada yang bisa mengaktifkannya kembali.
      if (isi.userId === saya.id && isi.aksi === "nonaktif") {
        return NextResponse.json(
          { pesan: "Tidak bisa menonaktifkan akun sendiri" }, { status: 400 },
        );
      }
      await klienMentah.unsafe(
        `UPDATE th_users SET aktif = $1 WHERE id = $2::uuid`,
        [isi.aksi === "aktif", isi.userId],
      );
      return NextResponse.json({ ok: true });
    }

    if (isi.aksi === "sandi_baru") {
      if (!isi.userId || !UUID.test(isi.userId)) {
        return NextResponse.json({ pesan: "userId tidak sah" }, { status: 400 });
      }
      const sandi = sandiAcak();
      await klienMentah.unsafe(
        `UPDATE th_users SET sandi_hash = $1 WHERE id = $2::uuid`,
        [hashSandi(sandi), isi.userId],
      );
      return NextResponse.json({ ok: true, sandi });
    }

    if (isi.aksi === "ubah_peran") {
      if (!isi.userId || !UUID.test(isi.userId)) {
        return NextResponse.json({ pesan: "userId tidak sah" }, { status: 400 });
      }
      if (!PERAN_SAH.includes(isi.peran ?? "")) {
        return NextResponse.json({ pesan: "Peran tidak sah" }, { status: 400 });
      }
      await klienMentah.unsafe(
        `UPDATE th_users SET peran = $1 WHERE id = $2::uuid`, [isi.peran as string, isi.userId],
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (e) {
    console.error("[pengguna]", isi.aksi, e instanceof Error ? e.message : e);
    return NextResponse.json({ pesan: "Gagal menyimpan" }, { status: 500 });
  }
}

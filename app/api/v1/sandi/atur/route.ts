import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { klienMentah } from "@/db";
import { hashSandi } from "@/lib/sesi";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const isi = await req.json().catch(() => null) as { token?: string; sandi?: string } | null;
  const token = (isi?.token ?? "").trim();
  const sandi = isi?.sandi ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ pesan: "Tautan pemulihan tidak sah atau sudah kedaluwarsa." }, { status: 400 });
  }
  if (sandi.length < 12 || sandi.length > 256) {
    return NextResponse.json({ pesan: "Sandi baru harus terdiri dari 12–256 karakter." }, { status: 400 });
  }
  const secret = process.env.SESI_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ pesan: "Layanan pemulihan sandi belum dikonfigurasi. Hubungi Admin." }, { status: 503 });
  }
  const tokenHash = createHmac("sha256", secret).update(`token:${token}`).digest("hex");

  try {
    const selesai = await klienMentah.begin(async (tx) => {
      const [reset] = (await tx.unsafe(
        `SELECT id, user_id FROM th_password_resets
         WHERE token_hash = $1 AND digunakan_pada IS NULL AND kedaluwarsa_pada > now() AND user_id IS NOT NULL
         FOR UPDATE`, [tokenHash],
      )) as unknown as { id: number; user_id: string }[];
      if (!reset) return false;

      const hash = hashSandi(sandi);
      const [user] = (await tx.unsafe(
        `UPDATE th_users SET sandi_hash = $1, sesi_versi = sesi_versi + 1
         WHERE id = $2::uuid AND aktif = true RETURNING id`, [hash, reset.user_id],
      )) as unknown as { id: string }[];
      await tx.unsafe(
        `UPDATE th_password_resets SET digunakan_pada = now()
         WHERE user_id = $1::uuid AND digunakan_pada IS NULL`, [reset.user_id],
      );
      return Boolean(user);
    });

    if (!selesai) return NextResponse.json({ pesan: "Tautan pemulihan tidak sah atau sudah kedaluwarsa." }, { status: 400 });
    return NextResponse.json({ ok: true, pesan: "Sandi berhasil diperbarui. Silakan masuk dengan sandi baru." });
  } catch (e) {
    console.error("[sandi-atur] gagal memperbarui sandi", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ pesan: "Sandi belum dapat diperbarui. Coba lagi nanti atau hubungi Admin." }, { status: 503 });
  }
}

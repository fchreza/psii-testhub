import { createHmac, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { klienMentah } from "@/db";

export const dynamic = "force-dynamic";
const PESAN_NETRAL = "Jika email terdaftar, tautan pemulihan akan dikirim. Tautan berlaku selama 30 menit.";

function hmac(label: string, value: string): string {
  const secret = process.env.SESI_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESI_SECRET tidak dikonfigurasi");
  return createHmac("sha256", secret).update(`${label}:${value}`).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function konfigurasiEmail() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const rawUrl = process.env.APP_URL?.trim();
  if (!key || !from || !rawUrl || /[\r\n]/.test(from)) return null;
  try {
    const url = new URL(rawUrl);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return { key, from, baseUrl: url.toString().replace(/\/$/, "") };
  } catch { return null; }
}

export async function POST(req: Request) {
  const config = konfigurasiEmail();
  if (!config) {
    return NextResponse.json({ pesan: "Layanan pemulihan sandi belum dikonfigurasi. Hubungi Admin." }, { status: 503 });
  }
  const isi = await req.json().catch(() => null) as { email?: string } | null;
  const email = (isi?.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ pesan: "Masukkan alamat email yang sah." }, { status: 400 });
  }

  const ip = req.headers.get("x-real-ip")?.trim()
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const emailHash = hmac("email", email);
  const ipHash = hmac("ip", ip);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hmac("token", token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  try {
    const request = await klienMentah.begin(async (tx) => {
      await tx.unsafe(`DELETE FROM th_password_resets WHERE dibuat_pada < now() - interval '48 hours'`);
      const [rate] = (await tx.unsafe(
        `SELECT count(*) FILTER (WHERE email_hash = $1)::int AS per_email,
                count(*) FILTER (WHERE ip_hash = $2)::int AS per_ip
         FROM th_password_resets WHERE dibuat_pada > now() - interval '15 minutes'`, [emailHash, ipHash],
      )) as unknown as { per_email: number; per_ip: number }[];
      if (rate.per_email >= 3 || rate.per_ip >= 20) return null;

      const [user] = (await tx.unsafe(
        `SELECT id, email, nama FROM th_users WHERE lower(email) = $1 AND aktif = true LIMIT 1`, [email],
      )) as unknown as { id: string; email: string; nama: string }[];
      if (user) {
        await tx.unsafe(
          `UPDATE th_password_resets SET digunakan_pada = now()
           WHERE user_id = $1::uuid AND digunakan_pada IS NULL`, [user.id],
        );
      }
      const [record] = (await tx.unsafe(
        `INSERT INTO th_password_resets (user_id, email_hash, ip_hash, token_hash, kedaluwarsa_pada)
         VALUES ($1::uuid, $2, $3, $4, $5) RETURNING id`,
        [user?.id ?? null, emailHash, ipHash, user ? tokenHash : null, user ? expiresAt : null],
      )) as unknown as { id: number }[];
      return user ? { id: record.id, email: user.email, nama: user.nama } : null;
    });

    if (!request) return NextResponse.json({ ok: true, pesan: PESAN_NETRAL });

    const link = `${config.baseUrl}/pulihkan-sandi?token=${encodeURIComponent(token)}`;
    const nama = escapeHtml(request.nama);
    const text = `Halo ${request.nama},\n\nGunakan tautan berikut untuk membuat sandi baru PSII TestHub. Tautan berlaku 30 menit dan hanya dapat digunakan sekali:\n${link}\n\nJika Anda tidak meminta pemulihan sandi, abaikan email ini.`;
    const html = `<!doctype html><html><body style="margin:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#172337"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e8ef"><tr><td style="padding:32px"><p style="margin:0 0 8px;font-size:12px;line-height:18px;font-weight:bold;letter-spacing:1px;color:#52647c">PSII TESTHUB</p><h1 style="margin:0 0 16px;font-size:22px;line-height:30px;color:#172337">Buat sandi baru</h1><p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#44536a">Halo ${nama}, kami menerima permintaan pemulihan sandi untuk akun Anda.</p><p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#44536a">Gunakan tautan di bawah. Tautan berlaku 30 menit dan hanya dapat digunakan sekali.</p><p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#176b62;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:bold;padding:13px 20px">Buat sandi baru</a></p><p style="margin:0 0 12px;font-size:12px;line-height:18px;color:#66758a">Jika tombol tidak dapat dibuka, salin tautan berikut ke browser:</p><p style="margin:0 0 24px;word-break:break-all;font-size:12px;line-height:18px;color:#176b62">${link}</p><p style="margin:0;font-size:12px;line-height:18px;color:#66758a">Jika Anda tidak meminta pemulihan, abaikan email ini.</p></td></tr></table></td></tr></table></body></html>`;
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `psii-reset-${tokenHash}`,
      },
      body: JSON.stringify({ from: config.from, to: [request.email], subject: "Tautan pemulihan sandi PSII TestHub", text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!sent.ok) {
      await klienMentah.unsafe(`UPDATE th_password_resets SET digunakan_pada = now() WHERE id = $1`, [request.id]);
      console.error("[sandi-lupa] provider gagal mengirim email; status", sent.status);
      return NextResponse.json({ ok: true, pesan: PESAN_NETRAL });
    }
    return NextResponse.json({ ok: true, pesan: PESAN_NETRAL });
  } catch (e) {
    console.error("[sandi-lupa] gagal memproses permintaan", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ pesan: "Permintaan belum dapat diproses. Coba lagi nanti atau hubungi Admin." }, { status: 503 });
  }
}

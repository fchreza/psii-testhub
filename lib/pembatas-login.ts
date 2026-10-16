import { createHmac } from "node:crypto";
import { klienMentah } from "@/db";
import { SQL_CADANGKAN_PERCOBAAN_LOGIN } from "@/lib/pembatas-login-sql";

const MAKS_PERCOBAAN = 10;
const JEDA = "15 minutes";

function hashEmail(email: string): string {
  const rahasia = process.env.SESI_SECRET;
  if (!rahasia || rahasia.length < 16) throw new Error("SESI_SECRET belum diatur dengan benar.");
  return createHmac("sha256", rahasia).update(`psii-testhub:login:${email.toLowerCase()}`).digest("hex");
}

/** Cadangkan percobaan sebelum verifikasi sandi agar request serentak ikut dibatasi. */
export async function bolehCoba(email: string): Promise<{ boleh: boolean; sisaMenit?: number }> {
  const [baris] = (await klienMentah.unsafe(
    SQL_CADANGKAN_PERCOBAAN_LOGIN,
    [hashEmail(email), JEDA, MAKS_PERCOBAAN],
  )) as unknown as { boleh: boolean; sisa: number }[];

  // TTL data hash lama dibersihkan opportunistically; tidak ada email mentah disimpan.
  await klienMentah.unsafe(`DELETE FROM th_login_rate_limits WHERE updated_at < now() - interval '1 day'`);
  return baris?.boleh
    ? { boleh: true }
    : { boleh: false, sisaMenit: Number(baris?.sisa ?? 1) };
}

export async function bersihkanPercobaan(email: string): Promise<void> {
  await klienMentah.unsafe(`DELETE FROM th_login_rate_limits WHERE email_hash = $1`, [hashEmail(email)]);
}

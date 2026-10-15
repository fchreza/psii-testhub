/**
 * Buat akun admin pertama.
 *
 * KENAPA PERLU SKRIP TERPISAH: halaman kelola pengguna hanya bisa dibuka
 * admin, dan admin pertama belum ada — jadi tidak ada jalan masuk lewat
 * antarmuka. Ini satu-satunya cara yang masuk akal: dibuat dari terminal.
 */
import { writeFileSync, chmodSync } from "node:fs";
import { klienMentah } from "../db";
import { hashSandi, sandiAcak } from "../lib/sesi";

async function main() {
  const [email, nama, jabatan] = process.argv.slice(2);
  if (!email || !nama) {
    console.error("Pakai: npm run akun -- <email> <nama> [jabatan]");
    process.exit(1);
  }

  const [ada] = (await klienMentah.unsafe(
    `SELECT id FROM th_users WHERE lower(email) = $1`, [email.toLowerCase()],
  )) as unknown as { id: string }[];

  const sandi = sandiAcak();
  if (ada) {
    await klienMentah.unsafe(
      `UPDATE th_users SET sandi_hash = $1, peran = 'ADMIN', aktif = true, sesi_versi = sesi_versi + 1 WHERE id = $2::uuid`,
      [hashSandi(sandi), ada.id],
    );
    console.log("  akun sudah ada — sandi diperbarui, peran dipastikan ADMIN");
  } else {
    await klienMentah.unsafe(
      `INSERT INTO th_users (email, nama, jabatan, peran, sandi_hash, aktif)
       VALUES ($1, $2, $3, 'ADMIN', $4, true)`,
      [email.toLowerCase(), nama, jabatan ?? null, hashSandi(sandi)],
    );
    console.log("  akun admin dibuat");
  }

  const berkas = `/tmp/sandi-${email.replace(/[^a-z0-9]/gi, "_")}.txt`;
  writeFileSync(berkas, `${email}\n${sandi}\n`, { mode: 0o600 });
  chmodSync(berkas, 0o600);

  const n = (await klienMentah.unsafe(`SELECT count(*)::int AS n FROM th_users`)) as unknown as { n: number }[];
  console.log(`  total pengguna: ${n[0].n}`);
  console.log(`  sandi : (tidak dicetak) ditulis ke ${berkas}`);
  process.exit(0);
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });

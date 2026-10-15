/**
 * Setel ulang sandi pengguna dari terminal.
 *
 * KENAPA SKRIP INI PERLU ADA:
 * Aplikasi hanya menyimpan SIDIK sandi, jadi sandi yang hilang tidak bisa
 * ditampilkan kembali. Tanpa skrip ini, akun yang terkunci hanya bisa dibuka
 * dengan menulis SQL manual — dan itu berarti sandi akan lewat perintah shell,
 * tempat ia bisa tercatat di riwayat perintah dan log.
 *
 * KENAPA SANDI DITULIS KE BERKAS, bukan dicetak ke layar:
 * Keluaran terminal ikut tercatat di log sesi. Berkas dengan izin 600 dan
 * disebutkan sekali lebih aman daripada baris yang menempel di riwayat.
 *
 * Pakai:
 *   npm run sandi -- <email>
 *   npm run sandi -- <email> --sandi Manual123
 */
import { writeFileSync, chmodSync } from "node:fs";
import { klienMentah } from "../db";
import { hashSandi, sandiAcak } from "../lib/sesi";

async function main() {
  const arg = process.argv.slice(2);
  const email = arg[0];
  if (!email) {
    console.error("Pakai: npm run sandi -- <email> [--sandi Manual123]");
    process.exit(1);
  }

  const idx = arg.indexOf("--sandi");
  const sandi = idx >= 0 && arg[idx + 1] ? arg[idx + 1] : sandiAcak();
  if (sandi.length < 8) { console.error("Sandi minimal 8 karakter."); process.exit(1); }

  const [p] = (await klienMentah.unsafe(
    `SELECT id, nama, peran FROM th_users WHERE lower(email) = $1`, [email.toLowerCase()],
  )) as unknown as { id: string; nama: string; peran: string }[];

  if (!p) {
    const semua = (await klienMentah.unsafe(
      `SELECT email, nama, peran FROM th_users ORDER BY nama`,
    )) as unknown as { email: string; nama: string; peran: string }[];
    console.error(`Tidak ada akun dengan email: ${email}`);
    console.error("Akun yang ada:");
    for (const x of semua) console.error(`  ${x.nama} <${x.email}> ${x.peran}`);
    process.exit(1);
  }

  await klienMentah.unsafe(
    `UPDATE th_users SET sandi_hash = $1, aktif = true, sesi_versi = sesi_versi + 1 WHERE id = $2::uuid`,
    [hashSandi(sandi), p.id],
  );

  const berkas = `/tmp/sandi-${email.replace(/[^a-z0-9]/gi, "_")}.txt`;
  writeFileSync(berkas, `${email}\n${sandi}\n`, { mode: 0o600 });
  chmodSync(berkas, 0o600);

  console.log(`  akun   : ${p.nama} <${email}> · ${p.peran}`);
  console.log(`  status : aktif`);
  console.log(`  sandi  : (tidak dicetak) ditulis ke ${berkas}`);
  console.log("");
  console.log("  Hapus berkas itu setelah disalin:  rm " + berkas);
  process.exit(0);
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });

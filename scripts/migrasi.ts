/**
 * Jalankan migrasi lalu VERIFIKASI hasilnya.
 *
 * KENAPA TIDAK CUKUP "BERHASIL": `CREATE TABLE IF NOT EXISTS` dan
 * `CREATE INDEX IF NOT EXISTS` mengembalikan sukses walaupun objeknya TIDAK
 * ADA (mis. karena transaksi sebelumnya dibatalkan). Satu-satunya bukti yang
 * bisa dipercaya adalah membaca ulang katalog Postgres.
 */
import { readFileSync } from "node:fs";
import { klienMentah } from "../db";

const TABEL_DIHARAPKAN = [
  "th_users", "th_projects", "th_project_members", "th_modules",
  "th_scenarios", "th_evidence", "th_audit_logs", "th_password_resets",
];
const INDEKS_DIHARAPKAN = [
  "th_users_email_unik", "th_scenarios_project_idx", "th_scenarios_penguji_idx",
  "th_scenarios_module_idx", "th_evidence_scenario_idx", "th_audit_project_idx",
  "th_modules_project_idx", "th_members_user_idx", "th_password_resets_email_idx",
  "th_password_resets_ip_idx", "th_password_resets_user_idx",
];

async function main() {
  const berkas = process.argv[2]
    ? [process.argv[2]]
    : ["db/migrasi-001.sql", "db/migrasi-002-peran.sql", "db/migrasi-003-pemulihan-sandi.sql"];
  for (const nama of berkas) {
    console.log(`  menjalankan ${nama} ...`);
    await klienMentah.unsafe(readFileSync(nama, "utf8"));
    console.log("  DDL selesai tanpa galat");
  }
  console.log("");

  // ---- VERIFIKASI: baca katalog, jangan percaya pesan sukses ----
  const tabel = (await klienMentah.unsafe(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'th_%' ORDER BY tablename`,
  )) as unknown as { tablename: string }[];
  const adaTabel = tabel.map((t) => t.tablename);

  const indeks = (await klienMentah.unsafe(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'th_%' ORDER BY indexname`,
  )) as unknown as { indexname: string }[];
  const adaIndeks = indeks.map((i) => i.indexname);

  console.log("  === TABEL ===");
  let gagal = 0;
  for (const t of TABEL_DIHARAPKAN) {
    const ada = adaTabel.includes(t);
    if (!ada) gagal++;
    console.log(`    ${ada ? "ADA  " : "HILANG"}  ${t}`);
  }

  console.log("");
  console.log("  === INDEKS ===");
  for (const i of INDEKS_DIHARAPKAN) {
    const ada = adaIndeks.includes(i);
    if (!ada) gagal++;
    console.log(`    ${ada ? "ADA  " : "HILANG"}  ${i}`);
  }

  // ---- Verifikasi kolom skenario: harus 8 atribut + kolom cadangan ----
  const kolom = (await klienMentah.unsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='th_scenarios' ORDER BY ordinal_position`,
  )) as unknown as { column_name: string }[];
  const adaKolom = kolom.map((k) => k.column_name);
  const WAJIB = ["kode","judul","langkah_pengujian","hasil_diharapkan","penguji_id","status","catatan_tindak_lanjut"];
  const CADANGAN = ["tujuan_pengujian","prekondisi","data_uji","hasil_aktual"];

  console.log("");
  console.log("  === KOLOM th_scenarios ===");
  console.log(`    8 atribut PRD  : ${WAJIB.every((k) => adaKolom.includes(k)) ? "LENGKAP" : "ADA YANG HILANG"}`);
  console.log(`    kolom tambahan : ${CADANGAN.every((k) => adaKolom.includes(k)) ? "LENGKAP (hasil_aktual digunakan UI)" : "BELUM LENGKAP"}`);

  const resetKolom = (await klienMentah.unsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name='th_password_resets'`,
  )) as unknown as { column_name: string }[];
  const adaResetKolom = resetKolom.map((k) => k.column_name);
  const resetWajib = ["user_id", "email_hash", "ip_hash", "token_hash", "dibuat_pada", "kedaluwarsa_pada", "digunakan_pada"];
  if (!adaKolom.includes("sesi_versi") || !resetWajib.every((k) => adaResetKolom.includes(k))) gagal++;
  console.log(`    pemulihan sandi: ${adaKolom.includes("sesi_versi") && resetWajib.every((k) => adaResetKolom.includes(k)) ? "LENGKAP" : "ADA YANG HILANG"}`);

  const peran = (await klienMentah.unsafe(`SELECT DISTINCT peran FROM th_users ORDER BY peran`)) as unknown as { peran: string }[];
  const peranLama = peran.filter((x) => ["PM", "QA", "DEVELOPER", "BUSINESS_USER", "EKSTERNAL"].includes(x.peran));
  if (peranLama.length) gagal++;
  console.log(`    role legacy    : ${peranLama.length ? peranLama.map((x) => x.peran).join(", ") : "tidak ada"}`);

  // ---- Verifikasi trigger ----
  const trg = (await klienMentah.unsafe(
    `SELECT tgname FROM pg_trigger WHERE tgname LIKE 'th_%' AND NOT tgisinternal`,
  )) as unknown as { tgname: string }[];
  console.log(`    trigger        : ${trg.map((t) => t.tgname).join(", ") || "TIDAK ADA"}`);

  console.log("");
  console.log(`  === HASIL: ${gagal === 0 ? "SEMUA LENGKAP" : `${gagal} PEMERIKSAAN GAGAL`} ===`);
  process.exit(gagal === 0 ? 0 : 1);
}

main().catch((e) => { console.error("GAGAL:", e.message); process.exit(1); });

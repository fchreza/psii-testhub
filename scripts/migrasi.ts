/** Migrasi hanya dijalankan jika setiap file dipilih eksplisit. */
import { readFileSync } from "node:fs";
import { klienMentah } from "../db";
import { INDEKS_WAJIB, KOLOM_WAJIB, TABEL_WAJIB, temukanKekuranganSkema } from "../lib/skema";

const URUTAN_MIGRASI = [
  "db/migrasi-001.sql",
  "db/migrasi-002-peran.sql",
  "db/migrasi-003-pemulihan-sandi.sql",
  "db/migrasi-004-jenis-pengujian.sql",
  "db/migrasi-005-ketahanan-operasional.sql",
] as const;

function usage(): never {
  console.error([
    "Pilih migration secara eksplisit; tidak ada daftar default.",
    "Contoh: npm run migrasi -- db/migrasi-005-ketahanan-operasional.sql",
    "Migration 004 memerlukan flag --setuju-migrasi-004 setelah ditinjau.",
    "Production memerlukan flag --setujui-produksi setelah persetujuan pemilik.",
    `File yang diizinkan: ${URUTAN_MIGRASI.join(", ")}`,
  ].join("\n"));
  process.exit(2);
}

async function verifikasi(): Promise<void> {
  const [tabel, indeks, kolom, peran] = await Promise.all([
    klienMentah.unsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'th_%'`),
    klienMentah.unsafe(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'th_%'`),
    klienMentah.unsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'th_%'`),
    klienMentah.unsafe(`SELECT DISTINCT peran FROM th_users ORDER BY peran`),
  ]) as unknown as [
    { tablename: string }[], { indexname: string }[],
    { table_name: string; column_name: string }[], { peran: string }[],
  ];
  const hilang = temukanKekuranganSkema({
    tabel: tabel.map((x) => x.tablename),
    indeks: indeks.map((x) => x.indexname),
    kolom,
    peran: peran.map((x) => x.peran),
  });

  console.log("  === HASIL VERIFIKASI SKEMA ===");
  if (hilang.length) {
    for (const item of hilang) console.error(`  HILANG / TIDAK SAH: ${item}`);
    throw new Error(`${hilang.length} pemeriksaan skema gagal; release harus berhenti.`);
  }
  console.log(`  lengkap: ${TABEL_WAJIB.length} tabel, ${Object.values(KOLOM_WAJIB).flat().length} kolom, ${INDEKS_WAJIB.length} indeks; tidak ada role legacy`);
}

async function main() {
  const args = process.argv.slice(2);
  const fileArgs = args.filter((x) => !x.startsWith("--"));
  const flags = new Set(args.filter((x) => x.startsWith("--")));
  if (!fileArgs.length) usage();
  if (args.some((x) => x.startsWith("--") && !["--setuju-migrasi-004", "--setujui-produksi"].includes(x))) usage();
  if (new Set(fileArgs).size !== fileArgs.length || fileArgs.some((x) => !URUTAN_MIGRASI.includes(x as typeof URUTAN_MIGRASI[number]))) usage();
  const posisi = fileArgs.map((x) => URUTAN_MIGRASI.indexOf(x as typeof URUTAN_MIGRASI[number]));
  if (posisi.some((x, i) => i > 0 && x <= posisi[i - 1])) usage();
  if (fileArgs.includes("db/migrasi-004-jenis-pengujian.sql") && !flags.has("--setuju-migrasi-004")) {
    throw new Error("Migrasi 004 membutuhkan flag --setuju-migrasi-004 setelah SQL ditinjau dan disetujui.");
  }
  if (process.env.NODE_ENV === "production" && !flags.has("--setujui-produksi")) {
    throw new Error("NODE_ENV=production: hentikan. Persetujuan produksi harus diberikan secara eksplisit lewat --setujui-produksi.");
  }

  for (const nama of fileArgs) {
    console.log(`  menjalankan ${nama} ...`);
    await klienMentah.unsafe(readFileSync(nama, "utf8"));
    console.log("  DDL selesai tanpa galat");
  }
  await verifikasi();
}

main().catch((error) => {
  console.error("MIGRASI GAGAL:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});

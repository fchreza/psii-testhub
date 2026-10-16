import test from "node:test";
import assert from "node:assert/strict";
import {
  PERAN_AKUN, internal, bolehAksesProyekPeran, bolehKelolaPengguna,
  bolehKelolaProyek, bolehHapusBukti, bolehLewatiGuardHapusSkenario,
  bolehLihatAkunUji, bolehKelolaAkunUji,
  bolehKelolaSkenario, bolehUbahEksekusi, bolehUbahKolomSkenario,
} from "../lib/aturan-peran";
import {
  originSama, validasiMetadataObjek, perluAlasanHapusBuktiTerakhir,
  versiMasihAktual, enkodeKursorRiwayat, parseKursorRiwayat,
} from "../lib/validasi-bukti";
import { finalisasiUpload } from "../lib/alur-bukti";
import { sebabBlokirHapusSkenario, sebabTundaHapusAdmin, pathKunciHapusSkenario, PREFIX_KUNCI_HAPUS_SKENARIO } from "../lib/keamanan-hapus-skenario";

test("matriks akses: internal melihat portofolio, tester dibatasi penugasan", () => {
  const portofolio = new Set(["ADMIN", "PIMPINAN", "INTERNAL_PSII"]);
  const pengelola = new Set(["ADMIN", "INTERNAL_PSII"]);
  for (const role of PERAN_AKUN) {
    assert.equal(internal(role), portofolio.has(role), `${role}: visibility`);
    assert.equal(bolehAksesProyekPeran(role, false), portofolio.has(role), `${role}: unassigned`);
    assert.equal(bolehAksesProyekPeran(role, true), true, `${role}: assigned`);
    assert.equal(bolehKelolaPengguna(role), role === "ADMIN", `${role}: users`);
    assert.equal(bolehKelolaProyek(role), pengelola.has(role), `${role}: projects`);
    assert.equal(bolehLihatAkunUji(role), role !== "PIMPINAN", `${role}: test account visibility after project access`);
    assert.equal(bolehKelolaAkunUji(role), pengelola.has(role), `${role}: test account management`);
    assert.equal(bolehKelolaSkenario(role), pengelola.has(role), `${role}: scenarios`);
    assert.equal(bolehHapusBukti(role), role !== "PIMPINAN", `${role}: delete evidence`);
    assert.equal(bolehLewatiGuardHapusSkenario(role), role === "ADMIN", `${role}: scenario evidence override`);
    assert.equal(bolehUbahEksekusi(role), role !== "PIMPINAN", `${role}: execution`);
  }
});

test("tester dapat mengubah hasil aktual, status, dan tindak lanjut saja", () => {
  const bolehTester = ["hasilAktual", "status", "catatanTindakLanjut"] as const;
  const khususPengelola = ["judul", "langkahPengujian", "hasilDiharapkan", "pengujiId", "moduleId", "siapRetest"] as const;
  for (const role of ["INTERNAL_KEMENKEU", "EKSTERNAL_KEMENKEU"] as const) {
    for (const kolom of bolehTester) assert.equal(bolehUbahKolomSkenario(role, kolom), true, `${role}:${kolom}`);
    for (const kolom of khususPengelola) assert.equal(bolehUbahKolomSkenario(role, kolom), false, `${role}:${kolom}`);
  }
  for (const kolom of [...bolehTester, ...khususPengelola]) {
    assert.equal(bolehUbahKolomSkenario("PIMPINAN", kolom), false, `PIMPINAN:${kolom}`);
    assert.equal(bolehUbahKolomSkenario("ADMIN", kolom), true, `ADMIN:${kolom}`);
    assert.equal(bolehUbahKolomSkenario("INTERNAL_PSII", kolom), true, `INTERNAL_PSII:${kolom}`);
  }
});

test("penghapusan skenario hanya untuk Admin/Internal PSII dan memblokir jejak bukti/unggahan", () => {
  for (const role of PERAN_AKUN) {
    assert.equal(bolehKelolaSkenario(role), role === "ADMIN" || role === "INTERNAL_PSII", `${role}: delete`);
  }
  assert.equal(sebabBlokirHapusSkenario(0, 0), null);
  assert.equal(sebabBlokirHapusSkenario(1, 0), "bukti", "bukti aktif maupun tombstone tetap terlindungi");
  assert.equal(sebabBlokirHapusSkenario(0, 1), "unggahan", "intent upload tidak ikut terhapus lewat cascade");
  assert.equal(sebabBlokirHapusSkenario(1, 1), "bukti");
});

test("Admin menunggu intent upload dan URL bertanda tangan benar-benar tidak aktif", () => {
  const sekarang = Date.parse("2026-10-16T07:00:00.000Z");
  assert.equal(sebabTundaHapusAdmin([], sekarang), null);
  assert.equal(sebabTundaHapusAdmin([{ status: "UPLOADING", expiresAt: "2026-10-16T06:00:00.000Z" }], sekarang), "unggahan");
  assert.equal(sebabTundaHapusAdmin([{ status: "COMPLETED", expiresAt: "2026-10-16T07:00:10.000Z" }], sekarang), "url_aktif");
  assert.equal(sebabTundaHapusAdmin([{ status: "COMPLETED", expiresAt: "2026-10-16T06:59:00.000Z" }], sekarang), null);
  assert.equal(pathKunciHapusSkenario("synthetic-id"), `${PREFIX_KUNCI_HAPUS_SKENARIO}synthetic-id`);
});

test("Origin hanya menerima origin yang sama persis dan menolak nilai hilang/null", () => {
  assert.equal(originSama("https://psii-testhub.vercel.app", "https://psii-testhub.vercel.app/api/v1/bukti"), true);
  assert.equal(originSama("https://evil.example", "https://psii-testhub.vercel.app/api/v1/bukti"), false);
  assert.equal(originSama("null", "https://psii-testhub.vercel.app/api/v1/bukti"), false);
  assert.equal(originSama(null, "https://psii-testhub.vercel.app/api/v1/bukti"), false);
  assert.equal(originSama("http://psii-testhub.vercel.app", "https://psii-testhub.vercel.app/api/v1/bukti"), false);
});

test("metadata objek harus cocok dengan ukuran dan tipe HEAD aktual", () => {
  assert.equal(validasiMetadataObjek(123, "image/png", 123, "image/png", 10_000), null);
  assert.match(validasiMetadataObjek(123, "image/png", 124, "image/png", 10_000) ?? "", /Ukuran/);
  assert.match(validasiMetadataObjek(123, "image/png", 123, "image/jpeg", 10_000) ?? "", /Jenis/);
  assert.match(validasiMetadataObjek(0, "image/png", 0, "image/png", 10_000) ?? "", /Ukuran/);
  assert.match(validasiMetadataObjek(10_001, "image/png", 10_001, "image/png", 10_000) ?? "", /Ukuran/);
});

test("bukti terakhir pada FAIL/BLOCKED butuh alasan atau tindak lanjut", () => {
  assert.equal(perluAlasanHapusBuktiTerakhir("FAIL", "", ""), true);
  assert.equal(perluAlasanHapusBuktiTerakhir("BLOCKED", null, "  "), true);
  assert.equal(perluAlasanHapusBuktiTerakhir("FAIL", "Investigasi dicatat", ""), false);
  assert.equal(perluAlasanHapusBuktiTerakhir("BLOCKED", "", "Alasan penghapusan"), false);
  assert.equal(perluAlasanHapusBuktiTerakhir("PASS", "", ""), false);
});

test("optimistic concurrency menerima versi hanya jika sama dan terdefinisi", () => {
  assert.equal(versiMasihAktual("101", "101"), true);
  assert.equal(versiMasihAktual("100", "101"), false);
  assert.equal(versiMasihAktual(undefined, "101"), false);
  assert.equal(versiMasihAktual("", ""), false);
});

test("cursor riwayat round-trip, menjaga ID sebagai bigint string, dan menolak payload invalid", () => {
  const cursor = { pada: "2026-10-16T02:00:00.123Z", id: "9223372036854775807" };
  assert.deepEqual(parseKursorRiwayat(enkodeKursorRiwayat(cursor)), cursor);
  assert.equal(parseKursorRiwayat(null), null);
  assert.equal(parseKursorRiwayat("%%%"), null);
  assert.equal(parseKursorRiwayat(Buffer.from(JSON.stringify({ pada: "nope", id: "1" })).toString("base64url")), null);
});

test("gagal memeriksa/mempromosikan storage tidak menulis metadata", async () => {
  let databaseCalls = 0;
  await assert.rejects(finalisasiUpload(
    { ukuranHarapan: 10, tipeHarapan: "image/png", ukuranAktual: 10, tipeAktual: "image/png" },
    100,
    {
      promosikan: async () => { throw new Error("storage unavailable"); },
      catatTransaksi: async () => { databaseCalls++; return "evidence"; },
      bersihkanStaging: async () => {},
    },
  ), /storage unavailable/);
  assert.equal(databaseCalls, 0);
});

test("DB gagal setelah copy dapat dicoba ulang tanpa menggandakan objek final", async () => {
  let finalExists = false;
  let copyCalls = 0;
  let databaseCalls = 0;
  let cleanupCalls = 0;
  const operasi = {
    promosikan: async () => { if (!finalExists) { finalExists = true; copyCalls++; } },
    catatTransaksi: async () => {
      databaseCalls++;
      if (databaseCalls === 1) throw new Error("database unavailable");
      return "evidence-1";
    },
    bersihkanStaging: async () => { cleanupCalls++; },
  };
  const metadata = { ukuranHarapan: 10, tipeHarapan: "image/png", ukuranAktual: 10, tipeAktual: "image/png" };
  await assert.rejects(finalisasiUpload(metadata, 100, operasi), /database unavailable/);
  const result = await finalisasiUpload(metadata, 100, operasi);
  assert.equal(result, "evidence-1");
  assert.equal(copyCalls, 1, "tujuan final dibuat sekali saat retry");
  assert.equal(databaseCalls, 2, "transaksi metadata/audit dapat dicoba ulang");
  assert.equal(cleanupCalls, 1, "staging baru dibersihkan setelah transaksi sukses");
});

test("metadata tidak cocok berhenti sebelum promote atau transaksi", async () => {
  let called = false;
  await assert.rejects(finalisasiUpload(
    { ukuranHarapan: 10, tipeHarapan: "image/png", ukuranAktual: 11, tipeAktual: "image/png" },
    100,
    { promosikan: async () => { called = true; }, catatTransaksi: async () => "x", bersihkanStaging: async () => {} },
  ), /Ukuran berkas/);
  assert.equal(called, false);
});

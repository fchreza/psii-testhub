import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buatPdfLaporan } from "../lib/laporan-final-pdf";
import type { SnapshotLaporan } from "../lib/laporan-final-types";

const sample = (): SnapshotLaporan => {
  const longText = Array.from({ length: 150 }, (_, i) => `Baris uji panjang nomor ${i + 1}: deskripsi sintetis untuk memastikan semua isi dibungkus dan berpindah halaman tanpa terpotong.`).join(" ");
  const scenario = {
    id: "test-s1", kode: "TC-01", judul: "Skenario unicode dan pagination",
    langkah: longText, diharapkan: "Hasil diharapkan dengan aksen: pengujian penerimaan pengguna berjalan dengan benar.",
    aktual: `${longText} PENANDA-AKHIR-TEST-RENDERER`, status: "PENDING" as const,
    temuan: null, tindakLanjut: null, penguji: null,
    siapRetest: false, bukti: ["REF-INTERNAL-001", "https://private.invalid/evidence.png"],
  };
  return {
    format: 1, dokumenId: "DOC-TEST-01", versi: 2, dibuatPada: "2026-10-19T10:00:00+07:00", dibuatOleh: "Penguji Uji",
    sidikSumber: "test-only", proyek: {
      id: "P-TEST", nama: "Proyek Uji Sintetis", aplikasi: null, jenisPengujian: "UAT", tahap: "Uji penerimaan",
      unit: null, pic: null, ruangLingkup: "Cakupan contoh.", lingkungan: null, tanggalMulai: null, targetSelesai: "2026-11-01",
      selesaiPada: null, dasarRegulasi: null,
    },
    hitungan: { total: 1, lulus: 0, gagal: 0, tertunda: 0, belum: 1 },
    peringatan: ["Data ini sintetis untuk pengujian renderer."], kesimpulan: "UAT tidak berarti seluruh kasus lulus.",
    modul: [{ id: "M-TEST", kode: "M-01", nama: "Modul Contoh", hitungan: { total: 1, lulus: 0, gagal: 0, tertunda: 0, belum: 1 }, skenario: [scenario] }],
  };
};

test("renderer menghasilkan PDF valid, searchable, multipage, dan tidak memasukkan evidence URL", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "laporan-final-pdf-"));
  const file = path.join(dir, "report.pdf");
  try {
    const buffer = await buatPdfLaporan(sample());
    assert.equal(buffer.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.ok(buffer.subarray(-2048).toString("latin1").includes("%%EOF"));
    await writeFile(file, buffer);
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    const pageBreaks = (text.match(/\f/g) ?? []).length;
    assert.ok(pageBreaks >= 2, `expected multiple pages, got ${pageBreaks}`);
    assert.match(text, /Laporan Akhir UAT/);
    assert.match(text, /pengujian penerimaan pengguna/i);
    assert.match(text, /PENANDA-AKHIR-TEST-RENDERER/);
    assert.match(text, /Tidak tercatat/);
    assert.match(text, /REF-INTERNAL-001/);
    assert.match(text, /Catatan tindakan belum tercatat/);
    assert.doesNotMatch(text, /https:\/\/private\.invalid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

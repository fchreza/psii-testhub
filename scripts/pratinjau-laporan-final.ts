import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buatPdfLaporan } from "../lib/laporan-final-pdf";
import type { SnapshotLaporan } from "../lib/laporan-final-types";

// Entirely invented data for renderer/UAT preview only; not a real project or test record.
const repeat = (text: string, times: number) => Array.from({ length: times }, () => text).join(" ");
const snapshot: SnapshotLaporan = {
  format: 1,
  dokumenId: "SYN-UAT-2026-001",
  versi: 1,
  dibuatPada: "2026-10-19T10:00:00+07:00",
  dibuatOleh: "Akun Dummy — Pratinjau Sintetis",
  sidikSumber: "synthetic-only-not-a-production-hash",
  proyek: {
    id: "synthetic-project-001", nama: "SINTETIS — Uji Layanan Pengajuan Contoh",
    aplikasi: "Aplikasi Contoh (fiktif)", jenisPengujian: "UAT", tahap: "Uji penerimaan pengguna",
    unit: "Unit Contoh (fiktif)", pic: "PIC Dummy", ruangLingkup: "Alur contoh untuk demonstrasi tata letak laporan; bukan cakupan sistem nyata.",
    lingkungan: "Lingkungan tiruan lokal", tanggalMulai: "2026-10-01", targetSelesai: "2026-10-30",
    selesaiPada: null, dasarRegulasi: null,
  },
  hitungan: { total: 5, lulus: 1, gagal: 1, tertunda: 1, belum: 2 },
  peringatan: [
    "DATA SINTETIS: nama, tanggal, skenario, status, dan hasil pada dokumen ini sepenuhnya rekaan untuk uji renderer.",
    "Target selesai adalah target yang dicatat, bukan bukti bahwa kegiatan selesai. Tidak ada tanda tangan atau berita acara pada contoh ini.",
  ],
  kesimpulan: "Contoh ini menunjukkan bahwa UAT dapat memuat status yang beragam. Penyelesaian sesi UAT tidak berarti semua skenario lulus; tindak lanjut yang tercatat harus diselesaikan dan diuji ulang sesuai keputusan pemilik proses.",
  modul: [{
    id: "synthetic-module-001", kode: "MOD-SYN-01", nama: "Modul Pengajuan Contoh",
    hitungan: { total: 5, lulus: 1, gagal: 1, tertunda: 1, belum: 2 },
    skenario: [
      { id: "syn-s1", kode: "SYN-001", judul: "Pengajuan dengan data valid", langkah: "Masukkan data fiktif lengkap dan kirim formulir contoh.", diharapkan: "Sistem menampilkan konfirmasi pengajuan contoh.", aktual: "Konfirmasi tampil sesuai catatan uji sintetis.", status: "PASS", temuan: null, tindakLanjut: null, penguji: "Penguji Dummy A", siapRetest: false, bukti: ["REF-SYN-IMG-001"] },
      { id: "syn-s2", kode: "SYN-002", judul: "Validasi kolom wajib", langkah: "Kirim formulir fiktif dengan satu kolom wajib kosong.", diharapkan: "Pesan validasi ditampilkan dan data tidak dikirim.", aktual: "Pesan validasi pada contoh tidak muncul pada simulasi.", status: "FAIL", temuan: "Temuan dummy: validasi kolom wajib tidak konsisten.", tindakLanjut: "Periksa aturan validasi pada formulir tiruan; siapkan retest setelah perbaikan contoh.", penguji: "Penguji Dummy B", siapRetest: true, bukti: ["REF-SYN-CATATAN-002"] },
      { id: "syn-s3", kode: "SYN-003", judul: "Pemeriksaan dependensi eksternal", langkah: "Jalankan uji contoh saat dependensi tiruan dinonaktifkan.", diharapkan: "Aplikasi memberi pesan kondisi layanan yang jelas.", aktual: null, status: "BLOCKED", temuan: "Pengujian dummy tertahan karena dependensi simulasi tidak tersedia.", tindakLanjut: "Pulihkan dependensi lokal tiruan, lalu ulangi skenario.", penguji: "Penguji Dummy A", siapRetest: false, bukti: [] },
      { id: "syn-s4", kode: "SYN-004", judul: "Telaah catatan audit panjang untuk pemeriksaan pemenggalan dan pagination", langkah: repeat("Langkah panjang sintetis: telaah rekaman contoh, konfirmasi urutan kejadian tiruan, dan catat hasil tanpa menyertakan informasi pengguna sungguhan.", 28), diharapkan: repeat("Hasil yang diharapkan rekaan: setiap bagian laporan ditata pada halaman berikutnya dengan teks terbaca, tidak terpotong, dan tetap mempertahankan urutan informasi.", 30), aktual: repeat("Catatan aktual dummy: kasus ini sengaja memiliki uraian sangat panjang untuk memastikan renderer otomatis berpindah halaman tanpa menghilangkan kalimat penanda akhir.", 34) + " PENANDA-AKHIR-TEKS-PANJANG-SINTETIS", status: "PENDING", temuan: "Belum dilakukan; data panjang ini hanya untuk pengujian layout.", tindakLanjut: null, penguji: null, siapRetest: false, bukti: ["REF-SYN-LONG-004"] },
      { id: "syn-s5", kode: "SYN-005", judul: "Skenario tanpa hasil aktual", langkah: "Tidak ada langkah nyata; ini contoh baris belum diuji.", diharapkan: "Perilaku contoh tercatat setelah uji dilakukan.", aktual: null, status: "PENDING", temuan: null, tindakLanjut: null, penguji: null, siapRetest: false, bukti: [] },
    ],
  }],
};

const output = "/workspace/psii-testhub-uat-final-synthetic.pdf";
async function main() {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await buatPdfLaporan(snapshot));
  console.log(`PDF sintetis dibuat: ${output}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

import { teksLaporan, hitungLaporan, peringatanLaporan, kesimpulanLaporan, sidikLaporan } from "./laporan-final";
import type { SumberLaporan, SkenarioLaporan, ModulLaporan, StatusLaporan } from "./laporan-final-types";

export type QueryLaporan = { unsafe: (query: string, params?: never[]) => PromiseLike<unknown> };
type Row = Record<string, unknown>;
async function rows(db: QueryLaporan, query: string, params: unknown[] = []): Promise<Row[]> {
  return await db.unsafe(query, params as never[]) as Row[];
}
const tanggal = (v: unknown) => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const waktu = (v: unknown) => v == null ? null : new Date(String(v)).toISOString();

/** Dipanggil dalam transaksi REPEATABLE READ: metadata, skenario, bukti, dan
 * versi sumber berasal dari satu titik waktu. Tidak pernah SELECT * atau akun uji. */
export async function bacaSumberLaporan(db: QueryLaporan, projectId: string): Promise<{ sumber: SumberLaporan; sidikSumber: string } | null> {
  const [p] = await rows(db, `SELECT p.id,p.nama,p.aplikasi,p.modul_aplikasi,p.jenis_pengujian,p.tahap,
    p.unit_bisnis,p.ruang_lingkup,p.lingkungan,p.tanggal_mulai,p.target_selesai,p.dasar_regulasi,
    p.xmin::text AS revisi,u.nama AS pic,
    (SELECT max(a.pada) FROM th_audit_logs a WHERE a.project_id=p.id AND a.aksi='ubah_tahap'
      AND a.nilai_baru='SELESAI') AS selesai_pada
    FROM th_projects p LEFT JOIN th_users u ON u.id=p.pm_id WHERE p.id=$1`, [projectId]);
  if (!p) return null;
  const modulRows = await rows(db, `SELECT id,kode,nama,xmin::text AS revisi FROM th_modules
    WHERE project_id=$1 ORDER BY urutan,kode,id`, [projectId]);
  const skenarioRows = await rows(db, `SELECT s.id,s.kode,s.judul,s.module_id,s.langkah_pengujian,s.hasil_diharapkan,
    s.hasil_aktual,s.status,s.catatan_tindak_lanjut,s.siap_retest,s.xmin::text AS revisi,u.nama AS penguji
    FROM th_scenarios s LEFT JOIN th_users u ON u.id=s.penguji_id
    WHERE s.project_id=$1 AND s.fase='UAT' ORDER BY s.urutan,s.kode,s.id`, [projectId]);
  // Hanya ID internal, status dan MVCC revision; tidak mengambil nama file, path, signed URL, atau storage key.
  const buktiRows = await rows(db, `SELECT e.id,e.scenario_id,e.status,e.xmin::text AS revisi
    FROM th_evidence e JOIN th_scenarios s ON s.id=e.scenario_id
    WHERE s.project_id=$1 AND s.fase='UAT' ORDER BY e.id`, [projectId]);
  const modul: ModulLaporan[] = modulRows.map(m => ({ id: String(m.id), kode: teksLaporan(m.kode) ?? "—",
    nama: teksLaporan(m.nama) ?? "Tidak tercatat", hitungan: hitungLaporan([]), skenario: [] }));
  const tanpaModul: ModulLaporan = { id: null, kode: "—", nama: "Belum dipetakan ke modul", hitungan: hitungLaporan([]), skenario: [] };
  const buktiPerSkenario = new Map<string, string[]>();
  for (const b of buktiRows) {
    if (b.status !== "READY") continue;
    const key = String(b.scenario_id);
    const refs = buktiPerSkenario.get(key) ?? [];
    refs.push(`BUKTI-${b.id}`);
    buktiPerSkenario.set(key, refs);
  }
  const modulPerId = new Map(modul.map(m => [m.id, m]));
  const semua: SkenarioLaporan[] = [];
  for (const s of skenarioRows) {
    if (!["PASS", "FAIL", "BLOCKED", "PENDING"].includes(String(s.status))) throw new Error("Status skenario tidak dikenal; snapshot dihentikan.");
    const item: SkenarioLaporan = { id: String(s.id), kode: teksLaporan(s.kode) ?? "—", judul: teksLaporan(s.judul) ?? "Tidak tercatat",
      langkah: teksLaporan(s.langkah_pengujian), diharapkan: teksLaporan(s.hasil_diharapkan), aktual: teksLaporan(s.hasil_aktual),
      status: s.status as StatusLaporan, temuan: null, tindakLanjut: teksLaporan(s.catatan_tindak_lanjut),
      penguji: teksLaporan(s.penguji), siapRetest: Boolean(s.siap_retest),
      bukti: buktiPerSkenario.get(String(s.id)) ?? [] };
    (modulPerId.get(s.module_id == null ? null : String(s.module_id)) ?? tanpaModul).skenario.push(item);
    semua.push(item);
  }
  if (tanpaModul.skenario.length) modul.push(tanpaModul);
  for (const m of modul) m.hitungan = hitungLaporan(m.skenario);
  const hitungan = hitungLaporan(semua);
  const peringatan = peringatanLaporan(semua);
  if (tanpaModul.skenario.length) peringatan.push(`${tanpaModul.skenario.length} skenario belum dipetakan ke modul proyek yang sah; tetap disertakan.`);
  if (!p.selesai_pada && p.tahap === "SELESAI") peringatan.push("Tanggal penandaan selesai tidak tercatat pada riwayat; target selesai bukan tanggal selesai aktual.");
  peringatan.push("Kolom temuan terpisah, PIC tindak lanjut, target tindak lanjut, dan status tindak lanjut tidak tersedia pada sumber v1; tidak disimpulkan dari status uji. Catatan tindak lanjut ditampilkan apa adanya setelah penyaringan data sensitif.");
  const sumber: SumberLaporan = { proyek: {
    id: String(p.id), nama: teksLaporan(p.nama) ?? "Tidak tercatat", aplikasi: teksLaporan(p.aplikasi ?? p.modul_aplikasi),
    jenisPengujian: String(p.jenis_pengujian), tahap: String(p.tahap), unit: teksLaporan(p.unit_bisnis), pic: teksLaporan(p.pic),
    ruangLingkup: teksLaporan(p.ruang_lingkup), lingkungan: teksLaporan(p.lingkungan), tanggalMulai: tanggal(p.tanggal_mulai),
    targetSelesai: tanggal(p.target_selesai), selesaiPada: p.tahap === "SELESAI" ? waktu(p.selesai_pada) : null,
    dasarRegulasi: teksLaporan(p.dasar_regulasi),
  }, hitungan, modul, peringatan, kesimpulan: kesimpulanLaporan(hitungan) };
  const revisi = { proyek: p.revisi, modul: modulRows.map(m => [m.id,m.revisi]),
    skenario: skenarioRows.map(s => [s.id,s.revisi]), bukti: buktiRows.map(b => [b.id,b.revisi,b.status]) };
  return { sumber, sidikSumber: sidikLaporan(sumber, revisi) };
}

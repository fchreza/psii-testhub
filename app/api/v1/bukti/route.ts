import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { klienMentah } from "@/db";
import { wajibMasukApi, bolehAksesProyek, bolehHapusBukti, bolehUbahEksekusi } from "@/lib/gerbang";
import {
  urlUnggah, urlLihat, kunciBukti, kunciSementara,
  jenisDikenal, BATAS_BUKTI, JENIS_BUKTI, MASA_URL_UNGGAH_DETIK,
} from "@/lib/simpanan";
import { finalisasiIntentUpload, selesaikanPenghapusanBukti } from "@/lib/bukti-operasi";
import { perluAlasanHapusBuktiTerakhir } from "@/lib/validasi-bukti";
import { pathKunciHapusSkenario } from "@/lib/keamanan-hapus-skenario";
import { serialisasiAuditBukti } from "@/lib/audit-bukti";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const hasil = await wajibMasukApi();
  if ("tolak" in hasil) return hasil.tolak;
  const saya = hasil.pengguna;

  const isi = await req.json().catch(() => null) as
    { aksi?: string; projectId?: string; scenarioId?: string; idempotencyKey?: string;
      namaBerkas?: string; mime?: string; ukuran?: number; evidenceId?: string;
      kunci?: string; alasan?: string } | null;

  if (!isi?.aksi) return NextResponse.json({ pesan: "aksi wajib" }, { status: 400 });
  if (!isi.projectId || !/^PRJ-\d{3,}$/.test(isi.projectId)) {
    return NextResponse.json({ pesan: "ID proyek wajib dan harus sah." }, { status: 400 });
  }
  if (!(await bolehAksesProyek(saya, isi.projectId))) {
    return NextResponse.json({ pesan: "Tidak punya akses ke proyek ini" }, { status: 403 });
  }
  if (isi.aksi !== "daftar" && !bolehUbahEksekusi(saya.peran)) {
    return NextResponse.json({ pesan: "Peran Pimpinan hanya dapat melihat." }, { status: 403 });
  }
  if (isi.aksi === "hapus" && !bolehHapusBukti(saya.peran)) {
    return NextResponse.json({ pesan: "Peran ini tidak dapat menghapus bukti." }, { status: 403 });
  }

  try {
    if (isi.aksi === "izin_unggah") {
      const { projectId, scenarioId, namaBerkas, mime, ukuran, idempotencyKey } = isi;
      if (!scenarioId || !UUID.test(scenarioId) || !idempotencyKey || !UUID.test(idempotencyKey)) {
        return NextResponse.json({ pesan: "ID skenario dan idempotency key tidak sah." }, { status: 400 });
      }
      if (typeof namaBerkas !== "string" || !namaBerkas.trim() || !mime || !jenisDikenal(mime)) {
        return NextResponse.json({ pesan: `Nama atau jenis berkas tidak sah. Jenis yang didukung: ${Object.values(JENIS_BUKTI).join(", ")}` }, { status: 400 });
      }
      if (typeof ukuran !== "number" || !Number.isInteger(ukuran) || ukuran <= 0 || ukuran > BATAS_BUKTI) {
        return NextResponse.json({ pesan: `Ukuran berkas harus lebih dari 0 dan tidak melebihi ${BATAS_BUKTI / 1024 / 1024} MB.` }, { status: 400 });
      }
      const hasilIntent = await klienMentah.begin(async (tx) => {
        // Berbagi lock dengan DELETE skenario agar intent tidak hilang melalui cascade.
        const [skenario] = (await tx.unsafe(
          `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2 FOR UPDATE`, [scenarioId, projectId],
        )) as unknown as { id: string }[];
        if (!skenario) return { status: "skenario_tidak_ada" as const };
        const [penghapusan] = (await tx.unsafe(
          `SELECT 1 AS ada FROM th_evidence WHERE scenario_id = $1::uuid AND path = $2 AND status = 'DELETE_PENDING' LIMIT 1`,
          [scenarioId, pathKunciHapusSkenario(scenarioId)],
        )) as unknown as { ada: number }[];
        if (penghapusan) return { status: "penghapusan_pending" as const };

        let [intent] = (await tx.unsafe(
          `INSERT INTO th_evidence_uploads
             (user_id, project_id, scenario_id, idempotency_key, staging_path, final_path,
              nama_asli, tipe, ukuran, expires_at)
           VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, now() + $10::interval)
           ON CONFLICT (user_id, idempotency_key) DO NOTHING
           RETURNING id, project_id, scenario_id, staging_path, final_path, nama_asli, tipe, ukuran, status, evidence_id`,
          [saya.id, projectId, scenarioId, idempotencyKey,
           kunciSementara(projectId, scenarioId, mime), kunciBukti(projectId, scenarioId, mime),
           namaBerkas.trim().slice(0, 240), mime, ukuran, `${MASA_URL_UNGGAH_DETIK} seconds`],
        )) as unknown as {
          id: string; project_id: string; scenario_id: string; staging_path: string; final_path: string; nama_asli: string; tipe: string;
          ukuran: number; status: string; evidence_id: string | null;
        }[];

        if (!intent) {
          [intent] = (await tx.unsafe(
            `SELECT id, project_id, scenario_id, staging_path, final_path, nama_asli, tipe, ukuran, status, evidence_id
             FROM th_evidence_uploads WHERE user_id = $1::uuid AND idempotency_key = $2::uuid`,
            [saya.id, idempotencyKey],
          )) as unknown as typeof intent[];
        }
        return intent ? { status: "siap" as const, intent } : { status: "gagal" as const };
      });
      if (hasilIntent.status === "skenario_tidak_ada") {
        return NextResponse.json({ pesan: "Skenario tidak ada di proyek ini." }, { status: 404 });
      }
      if (hasilIntent.status === "penghapusan_pending") {
        return NextResponse.json({ pesan: "Skenario sedang dibersihkan Admin; unggahan baru ditutup sementara." }, { status: 409 });
      }
      if (hasilIntent.status === "gagal") {
        return NextResponse.json({ pesan: "Intent unggah tidak dapat dibuat." }, { status: 500 });
      }
      const intent = hasilIntent.intent;
      if (intent.project_id !== projectId || intent.scenario_id !== scenarioId) {
        return NextResponse.json({ pesan: "Idempotency key sudah terikat ke skenario lain." }, { status: 409 });
      }
      if (intent.nama_asli !== namaBerkas.trim().slice(0, 240) || intent.tipe !== mime || Number(intent.ukuran) !== ukuran) {
        return NextResponse.json({ pesan: "Idempotency key sudah digunakan dengan metadata berbeda." }, { status: 409 });
      }
      if (intent.status === "COMPLETED" && intent.evidence_id) {
        return NextResponse.json({ id: intent.evidence_id, sudahSelesai: true });
      }
      if (intent.status !== "UPLOADING") {
        return NextResponse.json({ pesan: "Intent unggah ini sudah tidak aktif. Buat unggahan baru." }, { status: 410 });
      }
      await klienMentah.unsafe(
        `UPDATE th_evidence_uploads SET expires_at = now() + $2::interval, diubah_pada = now()
         WHERE id = $1::uuid AND status = 'UPLOADING'`,
        [intent.id, `${MASA_URL_UNGGAH_DETIK} seconds`],
      );
      const url = await urlUnggah(intent.staging_path, mime, ukuran);
      return NextResponse.json({ idempotencyKey, kunci: intent.staging_path, url, kedaluwarsa: MASA_URL_UNGGAH_DETIK });
    }

    if (isi.aksi === "catat") {
      const { projectId, scenarioId, idempotencyKey, kunci } = isi;
      if (!scenarioId || !UUID.test(scenarioId) || !idempotencyKey || !UUID.test(idempotencyKey) || typeof kunci !== "string") {
        return NextResponse.json({ pesan: "Data finalisasi unggahan tidak sah." }, { status: 400 });
      }
      const [intent] = (await klienMentah.unsafe(
        `SELECT id, staging_path FROM th_evidence_uploads
         WHERE user_id = $1::uuid AND project_id = $2 AND scenario_id = $3::uuid AND idempotency_key = $4::uuid`,
        [saya.id, projectId, scenarioId, idempotencyKey],
      )) as unknown as { id: string; staging_path: string }[];
      if (!intent || intent.staging_path !== kunci) return NextResponse.json({ pesan: "Intent upload tidak ditemukan atau tidak sesuai." }, { status: 404 });

      const akhir = await finalisasiIntentUpload(intent.id, saya.id);
      if (!akhir) return NextResponse.json({ pesan: "Intent upload tidak ditemukan." }, { status: 404 });
      if (akhir.status === "COMPLETED") {
        revalidatePath(`/proyek/${projectId}`);
        return NextResponse.json({ id: akhir.evidenceId, sudahSelesai: true });
      }
      if (akhir.status === "UPLOADING") return NextResponse.json({ pesan: akhir.pesan }, { status: 409 });
      return NextResponse.json({ pesan: akhir.pesan }, { status: akhir.status === "EXPIRED" ? 410 : 400 });
    }

    if (isi.aksi === "daftar") {
      const { scenarioId } = isi;
      if (!scenarioId || !UUID.test(scenarioId)) return NextResponse.json({ pesan: "scenarioId tidak sah" }, { status: 400 });
      const [s] = (await klienMentah.unsafe(
        `SELECT id FROM th_scenarios WHERE id = $1::uuid AND project_id = $2`, [scenarioId, isi.projectId],
      )) as unknown as { id: string }[];
      if (!s) return NextResponse.json({ pesan: "Skenario tidak ditemukan di proyek ini." }, { status: 404 });
      const baris = (await klienMentah.unsafe(
        `SELECT id, path, nama_asli, tipe, ukuran, diunggah_pada
         FROM th_evidence WHERE scenario_id = $1::uuid AND status = 'READY'
         ORDER BY diunggah_pada, id`, [scenarioId],
      )) as unknown as { path: string }[];
      const denganUrl = await Promise.all(baris.map(async (b) => ({
        ...b, url: await urlLihat(b.path), urlUnduh: await urlLihat(b.path, true),
      })));
      return NextResponse.json({ bukti: denganUrl });
    }

    if (isi.aksi === "hapus") {
      const { evidenceId, projectId } = isi;
      if (!evidenceId || !UUID.test(evidenceId)) return NextResponse.json({ pesan: "evidenceId tidak sah" }, { status: 400 });
      if (isi.alasan !== undefined && (typeof isi.alasan !== "string" || isi.alasan.length > 1000)) {
        return NextResponse.json({ pesan: "Alasan penghapusan maksimal 1.000 karakter." }, { status: 400 });
      }
      const alasan = typeof isi.alasan === "string" ? isi.alasan.trim() : "";
      const hasilHapus = await klienMentah.begin(async (tx) => {
        const [skenario] = (await tx.unsafe(
          `SELECT s.id, s.status, s.catatan_tindak_lanjut
           FROM th_scenarios s WHERE s.project_id = $1 AND s.id =
             (SELECT scenario_id FROM th_evidence WHERE id = $2::uuid) FOR UPDATE`,
          [projectId, evidenceId],
        )) as unknown as { id: string; status: string; catatan_tindak_lanjut: string | null }[];
        if (!skenario) return { status: "missing" as const };
        const [penghapusanSkenario] = (await tx.unsafe(
          `SELECT 1 AS ada FROM th_evidence WHERE scenario_id = $1::uuid AND path = $2 AND status = 'DELETE_PENDING' LIMIT 1`,
          [skenario.id, pathKunciHapusSkenario(skenario.id)],
        )) as unknown as { ada: number }[];
        if (penghapusanSkenario) return { status: "scenario_delete_pending" as const };
        const [bukti] = (await tx.unsafe(
          `SELECT id, path, status FROM th_evidence
           WHERE id = $1::uuid AND scenario_id = $2::uuid FOR UPDATE`, [evidenceId, skenario.id],
        )) as unknown as { id: string; path: string; status: string }[];
        if (!bukti) return { status: "missing" as const };
        if (bukti.status === "DELETED") return { status: "done" as const, id: bukti.id, path: bukti.path };
        if (bukti.status === "DELETE_PENDING") return { status: "pending" as const, id: bukti.id, path: bukti.path };

        const [jumlah] = (await tx.unsafe(
          `SELECT count(*)::int AS n FROM th_evidence WHERE scenario_id = $1::uuid AND status = 'READY'`, [skenario.id],
        )) as unknown as { n: number }[];
        const terakhir = Number(jumlah.n) === 1;
        if (terakhir && perluAlasanHapusBuktiTerakhir(skenario.status, skenario.catatan_tindak_lanjut, alasan)) {
          return { status: "reason" as const };
        }
        if (terakhir && alasan && !skenario.catatan_tindak_lanjut?.trim()) {
          await tx.unsafe(
            `UPDATE th_scenarios SET catatan_tindak_lanjut = $2 WHERE id = $1::uuid`, [skenario.id, alasan],
          );
          await tx.unsafe(
            `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_baru)
             VALUES ($1::uuid, $2, $3::uuid, 'ubah_catatan', 'catatan_tindak_lanjut', $4)`,
            [saya.id, projectId, skenario.id, alasan],
          );
        }
        await tx.unsafe(
          `UPDATE th_evidence SET status = 'DELETE_PENDING' WHERE id = $1::uuid AND status = 'READY'`, [evidenceId],
        );
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_lama, nilai_baru)
           VALUES ($1::uuid, $2, $3::uuid, 'hapus_bukti', 'evidence_event', $4, $5)`,
          [saya.id, projectId, skenario.id, bukti.id, serialisasiAuditBukti("pending", alasan)],
        );
        return { status: "pending" as const, id: bukti.id, path: bukti.path };
      });

      if (hasilHapus.status === "missing") return NextResponse.json({ pesan: "Bukti tidak ditemukan." }, { status: 404 });
      if (hasilHapus.status === "scenario_delete_pending") {
        return NextResponse.json({ pesan: "Skenario sedang dibersihkan Admin; penghapusan bukti ditutup sementara." }, { status: 409 });
      }
      if (hasilHapus.status === "reason") {
        return NextResponse.json({ pesan: "Bukti terakhir pada skenario Gagal/Tertunda tidak dapat dihapus tanpa alasan atau catatan tindak lanjut." }, { status: 400 });
      }
      if (hasilHapus.status === "done") return NextResponse.json({ ok: true });

      try {
        await selesaikanPenghapusanBukti(hasilHapus.id, hasilHapus.path);
        if (projectId) revalidatePath(`/proyek/${projectId}`);
        return NextResponse.json({ ok: true });
      } catch (error) {
        console.error("[bukti] delete tertunda; tombstone akan direkonsiliasi", hasilHapus.id,
          error instanceof Error ? error.name : "UnknownError");
        if (projectId) revalidatePath(`/proyek/${projectId}`);
        return NextResponse.json({ ok: true, pending: true, pesan: "Penghapusan masih tertunda dan akan dicoba ulang otomatis." }, { status: 202 });
      }
    }

    return NextResponse.json({ pesan: `Aksi tidak dikenal: ${isi.aksi}` }, { status: 400 });
  } catch (error) {
    console.error("[bukti] gagal memproses", {
      aksi: isi.aksi,
      jenisGalat: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ pesan: "Gagal memproses bukti. Periksa koneksi dan coba lagi." }, { status: 500 });
  }
}

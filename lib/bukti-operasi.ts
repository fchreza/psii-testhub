import { klienMentah } from "@/db";
import { finalisasiUpload } from "@/lib/alur-bukti";
import { validasiMetadataObjek } from "@/lib/validasi-bukti";
import { BATAS_BUKTI, hapusObjek, inspeksiObjek, promosikanObjek } from "@/lib/simpanan";

type IntentUpload = {
  id: string;
  user_id: string;
  project_id: string;
  scenario_id: string;
  idempotency_key: string;
  staging_path: string;
  final_path: string;
  nama_asli: string;
  tipe: string;
  ukuran: number;
  status: string;
  evidence_id: string | null;
  expires_at: string | Date;
  staging_cleaned_at: string | Date | null;
};

export type HasilFinalisasi =
  | { status: "COMPLETED"; evidenceId: string }
  | { status: "UPLOADING"; pesan: string }
  | { status: "EXPIRED" | "REJECTED"; pesan: string };

async function intentById(id: string, userId?: string): Promise<IntentUpload | null> {
  const kondisiUser = userId ? "AND user_id = $2::uuid" : "";
  const parameter = userId ? [id, userId] : [id];
  const [intent] = (await klienMentah.unsafe(
    `SELECT id, user_id, project_id, scenario_id, idempotency_key, staging_path, final_path,
            nama_asli, tipe, ukuran, status, evidence_id, expires_at, staging_cleaned_at
     FROM th_evidence_uploads WHERE id = $1::uuid ${kondisiUser}`,
    parameter,
  )) as unknown as IntentUpload[];
  return intent ?? null;
}

async function tandaiStagingDibersihkan(intent: IntentUpload): Promise<void> {
  await hapusObjek(intent.staging_path);
  await klienMentah.unsafe(
    `UPDATE th_evidence_uploads
     SET staging_cleaned_at = CASE WHEN expires_at <= now() THEN now() ELSE NULL END,
         last_error = NULL, diubah_pada = now()
     WHERE id = $1::uuid`, [intent.id],
  );
}

async function selesaikanPenghapusan(path: string, id: string): Promise<void> {
  await hapusObjek(path);
  await klienMentah.unsafe(
    `UPDATE th_evidence SET status = 'DELETED', deleted_at = COALESCE(deleted_at, now())
     WHERE id = $1::uuid AND status = 'DELETE_PENDING'`, [id],
  );
}

/**
 * Menyelesaikan intent upload secara idempoten. Path staging saja yang dapat
 * ditulis browser; hasil final hanya dibuat server dan tidak dapat ditimpa URL itu.
 */
export async function finalisasiIntentUpload(id: string, userId?: string): Promise<HasilFinalisasi | null> {
  const intent = await intentById(id, userId);
  if (!intent) return null;

  if (intent.status === "COMPLETED") {
    if (!intent.staging_cleaned_at || new Date(intent.expires_at).getTime() > Date.now()) {
      try { await tandaiStagingDibersihkan(intent); }
      catch (error) { console.error("[bukti] staging selesai belum dapat dibersihkan", intent.id, error); }
    }
    return intent.evidence_id ? { status: "COMPLETED", evidenceId: intent.evidence_id } : null;
  }
  if (intent.status !== "UPLOADING") {
    return { status: intent.status === "EXPIRED" ? "EXPIRED" : "REJECTED", pesan: "Intent unggahan ini sudah tidak aktif. Minta URL unggah baru." };
  }

  const aktual = await inspeksiObjek(intent.staging_path);
  if (!aktual) {
    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await klienMentah.unsafe(
        `UPDATE th_evidence_uploads SET status = 'EXPIRED', last_error = 'URL upload kedaluwarsa tanpa objek', diubah_pada = now()
         WHERE id = $1::uuid AND status = 'UPLOADING'`, [intent.id],
      );
      return { status: "EXPIRED", pesan: "Waktu unggah habis dan berkas tidak ditemukan. Silakan unggah ulang." };
    }
    return { status: "UPLOADING", pesan: "Berkas belum ditemukan di penyimpanan. Unggahan mungkin belum selesai." };
  }

  const ketidakcocokan = validasiMetadataObjek(intent.ukuran, intent.tipe, aktual.ukuran, aktual.tipe, BATAS_BUKTI);
  if (ketidakcocokan) {
    await klienMentah.unsafe(
      `UPDATE th_evidence_uploads SET status = 'REJECTED', last_error = $2, diubah_pada = now()
       WHERE id = $1::uuid AND status = 'UPLOADING'`, [intent.id, ketidakcocokan],
    );
    try { await tandaiStagingDibersihkan(intent); }
    catch (error) { console.error("[bukti] object upload ditolak belum dapat dibersihkan", intent.id, error); }
    return { status: "REJECTED", pesan: ketidakcocokan };
  }

  const tersimpan = await finalisasiUpload(
    { ukuranHarapan: intent.ukuran, tipeHarapan: intent.tipe, ukuranAktual: aktual.ukuran, tipeAktual: aktual.tipe },
    BATAS_BUKTI,
    {
      promosikan: async () => {
        if (!(await inspeksiObjek(intent.final_path))) {
          await promosikanObjek(intent.staging_path, intent.final_path, intent.tipe);
        }
        const final = await inspeksiObjek(intent.final_path);
        const tidakSah = validasiMetadataObjek(intent.ukuran, intent.tipe, final?.ukuran, final?.tipe, BATAS_BUKTI);
        if (tidakSah) throw new Error(`Objek final tidak dapat diverifikasi: ${tidakSah}`);
      },
      catatTransaksi: async () => klienMentah.begin(async (tx) => {
        const [terkini] = (await tx.unsafe(
          `SELECT status, evidence_id FROM th_evidence_uploads WHERE id = $1::uuid FOR UPDATE`, [intent.id],
        )) as unknown as { status: string; evidence_id: string | null }[];
        if (!terkini) throw new Error("Intent upload tidak ditemukan.");
        if (terkini.status === "COMPLETED" && terkini.evidence_id) return terkini.evidence_id;
        if (terkini.status !== "UPLOADING") throw new Error("Intent upload tidak lagi dapat difinalisasi.");

        const [evidence] = (await tx.unsafe(
          `INSERT INTO th_evidence (scenario_id, path, nama_asli, tipe, ukuran, diunggah_oleh, status)
           VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, 'READY') RETURNING id`,
          [intent.scenario_id, intent.final_path, intent.nama_asli, intent.tipe, intent.ukuran, intent.user_id],
        )) as unknown as { id: string }[];
        await tx.unsafe(
          `INSERT INTO th_audit_logs (user_id, project_id, scenario_id, aksi, kolom, nilai_baru)
           VALUES ($1::uuid, $2, $3::uuid, 'unggah_bukti', 'bukti', $4)`,
          [intent.user_id, intent.project_id, intent.scenario_id, intent.nama_asli],
        );
        await tx.unsafe(
          `UPDATE th_evidence_uploads
           SET status = 'COMPLETED', evidence_id = $2::uuid, selesai_pada = now(), last_error = NULL, diubah_pada = now()
           WHERE id = $1::uuid`, [intent.id, evidence.id],
        );
        return evidence.id;
      }),
      bersihkanStaging: () => tandaiStagingDibersihkan(intent),
      catatGalatCleanup: (error) => console.error("[bukti] staging completed belum dapat dibersihkan", intent.id, error),
    },
  );
  return { status: "COMPLETED", evidenceId: tersimpan };
}

/** Rekonsiliasi manual: unggahan menggantung, staging sementara, dan tombstone delete. */
export async function rekonsiliasiBukti(batas = 100): Promise<{ selesai: number; tertunda: number; gagal: number }> {
  const intents = (await klienMentah.unsafe(
    `SELECT id, user_id, project_id, scenario_id, idempotency_key, staging_path, final_path,
            nama_asli, tipe, ukuran, status, evidence_id, expires_at, staging_cleaned_at
     FROM th_evidence_uploads
     WHERE status IN ('UPLOADING','COMPLETED','EXPIRED','REJECTED')
       AND (status = 'UPLOADING' OR staging_cleaned_at IS NULL OR expires_at > now())
     ORDER BY dibuat_pada LIMIT $1`, [batas],
  )) as unknown as IntentUpload[];
  let selesai = 0;
  let tertunda = 0;
  let gagal = 0;

  for (const intent of intents) {
    try {
      if (intent.status === "UPLOADING") {
        const hasil = await finalisasiIntentUpload(intent.id);
        if (hasil?.status === "COMPLETED" || hasil?.status === "EXPIRED" || hasil?.status === "REJECTED") selesai++;
        else tertunda++;
      } else {
        await tandaiStagingDibersihkan(intent);
        selesai++;
      }
    } catch (error) {
      console.error("[bukti] rekonsiliasi upload gagal", intent.id, error);
      gagal++;
    }
  }

  const penghapusan = (await klienMentah.unsafe(
    `SELECT id, path FROM th_evidence WHERE status = 'DELETE_PENDING' ORDER BY diunggah_pada LIMIT $1`, [batas],
  )) as unknown as { id: string; path: string }[];
  for (const bukti of penghapusan) {
    try {
      await selesaikanPenghapusan(bukti.path, bukti.id);
      selesai++;
    } catch (error) {
      console.error("[bukti] rekonsiliasi delete gagal", bukti.id, error);
      gagal++;
    }
  }
  return { selesai, tertunda, gagal };
}

/** Dipakai endpoint hapus dan job rekonsiliasi agar DeleteObject boleh diulang. */
export async function selesaikanPenghapusanBukti(id: string, path: string): Promise<void> {
  await selesaikanPenghapusan(path, id);
}

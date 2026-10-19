import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { bolehGenerateLaporan, bolehLihatLaporan, layakLaporan, perluPembaruan, teksLaporan, tokenPratinjau } from "@/lib/laporan-final";
import { bacaSumberLaporan } from "@/lib/laporan-final-data";
import { korelasiLaporan, metadataGalatLaporan } from "@/lib/laporan-final-error";
import type { SnapshotLaporan } from "@/lib/laporan-final-types";

const ID_PROYEK = /^PRJ-\d{3,}$/;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (isi: unknown, status = 200) => NextResponse.json(isi, { status, headers });

export function handlerLaporan({ db: klienMentah, auth: wajibMasukApi, pdf: buatPdfLaporan }: {
  db: typeof import("../db").klienMentah;
  auth: typeof import("./gerbang").wajibMasukApi;
  pdf: typeof import("./laporan-final-pdf").buatPdfLaporan;
}) {
async function GET(req: Request) {
  const correlationId = korelasiLaporan(req);
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  if (!bolehLihatLaporan(auth.pengguna.peran)) return json({ pesan: "Anda tidak memiliki akses laporan final." }, 403);
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!ID_PROYEK.test(projectId)) return json({ pesan: "ID proyek tidak sah." }, 400);
  try {
    return await klienMentah.begin("isolation level repeatable read read only", async tx => {
      const current = await bacaSumberLaporan(tx, projectId);
      if (!current) return json({ pesan: "Proyek tidak ditemukan." }, 404);
      const reports = await tx.unsafe(`SELECT id,versi,dibuat_pada,nama_penyusun,sidik_sumber
        FROM th_final_reports WHERE project_id=$1 ORDER BY versi DESC`, [projectId]);
      return json({ eligible: layakLaporan(current.sumber.proyek.jenisPengujian, current.sumber.proyek.tahap),
        bolehGenerate: bolehGenerateLaporan(auth.pengguna.peran),
        versi: reports.map(r => ({ id: r.id, versi: r.versi, dibuatPada: r.dibuat_pada,
          dibuatOleh: r.nama_penyusun, perluPembaruan: perluPembaruan(r.sidik_sumber, current.sidikSumber) })) });
    });
  } catch (error) {
    console.error("[laporan-final] daftar gagal", metadataGalatLaporan(error, correlationId));
    return json({ pesan: `Daftar laporan final belum dapat dimuat. Silakan coba lagi atau sampaikan referensi galat kepada pengelola. Referensi: ${correlationId}.`, correlationId }, 503);
  }
}

async function POST(req: Request) {
  const correlationId = korelasiLaporan(req);
  const auth = await wajibMasukApi();
  if ("tolak" in auth) return auth.tolak;
  if (!bolehGenerateLaporan(auth.pengguna.peran)) return json({ pesan: "Hanya Admin/Internal PSII dapat membuat laporan final." }, 403);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.projectId !== "string" || !ID_PROYEK.test(body.projectId)
    || !["pratinjau", "generate"].includes(body.aksi)) return json({ pesan: "Permintaan tidak sah." }, 400);
  if (body.aksi === "generate" && (body.konfirmasi !== true || typeof body.sidikSumber !== "string" || !/^[a-f0-9]{64}$/.test(body.sidikSumber))) {
    return json({ pesan: "Buka pratinjau dan konfirmasikan peringatan terlebih dahulu." }, 400);
  }
  try {
    return await klienMentah.begin("isolation level repeatable read", async tx => {
      if (body.aksi === "generate") await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`laporan-final:${body.projectId}`]);
      const current = await bacaSumberLaporan(tx, body.projectId);
      if (!current) return json({ pesan: "Proyek tidak ditemukan." }, 404);
      if (!layakLaporan(current.sumber.proyek.jenisPengujian, current.sumber.proyek.tahap)) {
        return json({ pesan: "Laporan final hanya dapat dibuat setelah proyek UAT ditandai Selesai." }, 409);
      }
      const [last] = await tx.unsafe(`SELECT COALESCE(max(versi),0)::int AS versi FROM th_final_reports WHERE project_id=$1`, [body.projectId]);
      const versi = Number(last.versi) + 1;
      const token = tokenPratinjau(current.sidikSumber, versi);
      if (body.aksi === "pratinjau") return json({ sumber: current.sumber, sidikSumber: token, versiBerikutnya: versi });
      if (body.sidikSumber !== token) return json({ pesan: "Data atau versi laporan berubah. Buka ulang pratinjau dan konfirmasikan kembali." }, 409);
      const id = randomUUID();
      const snapshot: SnapshotLaporan = { ...current.sumber, format: 1, dokumenId: id, versi,
        dibuatPada: new Date().toISOString(), dibuatOleh: teksLaporan(auth.pengguna.nama) ?? "Tidak tercatat", sidikSumber: current.sidikSumber };
      const pdf = await buatPdfLaporan(snapshot);
      await tx.unsafe(`INSERT INTO th_final_reports
        (id,project_id,versi,dibuat_pada,dibuat_oleh,nama_penyusun,sidik_sumber,snapshot,pdf)
        VALUES ($1::uuid,$2,$3,$4::timestamptz,$5::uuid,$6,$7,$8::jsonb,$9::bytea)`,
        [id,body.projectId,versi,snapshot.dibuatPada,auth.pengguna.id,snapshot.dibuatOleh,current.sidikSumber,tx.json(snapshot),pdf]);
      await tx.unsafe(`INSERT INTO th_audit_logs(user_id,project_id,aksi,kolom,nilai_baru)
        VALUES ($1::uuid,$2,'buat_laporan_final','laporan_final',$3)`, [auth.pengguna.id,body.projectId,JSON.stringify({ id,versi })]);
      return json({ id, versi }, 201);
    });
  } catch (error) {
    const metadata = metadataGalatLaporan(error, correlationId);
    const code = metadata.code;
    if (code === "23505" || code === "40001") return json({ pesan: "Laporan lain telah diterbitkan atau data berubah. Buka ulang pratinjau." }, 409);
    console.error("[laporan-final] penerbitan gagal", metadata);
    return json({ pesan: `Laporan gagal dibuat; tidak ada versi parsial yang diterbitkan. Buka ulang pratinjau sebelum mencoba lagi. Jika tetap gagal, sampaikan referensi galat kepada pengelola. Referensi: ${correlationId}.`, correlationId }, 503);
  }
}

return { GET, POST };
}

import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

/**
 * Penyimpanan berkas bukti.
 *
 * KENAPA BUCKET PRIVAT + URL BERTANDA TANGAN, bukan bucket publik:
 * Berkas contoh di kantor memuat tangkapan layar sistem OM-SPAN, termasuk nama
 * pegawai dan potongan data. Itu bukan bahan publik. Bucket publik berarti
 * siapa pun yang menebak alamatnya bisa mengunduh seluruh bukti pengujian.
 *
 * KENAPA UNGGAH LANGSUNG DARI PERAMBAN, bukan lewat server:
 * Vercel membatasi badan permintaan 4,5 MB. Bukti yang diminta PRD sampai
 * 10 MB per berkas. Kalau berkasnya dilewatkan server, unggahan gagal dengan
 * pesan yang tidak menjelaskan sebabnya. Dengan URL bertanda tangan, berkasnya
 * pergi langsung ke penyimpanan dan batas itu tidak berlaku.
 */

let _klien: S3Client | null = null;

function klien(): S3Client {
  if (_klien) return _klien;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  const id = process.env.AWS_ACCESS_KEY_ID;
  const sandi = process.env.AWS_SECRET_ACCESS_KEY;

  /*
   * Gagal KERAS kalau belum lengkap, jangan diam-diam memakai nilai contoh.
   * Penyimpanan yang salah tujuan lebih buruk daripada aplikasi yang menolak
   * jalan: berkas pengujian bisa mendarat di tempat yang tidak seharusnya.
   */
  if (!endpoint || !region || !id || !sandi) {
    throw new Error(
      "Penyimpanan belum lengkap: butuh AWS_ENDPOINT_URL_S3, AWS_REGION, " +
      "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY",
    );
  }

  _klien = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId: id, secretAccessKey: sandi },
    // Penyimpanan ini butuh penandatanganan v4; tanpa ini unggahan ditolak 403.
    forcePathStyle: true,
  });
  return _klien;
}

export function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET belum diatur");
  return b;
}

/** Jenis berkas yang boleh diunggah sebagai bukti (PRD Bagian 8). */
export const JENIS_BUKTI: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** Batas 10 MB sesuai PRD Bagian 8. */
export const BATAS_BUKTI = 10 * 1024 * 1024;

export function jenisDikenal(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(JENIS_BUKTI, mime);
}

/**
 * Kunci objek di penyimpanan.
 *
 * KENAPA BERLAPIS PER PROYEK DAN SKENARIO:
 * supaya berkas bisa ditelusuri balik ke skenarionya hanya dari namanya, dan
 * supaya menghapus satu proyek bisa dibatasi pada satu awalan kunci.
 *
 * KENAPA NAMANYA DIACAK: nama berkas asli bisa memuat nama orang atau sistem.
 * Nama acak mencegah dua unggahan saling menimpa, dan mencegah orang menebak.
 */
export function kunciBukti(projectId: string, scenarioId: string, mime: string): string {
  const ext = JENIS_BUKTI[mime] ?? "bin";
  const acak = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `bukti/${projectId}/${scenarioId}/${acak}.${ext}`;
}

/** URL untuk mengunggah, berlaku 10 menit. */
export async function urlUnggah(kunci: string, mime: string): Promise<string> {
  return getSignedUrl(
    klien(),
    new PutObjectCommand({ Bucket: bucket(), Key: kunci, ContentType: mime }),
    { expiresIn: 600 },
  );
}

/**
 * URL untuk melihat, berlaku 1 jam.
 *
 * KENAPA TIDAK PERMANEN: kalau URL-nya permanen dan tersebar, bukti pengujian
 * bisa dibuka siapa pun selamanya tanpa bisa ditarik kembali. Satu jam cukup
 * untuk membuka dan memeriksa.
 */
export async function urlLihat(kunci: string, unduh = false): Promise<string> {
  return getSignedUrl(
    klien(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: kunci,
      ...(unduh ? { ResponseContentDisposition: `attachment; filename="${kunci.split("/").pop()}"` } : {}),
    }),
    { expiresIn: 3600 },
  );
}

/** Hapus satu objek. Dipakai saat penggantian bukti atau penghapusan. */
export async function hapusObjek(kunci: string): Promise<void> {
  await klien().send(new DeleteObjectCommand({ Bucket: bucket(), Key: kunci }));
}

/**
 * Pastikan objek benar-benar ada di penyimpanan.
 *
 * KENAPA DIPERIKSA: peramban mengunggah LANGSUNG ke penyimpanan, jadi server
 * tidak melihat berkasnya lewat. Tanpa pemeriksaan ini, catatan bukti bisa
 * tercatat lengkap di database padahal berkasnya tidak pernah sampai —
 * dan itu baru ketahuan saat pimpinan membukanya.
 */
export async function objekAda(kunci: string): Promise<boolean> {
  try {
    await klien().send(new HeadObjectCommand({ Bucket: bucket(), Key: kunci }));
    return true;
  } catch {
    return false;
  }
}

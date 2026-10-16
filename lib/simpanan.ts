import {
  S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";

/** Penyimpanan privat S3-compatible untuk bukti pengujian. */
let _klien: S3Client | null = null;

function klien(): S3Client {
  if (_klien) return _klien;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;
  const region = process.env.AWS_REGION;
  const id = process.env.AWS_ACCESS_KEY_ID;
  const sandi = process.env.AWS_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !id || !sandi) {
    throw new Error("Penyimpanan belum lengkap: butuh AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
  }
  _klien = new S3Client({ endpoint, region, credentials: { accessKeyId: id, secretAccessKey: sandi }, forcePathStyle: true });
  return _klien;
}

export function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET belum diatur");
  return b;
}

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

export const BATAS_BUKTI = 10 * 1024 * 1024;
export const MASA_URL_UNGGAH_DETIK = 600;

export function jenisDikenal(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(JENIS_BUKTI, mime);
}

function namaAcak(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

/** Kunci final dibuat server dan tidak pernah ditandatangani untuk browser. */
export function kunciBukti(projectId: string, scenarioId: string, mime: string): string {
  const ext = JENIS_BUKTI[mime] ?? "bin";
  return `bukti/${projectId}/${scenarioId}/${namaAcak()}.${ext}`;
}

/** Browser hanya dapat menulis area staging, bukan objek bukti final. */
export function kunciSementara(projectId: string, scenarioId: string, mime: string): string {
  const ext = JENIS_BUKTI[mime] ?? "bin";
  return `bukti-upload/${projectId}/${scenarioId}/${namaAcak()}.${ext}`;
}

/** Content-Length ikut ditandatangani; finalisasi tetap memeriksa ukuran HEAD aktual. */
export async function urlUnggah(kunci: string, mime: string, ukuran: number): Promise<string> {
  return getSignedUrl(
    klien(),
    new PutObjectCommand({ Bucket: bucket(), Key: kunci, ContentType: mime, ContentLength: ukuran }),
    { expiresIn: MASA_URL_UNGGAH_DETIK },
  );
}

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

export type MetadataObjek = {
  ukuran: number | null;
  tipe: string | null;
  etag: string | null;
  diubahPada: Date | undefined;
};

/** HEAD membedakan objek hilang dari gangguan storage agar gangguan tidak dianggap 404. */
export async function inspeksiObjek(kunci: string): Promise<MetadataObjek | null> {
  try {
    const hasil = await klien().send(new HeadObjectCommand({ Bucket: bucket(), Key: kunci }));
    return {
      ukuran: hasil.ContentLength ?? null,
      tipe: hasil.ContentType ?? null,
      etag: hasil.ETag ?? null,
      diubahPada: hasil.LastModified,
    };
  } catch (error) {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound" || e.name === "NoSuchKey") return null;
    throw error;
  }
}

/** Copy ke path final bersifat idempoten: tujuan yang sudah ada tidak ditimpa. */
export async function promosikanObjek(staging: string, final: string, mime: string): Promise<void> {
  if (await inspeksiObjek(final)) return;
  const sumber = `/${bucket()}/${staging.split("/").map(encodeURIComponent).join("/")}`;
  await klien().send(new CopyObjectCommand({
    Bucket: bucket(),
    Key: final,
    CopySource: sumber,
    MetadataDirective: "REPLACE",
    ContentType: mime,
    Metadata: { immutable: "true" },
  }));
}

/** DeleteObject bersifat idempoten pada S3-compatible storage. */
export async function hapusObjek(kunci: string): Promise<void> {
  await klien().send(new DeleteObjectCommand({ Bucket: bucket(), Key: kunci }));
}

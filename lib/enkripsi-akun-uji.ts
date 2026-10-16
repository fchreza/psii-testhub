import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export const VERSI_FORMAT_AKUN_UJI = 1 as const;

export type DataAkunUji = { username: string; password: string };
export type PayloadTerenkripsiAkunUji = {
  formatVersion: number;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
};

function kunciEnkripsi(): Buffer {
  const master = process.env.SESI_SECRET;
  if (!master || Buffer.byteLength(master, "utf8") < 32) {
    throw new Error("SESI_SECRET harus berisi minimal 32 byte untuk membuka akun uji.");
  }
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(master, "utf8"),
    Buffer.from("psii-testhub-akun-uji-v1", "utf8"),
    Buffer.from("AES-256-GCM project testing credentials", "utf8"),
    32,
  ));
}

function aad(projectId: string): Buffer {
  if (!/^PRJ-\d{3,}$/.test(projectId)) throw new Error("ID proyek tidak sah.");
  return Buffer.from(`psii-testhub:project:${projectId}:akun-uji:v${VERSI_FORMAT_AKUN_UJI}`, "utf8");
}

/** Enkripsi username/password bersama nonce acak dan pengikatan ke ID proyek. */
export function enkripsiAkunUji(projectId: string, data: DataAkunUji): PayloadTerenkripsiAkunUji {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kunciEnkripsi(), nonce);
  cipher.setAAD(aad(projectId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return {
    formatVersion: VERSI_FORMAT_AKUN_UJI,
    nonce,
    ciphertext,
    authTag: cipher.getAuthTag(),
  };
}

/** Tolak payload yang rusak/diubah; pesan galat tidak pernah menyertakan rahasia. */
export function dekripsiAkunUji(projectId: string, payload: PayloadTerenkripsiAkunUji): DataAkunUji {
  if (payload.formatVersion !== VERSI_FORMAT_AKUN_UJI
    || payload.nonce.length !== 12
    || payload.authTag.length !== 16
    || payload.ciphertext.length === 0) {
    throw new Error("Format akun uji tidak sah.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", kunciEnkripsi(), payload.nonce);
    decipher.setAAD(aad(projectId));
    decipher.setAuthTag(payload.authTag);
    const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]).toString("utf8");
    const hasil = JSON.parse(plaintext) as Partial<DataAkunUji>;
    if (typeof hasil.username !== "string" || typeof hasil.password !== "string") {
      throw new Error("Payload akun uji tidak sah.");
    }
    return { username: hasil.username, password: hasil.password };
  } catch {
    throw new Error("Kredensial akun uji tidak dapat diverifikasi.");
  }
}

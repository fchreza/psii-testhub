import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, hkdfSync } from "node:crypto";
import { dekripsiAkunUji, enkripsiAkunUji } from "../lib/enkripsi-akun-uji";

const SECRET_SINTETIS = "synthetic-only-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DATA_SINTETIS = { username: "tester.synthetic", password: "SIT-only-password-fixture-2026" };
const ACCOUNT_ID = "a1320576-7dd9-4c0a-8964-7f002897d3c1";
const ACCOUNT_ID_LAIN = "b0320576-7dd9-4c0a-8964-7f002897d3c2";

function denganKunciSintetis<T>(uji: () => T): T {
  const sebelumnya = process.env.SESI_SECRET;
  process.env.SESI_SECRET = SECRET_SINTETIS;
  try { return uji(); }
  finally {
    if (sebelumnya === undefined) delete process.env.SESI_SECRET;
    else process.env.SESI_SECRET = sebelumnya;
  }
}

function enkripsiLegacyV1(projectId: string, data: typeof DATA_SINTETIS) {
  const master = Buffer.from(SECRET_SINTETIS, "utf8");
  const key = Buffer.from(hkdfSync(
    "sha256", master,
    Buffer.from("psii-testhub-akun-uji-v1", "utf8"),
    Buffer.from("AES-256-GCM project testing credentials", "utf8"), 32,
  ));
  const nonce = Buffer.alloc(12, 7);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`psii-testhub:project:${projectId}:akun-uji:v1`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return { formatVersion: 1, nonce, ciphertext, authTag: cipher.getAuthTag() };
}

test("AES-GCM v2 terikat pada proyek dan ID akun serta tidak menyimpan plaintext", () => {
  denganKunciSintetis(() => {
    const tersimpan = enkripsiAkunUji("PRJ-321", ACCOUNT_ID, DATA_SINTETIS);
    assert.equal(tersimpan.formatVersion, 2);
    assert.deepEqual(dekripsiAkunUji("PRJ-321", ACCOUNT_ID, tersimpan), DATA_SINTETIS);
    assert.equal(tersimpan.nonce.length, 12);
    assert.equal(tersimpan.authTag.length, 16);
    assert.equal(tersimpan.ciphertext.includes(Buffer.from(DATA_SINTETIS.password)), false);
    assert.throws(() => dekripsiAkunUji("PRJ-322", ACCOUNT_ID, tersimpan), /tidak dapat diverifikasi/);
    assert.throws(() => dekripsiAkunUji("PRJ-321", ACCOUNT_ID_LAIN, tersimpan), /tidak dapat diverifikasi/);
  });
});

test("ciphertext akun lama v1 tetap dapat dibuka tanpa migrasi plaintext", () => {
  denganKunciSintetis(() => {
    const lama = enkripsiLegacyV1("PRJ-321", DATA_SINTETIS);
    assert.deepEqual(dekripsiAkunUji("PRJ-321", ACCOUNT_ID, lama), DATA_SINTETIS);
    assert.throws(() => dekripsiAkunUji("PRJ-322", ACCOUNT_ID, lama), /tidak dapat diverifikasi/);
  });
});

test("AES-GCM menolak payload yang dimodifikasi, ID akun tidak sah, dan kunci lemah", () => {
  denganKunciSintetis(() => {
    const tersimpan = enkripsiAkunUji("PRJ-321", ACCOUNT_ID, DATA_SINTETIS);
    const rusak = { ...tersimpan, authTag: Buffer.from(tersimpan.authTag) };
    rusak.authTag[0] ^= 1;
    assert.throws(() => dekripsiAkunUji("PRJ-321", ACCOUNT_ID, rusak), /tidak dapat diverifikasi/);
    assert.throws(() => enkripsiAkunUji("PRJ-321", "bukan-uuid", DATA_SINTETIS), /ID akun tidak sah/);
  });

  const sebelumnya = process.env.SESI_SECRET;
  process.env.SESI_SECRET = "too-short";
  try {
    assert.throws(() => enkripsiAkunUji("PRJ-321", ACCOUNT_ID, DATA_SINTETIS), /minimal 32 byte/);
  } finally {
    if (sebelumnya === undefined) delete process.env.SESI_SECRET;
    else process.env.SESI_SECRET = sebelumnya;
  }
});

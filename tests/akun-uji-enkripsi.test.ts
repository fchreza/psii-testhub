import test from "node:test";
import assert from "node:assert/strict";
import { dekripsiAkunUji, enkripsiAkunUji } from "../lib/enkripsi-akun-uji";

const SECRET_SINTETIS = "synthetic-only-test-secret-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DATA_SINTETIS = { username: "tester.synthetic", password: "SIT-only-password-fixture-2026" };

function denganKunciSintetis<T>(uji: () => T): T {
  const sebelumnya = process.env.SESI_SECRET;
  process.env.SESI_SECRET = SECRET_SINTETIS;
  try { return uji(); }
  finally {
    if (sebelumnya === undefined) delete process.env.SESI_SECRET;
    else process.env.SESI_SECRET = sebelumnya;
  }
}

test("akun uji terenkripsi dan kembali sama hanya pada proyek asal", () => {
  denganKunciSintetis(() => {
    const tersimpan = enkripsiAkunUji("PRJ-321", DATA_SINTETIS);
    assert.deepEqual(dekripsiAkunUji("PRJ-321", tersimpan), DATA_SINTETIS);
    assert.equal(tersimpan.nonce.length, 12);
    assert.equal(tersimpan.authTag.length, 16);
    assert.equal(tersimpan.ciphertext.includes(Buffer.from(DATA_SINTETIS.password)), false);
    assert.throws(() => dekripsiAkunUji("PRJ-322", tersimpan), /tidak dapat diverifikasi/);
  });
});

test("AES-GCM menolak payload yang dimodifikasi dan kunci lemah", () => {
  denganKunciSintetis(() => {
    const tersimpan = enkripsiAkunUji("PRJ-321", DATA_SINTETIS);
    const rusak = { ...tersimpan, authTag: Buffer.from(tersimpan.authTag) };
    rusak.authTag[0] ^= 1;
    assert.throws(() => dekripsiAkunUji("PRJ-321", rusak), /tidak dapat diverifikasi/);
  });

  const sebelumnya = process.env.SESI_SECRET;
  process.env.SESI_SECRET = "too-short";
  try {
    assert.throws(() => enkripsiAkunUji("PRJ-321", DATA_SINTETIS), /minimal 32 byte/);
  } finally {
    if (sebelumnya === undefined) delete process.env.SESI_SECRET;
    else process.env.SESI_SECRET = sebelumnya;
  }
});

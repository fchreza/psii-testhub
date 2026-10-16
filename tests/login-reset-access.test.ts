import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const halamanMasuk = readFileSync("app/masuk/page.tsx", "utf8");
const kelolaPengguna = readFileSync("components/kelola-pengguna.tsx", "utf8");

test("formulir login tidak menawarkan reset sandi mandiri, sementara login tetap tersedia", () => {
  assert.doesNotMatch(halamanMasuk, /Lupa sandi\?|\/pulihkan-sandi/i);
  assert.match(halamanMasuk, /id="email" type="email"/);
  assert.match(halamanMasuk, /id="sandi" type="password"/);
  assert.match(halamanMasuk, /type="submit"/);
});

test("reset sandi terpusat dari halaman pengelolaan pengguna admin tetap tersedia", () => {
  assert.match(kelolaPengguna, /const resetSandi = async/);
  assert.match(kelolaPengguna, /: "Sandi baru"/);
});

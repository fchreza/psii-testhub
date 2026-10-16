import test from "node:test";
import assert from "node:assert/strict";
import { kodeLembarBerikutnya, validasiNamaLembar } from "../lib/lembar-proyek";

test("nama worksheet dipangkas, wajib terisi, dan dibatasi tanpa pemotongan diam-diam", () => {
  assert.deepEqual(validasiNamaLembar("  Penyaluran   TKD  "), { ok: true, nama: "Penyaluran TKD" });
  assert.equal(validasiNamaLembar("  ").ok, false);
  assert.equal(validasiNamaLembar(null).ok, false);
  assert.equal(validasiNamaLembar("x".repeat(201)).ok, false);
});

test("kode worksheet otomatis melewati kode lama dengan aman tanpa membedakan kapital", () => {
  assert.equal(kodeLembarBerikutnya(["A", "l001", "L002"]), "L003");
  assert.equal(kodeLembarBerikutnya([]), "L001");
  assert.ok(kodeLembarBerikutnya(["L001"]).length <= 10);
});

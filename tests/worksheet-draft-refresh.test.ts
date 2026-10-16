import test from "node:test";
import assert from "node:assert/strict";
import {
  daftarSamaReferensi,
  tundaRefreshJikaDrafAktif,
  ambilRefreshTertundaJikaAman,
} from "../lib/lembar-skenario-state";

test("array filter baru dengan baris yang sama tidak dianggap snapshot baru dan tidak membuang draft lokal", () => {
  const awal = [{ id: "scenario-1" }, { id: "scenario-2" }];
  const hasilFilterRenderBerikut = awal.filter((baris) => baris.id.startsWith("scenario"));

  assert.notEqual(hasilFilterRenderBerikut, awal, "filter membuat instance array baru");
  assert.equal(daftarSamaReferensi(awal, hasilFilterRenderBerikut), true);
  assert.equal(daftarSamaReferensi(awal, [...awal.slice(0, 1), { id: "scenario-2" }]), false,
    "objek dari snapshot server baru tetap mendeteksi perubahan nyata");
});

test("refresh yang tertunda memakai flag draft terkini dan tersedia segera setelah simpan", () => {
  const drafAktif = { current: true };
  const refreshTertunda = { current: false };

  assert.equal(tundaRefreshJikaDrafAktif(drafAktif, refreshTertunda), true);
  assert.equal(refreshTertunda.current, true);

  // Merepresentasikan callback timeout yang dibuat pada render sebelum simpan:
  // ia tetap membaca ref yang sama, bukan nilai boolean lama dari closure.
  drafAktif.current = false;
  assert.equal(tundaRefreshJikaDrafAktif(drafAktif, refreshTertunda), false);
  assert.equal(ambilRefreshTertundaJikaAman(drafAktif, refreshTertunda), true);
  assert.equal(refreshTertunda.current, false);
  assert.equal(ambilRefreshTertundaJikaAman(drafAktif, refreshTertunda), false);
});

test("pascasimpan, refresh otomatis dapat berjalan walau timeout berasal dari render saat draft aktif", () => {
  const drafAktif = { current: true };
  const refreshTertunda = { current: false };

  // Save berhasil dan callback onDraftChange(false) memperbarui ref sinkron.
  drafAktif.current = false;
  assert.equal(tundaRefreshJikaDrafAktif(drafAktif, refreshTertunda), false);
  assert.equal(refreshTertunda.current, false);
});

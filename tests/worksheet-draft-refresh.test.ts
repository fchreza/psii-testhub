import test from "node:test";
import assert from "node:assert/strict";
import {
  daftarSamaReferensi,
  tundaRefreshJikaDrafAktif,
  ambilRefreshTertundaJikaAman,
  jalankanRefreshJikaAman,
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

test("mutasi memulai refresh segera saat tidak ada draf aktif", () => {
  const drafAktif = { current: false };
  const refreshTertunda = { current: false };
  let jumlahRefresh = 0;

  assert.equal(jalankanRefreshJikaAman(drafAktif, refreshTertunda, () => { jumlahRefresh += 1; }), true);
  assert.equal(jumlahRefresh, 1, "refresh dipicu langsung, bukan menunggu timer");
  assert.equal(refreshTertunda.current, false);
});

test("mutasi saat detail masih memiliki draf mengantrekan refresh sampai aman", () => {
  const drafAktif = { current: true };
  const refreshTertunda = { current: false };
  let jumlahRefresh = 0;

  assert.equal(jalankanRefreshJikaAman(drafAktif, refreshTertunda, () => { jumlahRefresh += 1; }), false);
  assert.equal(jumlahRefresh, 0, "refresh tidak boleh menimpa detail yang belum disimpan");
  assert.equal(refreshTertunda.current, true);

  drafAktif.current = false;
  assert.equal(ambilRefreshTertundaJikaAman(drafAktif, refreshTertunda), true);
  jumlahRefresh += 1; // parent memulai refresh saat menerima sinyal ini
  assert.equal(jumlahRefresh, 1);
  assert.equal(refreshTertunda.current, false);
});

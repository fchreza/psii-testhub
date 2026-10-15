"use client";

import { useEffect, useRef, useState } from "react";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import { capWaktuID } from "@/lib/waktu";
import { BuktiSkenario } from "./bukti-skenario";
import type { Skenario } from "./tabel-skenario";
import { Spinner } from "@/components/indikator-proses";
import { Button, Feedback, Select, Textarea } from "@/components/ui";

type Riwayat = {
  id: number; aksi: string; kolom: string | null;
  nilai_lama: string | null; nilai_baru: string | null;
  pada: string; oleh: string | null;
};

const CACHE_RIWAYAT = new Map<string, { versi: string; riwayat: Riwayat[] }>();
const MAKS_CACHE_RIWAYAT = 100;

function simpanCacheRiwayat(id: string, versi: string, riwayat: Riwayat[]) {
  if (!CACHE_RIWAYAT.has(id) && CACHE_RIWAYAT.size >= MAKS_CACHE_RIWAYAT) {
    const pertama = CACHE_RIWAYAT.keys().next().value;
    if (pertama) CACHE_RIWAYAT.delete(pertama);
  }
  CACHE_RIWAYAT.delete(id);
  CACHE_RIWAYAT.set(id, { versi, riwayat });
}

type DrafSkenario = {
  judul: string; status: string; langkah_pengujian: string;
  hasil_diharapkan: string; hasil_aktual: string; catatan_tindak_lanjut: string;
};

function bentukDraf(s: Skenario): DrafSkenario {
  return {
    judul: s.judul,
    status: s.status,
    langkah_pengujian: s.langkah_pengujian ?? "",
    hasil_diharapkan: s.hasil_diharapkan ?? "",
    hasil_aktual: s.hasil_aktual ?? "",
    catatan_tindak_lanjut: s.catatan_tindak_lanjut ?? "",
  };
}

/**
 * Panel detail skenario.
 *
 * KENAPA PANEL MENDORONG TABEL, bukan menutupinya:
 * Penguji sering perlu melihat baris LAIN sambil mengisi satu skenario —
 * misalnya menyamakan catatan dengan skenario di atasnya. Panel yang menutupi
 * memaksa menutup-buka terus-menerus.
 *
 * KENAPA DORONGANNYA HANYA DI LAYAR LEBAR (>= 640px):
 * Di ponsel tidak ada ruang untuk mendorong; kalau dipaksa, tabelnya jadi
 * beberapa piksel dan panelnya sendiri tetap sempit. Di ponsel panelnya
 * menutup penuh — dan itu memang yang diinginkan di layar kecil.
 */
export function PanelSkenario({
  skenario, projectId, bolehUbah, bolehKelolaSkenario, onTutup, onUbah, isDraft, onDataMutasi, onDraftChange,
}: {
  skenario: Skenario; projectId: string; bolehUbah: boolean; bolehKelolaSkenario: boolean;
  onTutup: () => void; onUbah: (tambalan: Partial<Skenario>) => Promise<boolean>;
  isDraft: boolean; onDataMutasi?: () => void; onDraftChange?: (active: boolean) => void;
}) {
  const [riwayat, setRiwayat] = useState<Riwayat[]>(() => CACHE_RIWAYAT.get(skenario.id)?.riwayat ?? []);
  const [riwayatMuat, setRiwayatMuat] = useState(() => !CACHE_RIWAYAT.has(skenario.id));
  const [riwayatGalat, setRiwayatGalat] = useState<string | null>(null);
  const [riwayatRetry, setRiwayatRetry] = useState(0);
  const versiDrafSebelumnya = useRef(skenario);
  const [draf, setDraf] = useState<DrafSkenario>(() => bentukDraf(skenario));
  const [editorRevision, setEditorRevision] = useState(0);
  const [simpanSibuk, setSimpanSibuk] = useState(false);
  const [simpanInfo, setSimpanInfo] = useState<{ jenis: "galat" | "info"; teks: string } | null>(null);
  const [konfirmasiTutup, setKonfirmasiTutup] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const judulPanelRef = useRef<HTMLHeadingElement>(null);
  const pemicuFokusRef = useRef<HTMLElement | null>(null);
  const kotor = {
    judul: draf.judul !== skenario.judul,
    status: draf.status !== skenario.status,
    langkah_pengujian: draf.langkah_pengujian !== (skenario.langkah_pengujian ?? ""),
    hasil_diharapkan: draf.hasil_diharapkan !== (skenario.hasil_diharapkan ?? ""),
    hasil_aktual: draf.hasil_aktual !== (skenario.hasil_aktual ?? ""),
    catatan_tindak_lanjut: draf.catatan_tindak_lanjut !== (skenario.catatan_tindak_lanjut ?? ""),
  };
  const adaDrafKotor = Object.values(kotor).some(Boolean);
  const st = STATUS_UJI[draf.status as keyof typeof STATUS_UJI] ?? STATUS_UJI.PENDING;

  // Jika data berubah dari tempat lain, perbarui field yang belum disentuh,
  // tetapi pertahankan draf lokal untuk field yang sedang diedit.
  useEffect(() => {
    const sebelumnya = versiDrafSebelumnya.current;
    if (sebelumnya.versi === skenario.versi) return;
    setDraf((saatIni) => ({
      judul: saatIni.judul === sebelumnya.judul ? skenario.judul : saatIni.judul,
      status: saatIni.status === sebelumnya.status ? skenario.status : saatIni.status,
      langkah_pengujian: saatIni.langkah_pengujian === (sebelumnya.langkah_pengujian ?? "")
        ? (skenario.langkah_pengujian ?? "") : saatIni.langkah_pengujian,
      hasil_diharapkan: saatIni.hasil_diharapkan === (sebelumnya.hasil_diharapkan ?? "")
        ? (skenario.hasil_diharapkan ?? "") : saatIni.hasil_diharapkan,
      hasil_aktual: saatIni.hasil_aktual === (sebelumnya.hasil_aktual ?? "")
        ? (skenario.hasil_aktual ?? "") : saatIni.hasil_aktual,
      catatan_tindak_lanjut: saatIni.catatan_tindak_lanjut === (sebelumnya.catatan_tindak_lanjut ?? "")
        ? (skenario.catatan_tindak_lanjut ?? "") : saatIni.catatan_tindak_lanjut,
    }));
    versiDrafSebelumnya.current = skenario;
  }, [skenario]);

  function ubahDraf<K extends keyof DrafSkenario>(kunci: K, nilai: DrafSkenario[K]) {
    setDraf((x) => ({ ...x, [kunci]: nilai }));
    onDraftChange?.(true);
    setSimpanInfo(null);
  }

  async function simpanSemua() {
    if (!adaDrafKotor || simpanSibuk) return;
    if (isDraft && !draf.judul.trim()) {
      setSimpanInfo({ jenis: "galat", teks: "Judul wajib diisi untuk membuat skenario." });
      return;
    }
    const tambalan: Partial<Skenario> = {};
    if (kotor.judul) tambalan.judul = draf.judul;
    if (kotor.status) tambalan.status = draf.status;
    if (kotor.langkah_pengujian) tambalan.langkah_pengujian = draf.langkah_pengujian;
    if (kotor.hasil_diharapkan) tambalan.hasil_diharapkan = draf.hasil_diharapkan;
    if (kotor.hasil_aktual) tambalan.hasil_aktual = draf.hasil_aktual;
    if (kotor.catatan_tindak_lanjut) tambalan.catatan_tindak_lanjut = draf.catatan_tindak_lanjut;

    setSimpanSibuk(true);
    setSimpanInfo(null);
    try {
      const berhasil = await onUbah(tambalan);
      if (berhasil) {
        setSimpanInfo({ jenis: "info", teks: "Semua perubahan berhasil disimpan." });
        setEditorRevision((x) => x + 1);
        onDraftChange?.(false);
      } else {
        setSimpanInfo({ jenis: "galat", teks: "Penyimpanan gagal. Draf tetap tersedia; periksa pesan pada halaman." });
      }
    } catch {
      setSimpanInfo({ jenis: "galat", teks: "Tidak dapat menyimpan. Draf tetap tersedia; coba lagi." });
    } finally {
      setSimpanSibuk(false);
    }
  }

  function batalkanSemua() {
    setDraf(bentukDraf(skenario));
    setSimpanInfo(null);
    setEditorRevision((x) => x + 1);
    onDraftChange?.(false);
  }

  const tutupAman = () => {
    if (adaDrafKotor) { setKonfirmasiTutup(true); return; }
    onDraftChange?.(false);
    onTutup();
  };

  function buangDrafDanTutup() {
    setKonfirmasiTutup(false);
    onDraftChange?.(false);
    onTutup();
  }

  useEffect(() => {
    const aktif = document.activeElement;
    if (aktif instanceof HTMLElement && aktif !== document.body) pemicuFokusRef.current = aktif;
    if (!isDraft) judulPanelRef.current?.focus();
    return () => { requestAnimationFrame(() => pemicuFokusRef.current?.focus()); };
  }, [skenario.id, isDraft]);

  // Trap Tab di panel modal; Escape menutupnya, dengan konfirmasi bila ada draf.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (konfirmasiTutup) { setKonfirmasiTutup(false); return; }
        tutupAman(); return;
      }
      if (e.key !== "Tab") return;
      const panel = konfirmasiTutup
        ? document.getElementById("konfirmasi-tutup-skenario")
        : panelRef.current;
      if (!panel) return;
      const fokus = Array.from(panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null);
      if (!fokus.length) { e.preventDefault(); panel.focus(); return; }
      const pertama = fokus[0];
      const terakhir = fokus[fokus.length - 1];
      if (e.shiftKey && (document.activeElement === pertama || document.activeElement === panel)) {
        e.preventDefault(); terakhir.focus();
      } else if (!e.shiftKey && (document.activeElement === terakhir || document.activeElement === panel)) {
        e.preventDefault(); pertama.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tutupAman, konfirmasiTutup]);

  /*
   * Dorong isi halaman ke kiri selama panel ini terbuka.
   *
   * KENAPA MENULIS KE DOM LANGSUNG, BUKAN LEWAT STATE:
   * <main> berada di luar pohon komponen ini (dibuat oleh halaman, bukan oleh
   * tabel), jadi tidak ada props yang bisa menjangkaunya. Atributnya dipasang
   * di sini dan aturan padding-nya ada di globals.css — dipisah supaya halaman
   * lain yang memakai panel ini tidak perlu mengulang logika yang sama.
   */
  useEffect(() => {
    const m = document.querySelector("main");
    if (!m) return;
    m.setAttribute("data-panel", "buka");
    return () => m.removeAttribute("data-panel");
  }, []);

  useEffect(() => {
    let batal = false;
    if (isDraft) {
      setRiwayat([]);
      setRiwayatMuat(false);
      setRiwayatGalat(null);
      return () => { batal = true; };
    }
    const cache = CACHE_RIWAYAT.get(skenario.id);
    if (cache) setRiwayat(cache.riwayat);
    const cacheCocok = cache?.versi === skenario.versi;
    setRiwayatMuat(!cacheCocok || riwayatRetry > 0);
    setRiwayatGalat(null);
    if (cacheCocok && riwayatRetry === 0) return () => { batal = true; };
    void (async () => {
      try {
        const r = await fetch(`/api/v1/riwayat?scenarioId=${skenario.id}`);
        const j = await r.json().catch(() => ({}));
        if (batal) return;
        if (!r.ok) { setRiwayatGalat(j.pesan ?? "Riwayat tidak dapat dimuat."); return; }
        const terbaru = j.riwayat ?? [];
        simpanCacheRiwayat(skenario.id, skenario.versi, terbaru);
        setRiwayat(terbaru);
      } catch {
        if (!batal) setRiwayatGalat("Tidak dapat memuat riwayat. Periksa koneksi lalu coba lagi.");
      } finally {
        if (!batal) setRiwayatMuat(false);
      }
    })();
    return () => { batal = true; };
  }, [skenario.id, skenario.versi, isDraft, riwayatRetry]);

  return (
    <>
      <button type="button" aria-label="Tutup panel" onClick={tutupAman}
        className="fixed inset-0 z-30 bg-tinta/10" />

      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="panel-skenario-title"
        className={cn(
          "fixed right-0 top-0 z-40 h-screen w-full overflow-y-auto border-l border-garis bg-kartu",
          "sm:w-[42%] sm:max-w-[620px]",
        )}>
        <header className="sticky top-0 z-10 border-b border-garis bg-kartu px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="tabular text-[12.5px] font-medium text-tinta-3">
                {isDraft ? "Draf baru" : skenario.kode} · Tahap {skenario.fase}
              </p>
              <h2 ref={judulPanelRef} id="panel-skenario-title" tabIndex={-1} className="mt-0.5 text-[18px] font-bold leading-snug tracking-tight text-tinta">
                {draf.judul || (isDraft ? "Skenario baru" : "Tanpa judul")}
              </h2>
              <p className="mt-1 text-[12px] text-tinta-3">
                {isDraft ? "Tulis judul untuk membuat skenario. Belum ada data yang disimpan." : "Ubah beberapa bagian, lalu simpan sekaligus."}
              </p>
              {adaDrafKotor && <Feedback kind="warning" className="mt-2 px-2.5 py-2 text-[12px]">Ada teks yang belum tersimpan</Feedback>}
            </div>
            <Button type="button" variant="ghost" onClick={tutupAman} aria-label="Tutup"
              className="h-9 min-h-9 shrink-0 px-2 py-1 text-[13px]">
              Tutup
            </Button>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          <Bagian judul="Judul skenario">
            <Teks nilai={skenario.judul} draf={draf.judul}
              kosong={isDraft ? "Contoh: Verifikasi hak akses pengguna" : "Judul belum diisi"}
              ariaLabel="Judul skenario"
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("judul", v)} maksimal={200}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()}
              bukaAwal={isDraft} />
          </Bagian>

          {isDraft ? (
            <p className="rounded-md bg-kanvas px-3 py-2 text-[13px] text-tinta-2">
              Judul wajib diisi. Draf ini tetap di perangkat Anda sampai Anda memilih <strong>Buat skenario</strong>.
            </p>
          ) : (
          <>
          {/* Sifat: label kiri kecil dan redup, nilai kanan lebih terang.
              Susunan ini yang membuat panel terbaca cepat — mata menyapu kolom
              label, bukan membaca kalimat. */}
          <dl className="space-y-2.5">
            <Sifat label="Status">
              {bolehUbah ? (
                <Select value={draf.status} disabled={simpanSibuk} wrapClassName="w-auto"
                  onChange={(e) => ubahDraf("status", e.target.value)}
                  className={cn("h-9 w-auto rounded-md py-1 pl-2 pr-8 text-[13px] font-medium shadow-none", st.kelas)}>
                  {["PENDING","PASS","FAIL","BLOCKED"].map((x) => (
                    <option key={x} value={x}>{labelStatus(x)}</option>
                  ))}
                </Select>
              ) : (
                <span className={cn("rounded px-2 py-1 text-[13.5px] font-medium", st.kelas)}>
                  {labelStatus(draf.status)}
                </span>
              )}
            </Sifat>

            <Sifat label="Penguji">{skenario.penguji_nama ?? "—"}</Sifat>
            <Sifat label="Bukti">
              {skenario.jumlah_bukti > 0 ? `${skenario.jumlah_bukti} berkas` : "belum ada"}
            </Sifat>
            <Sifat label="Diubah">{capWaktuID(skenario.diubah_pada)}</Sifat>
          </dl>

          <Bagian judul="Langkah pengujian">
            <Teks nilai={skenario.langkah_pengujian} draf={draf.langkah_pengujian} kosong="Belum diisi"
              ariaLabel="Langkah pengujian"
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("langkah_pengujian", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Hasil yang diharapkan">
            <Teks nilai={skenario.hasil_diharapkan} draf={draf.hasil_diharapkan} kosong="Belum diisi"
              ariaLabel="Hasil yang diharapkan"
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("hasil_diharapkan", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Hasil aktual / temuan">
            <Teks nilai={skenario.hasil_aktual} draf={draf.hasil_aktual} kosong="Catat apa yang benar-benar terjadi saat pengujian"
              ariaLabel="Hasil aktual atau temuan"
              bolehUbah={bolehUbah} onChange={(v) => ubahDraf("hasil_aktual", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Catatan tindak lanjut">
            <Teks nilai={skenario.catatan_tindak_lanjut} draf={draf.catatan_tindak_lanjut}
              ariaLabel="Catatan tindak lanjut"
              kosong={draf.status === "FAIL" || draf.status === "BLOCKED"
                ? "WAJIB diisi untuk status Gagal atau Tertunda" : "Belum ada catatan"}
              bolehUbah={bolehUbah} onChange={(v) => ubahDraf("catatan_tindak_lanjut", v)}
              sorot={draf.status === "FAIL" || draf.status === "BLOCKED"}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <div className="border-t border-garis pt-4">
            <BuktiSkenario projectId={projectId} scenarioId={skenario.id} bolehUbah={bolehUbah} bolehHapus={bolehKelolaSkenario}
              onDataMutasi={onDataMutasi} />
          </div>

          {/* Riwayat perubahan: NFR-1 mewajibkan jejak, dan jejak yang tidak
              bisa dilihat tidak ada gunanya saat menelusuri masalah. */}
          <div className="border-t border-garis pt-4">
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">
              Riwayat perubahan
            </p>
            {riwayatMuat ? (
              <p role="status" aria-live="polite" className="inline-flex items-center gap-2 text-[13px] text-tinta-3">
                <Spinner className="h-3.5 w-3.5" />Memuat riwayat…
              </p>
            ) : riwayatGalat ? (
              <div>
                <Feedback kind="error" className="mb-2">{riwayatGalat}</Feedback>
                <Button type="button" onClick={() => { setRiwayatMuat(true); setRiwayatRetry((x) => x + 1); }}
                  disabled={riwayatMuat} aria-busy={riwayatMuat}
                  busy={riwayatMuat} className="mt-1 min-h-8 px-2.5 py-1 text-[12px]">Coba lagi</Button>
              </div>
            ) : riwayat.length === 0 ? (
              <p className="text-[13px] text-tinta-3">Belum ada perubahan tercatat</p>
            ) : (
              <ul className="space-y-2">
                {riwayat.map((x) => (
                  <li key={x.id} className="border-l-2 border-garis pl-3">
                    <p className="text-[13px] text-tinta-2">
                      {{
                        ubah_status: "Status",
                        ubah_skenario: "Perubahan skenario",
                        unggah_bukti: "Bukti diunggah",
                        hapus_bukti: "Bukti dihapus",
                        tambah_skenario: "Skenario dibuat",
                        hapus_skenario: "Skenario dihapus",
                      }[x.aksi] ?? "Perubahan"}
                      {x.nilai_lama && x.nilai_baru && x.kolom === "status" ? (
                        <>: {labelStatus(x.nilai_lama)} → <strong className="font-semibold">{labelStatus(x.nilai_baru)}</strong></>
                      ) : x.nilai_baru ? (
                        <>: {x.nilai_baru.length > 60 ? x.nilai_baru.slice(0, 60) + "…" : x.nilai_baru}</>
                      ) : null}
                    </p>
                    <p className="text-[12px] text-tinta-3">
                      {x.oleh ?? "tidak diketahui"} · {capWaktuID(x.pada)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </>
          )}
          {(bolehUbah || bolehKelolaSkenario) && (
            <div className="sticky bottom-0 -mx-6 border-t border-garis bg-kartu/95 px-6 py-3 backdrop-blur">
              {simpanInfo && <Feedback kind={simpanInfo.jenis === "galat" ? "error" : "success"} className="mb-2">{simpanInfo.teks}</Feedback>}
              <div className="flex justify-end gap-2">
                <Button type="button" onClick={batalkanSemua} disabled={!adaDrafKotor || simpanSibuk} className="text-[13px]">
                  Batalkan
                </Button>
                <Button type="button" variant="primary" onClick={() => void simpanSemua()}
                  disabled={!adaDrafKotor || (isDraft && !draf.judul.trim())} busy={simpanSibuk} className="text-[13px]">
                  {simpanSibuk ? (isDraft ? "Membuat skenario…" : "Menyimpan semua…") : (isDraft ? "Buat skenario" : "Simpan semua perubahan")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>
      {konfirmasiTutup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/50 p-4 backdrop-blur-[2px]">
          <section id="konfirmasi-tutup-skenario" tabIndex={-1} role="alertdialog" aria-labelledby="judul-konfirmasi-tutup-skenario"
            className="w-full max-w-sm rounded-xl border border-garis bg-kartu p-5 shadow-2xl">
            <h2 id="judul-konfirmasi-tutup-skenario" className="text-[16px] font-semibold text-tinta">Buang perubahan?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-tinta-2">Ada perubahan yang belum disimpan. Jika panel ditutup, perubahan tersebut akan dibuang.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button autoFocus onClick={() => setKonfirmasiTutup(false)}>Lanjutkan mengedit</Button>
              <Button variant="danger" onClick={buangDrafDanTutup}>Buang perubahan</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Sifat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-[92px] shrink-0 pt-0.5 text-[13px] text-tinta-3">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13.5px] text-tinta-2">{children}</dd>
    </div>
  );
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">{judul}</p>
      {children}
    </section>
  );
}

function Teks({
  nilai, draf, kosong, bolehUbah, onChange, sorot, maksimal = 20000, ariaLabel,
  revision, disabled, onSimpanSemua, bukaAwal = false,
}: {
  nilai: string | null; draf: string; kosong: string; bolehUbah: boolean;
  onChange: (v: string) => void; sorot?: boolean; maksimal?: number;
  revision: number; disabled: boolean; onSimpanSemua: () => void;
  ariaLabel: string; bukaAwal?: boolean;
}) {
  const [buka, setBuka] = useState(bukaAwal);
  const revisionSebelumnya = useRef(revision);
  const berubah = draf !== (nilai ?? "");
  useEffect(() => {
    if (revisionSebelumnya.current !== revision) {
      revisionSebelumnya.current = revision;
      setBuka(false);
    }
  }, [revision]);

  if (!bolehUbah) {
    return (
      <p className={cn("whitespace-pre-wrap text-[13.5px] leading-relaxed",
        draf ? "text-tinta-2" : "text-tinta-3") }>
        {draf || kosong}
      </p>
    );
  }

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)}
        className={cn("block w-full whitespace-pre-wrap rounded px-2 py-1.5 text-left text-[13.5px] leading-relaxed hover:bg-kanvas",
          draf ? "text-tinta-2" : "text-tinta-3",
          berubah && "text-aksi",
          sorot && !draf && "ring-1 ring-gagal/40")}>
        {draf || kosong}
        {berubah && <span className="ml-1 text-[11px] font-medium text-tertunda">(belum disimpan)</span>}
      </button>
    );
  }

  return (
    <div onBlur={(e) => {
      const tujuan = e.relatedTarget;
      if (tujuan instanceof Node && e.currentTarget.contains(tujuan)) return;
      setBuka(false);
    }}>
      <Textarea autoFocus rows={4} value={draf} maxLength={maksimal} disabled={disabled}
        aria-label={ariaLabel} placeholder={kosong}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onChange(nilai ?? ""); setBuka(false); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSimpanSemua(); }
        }}
        className="min-h-[96px] border-aksi px-2 py-1.5 text-[13.5px] leading-relaxed text-tinta-2 shadow-none" />
      <p className="mt-1 text-[11px] text-tinta-3">Perubahan masuk ke tombol Simpan semua · Ctrl+Enter untuk menyimpan semua</p>
    </div>
  );
}

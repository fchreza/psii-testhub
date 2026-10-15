"use client";

import { useEffect, useRef, useState } from "react";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import { capWaktuID } from "@/lib/waktu";
import { BuktiSkenario } from "./bukti-skenario";
import type { Skenario } from "./tabel-skenario";

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
  skenario, projectId, bolehUbah, bolehKelolaSkenario, onTutup, onUbah,
}: {
  skenario: Skenario; projectId: string; bolehUbah: boolean; bolehKelolaSkenario: boolean;
  onTutup: () => void; onUbah: (tambalan: Partial<Skenario>) => Promise<boolean>;
}) {
  const [riwayat, setRiwayat] = useState<Riwayat[]>(() => CACHE_RIWAYAT.get(skenario.id)?.riwayat ?? []);
  const [riwayatMuat, setRiwayatMuat] = useState(() => !CACHE_RIWAYAT.has(skenario.id));
  const [riwayatGalat, setRiwayatGalat] = useState<string | null>(null);
  const versiDrafSebelumnya = useRef(skenario);
  const [draf, setDraf] = useState<DrafSkenario>(() => bentukDraf(skenario));
  const [editorRevision, setEditorRevision] = useState(0);
  const [simpanSibuk, setSimpanSibuk] = useState(false);
  const [simpanInfo, setSimpanInfo] = useState<{ jenis: "galat" | "info"; teks: string } | null>(null);
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
    setSimpanInfo(null);
  }

  async function simpanSemua() {
    if (!adaDrafKotor || simpanSibuk) return;
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
  }

  const tutupAman = () => {
    if (adaDrafKotor && !window.confirm("Ada perubahan yang belum disimpan. Tutup panel dan buang semua draf?")) return;
    onTutup();
  };

  // Escape menutup panel. KENAPA TIDAK DIBLOKIR SAAT FOKUS DI ISIAN:
  // setelah mengetik, fokus MEMANG ada di isian — kalau diblokir, Escape mati
  // tepat saat paling dibutuhkan.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") tutupAman(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tutupAman]);

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
    const cache = CACHE_RIWAYAT.get(skenario.id);
    if (cache) setRiwayat(cache.riwayat);
    setRiwayatMuat(!cache);
    setRiwayatGalat(null);
    if (cache?.versi === skenario.versi) return () => { batal = true; };
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
  }, [skenario.id, skenario.versi]);

  return (
    <>
      <button type="button" aria-label="Tutup panel" onClick={tutupAman}
        className="fixed inset-0 z-30 bg-tinta/10" />

      <aside role="dialog" aria-label={`Detail ${skenario.kode}`}
        className={cn(
          "fixed right-0 top-0 z-40 h-screen w-full overflow-y-auto border-l border-garis bg-kartu",
          "sm:w-[42%] sm:max-w-[620px]",
        )}>
        <header className="sticky top-0 z-10 border-b border-garis bg-kartu px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="tabular text-[12.5px] font-medium text-tinta-3">
                {skenario.kode} · Tahap {skenario.fase}
              </p>
              <h2 className="mt-0.5 text-[18px] font-bold leading-snug tracking-tight text-tinta">
                {draf.judul}
              </h2>
              <p className="mt-1 text-[12px] text-tinta-3">Ubah beberapa bagian, lalu simpan sekaligus.</p>
              {adaDrafKotor && <p role="status" className="mt-1 text-[12px] font-medium text-tertunda">Ada teks yang belum tersimpan</p>}
            </div>
            <button type="button" onClick={tutupAman} aria-label="Tutup"
              className="shrink-0 rounded px-2 py-1 text-[13px] text-tinta-3 hover:bg-kanvas hover:text-tinta">
              Tutup
            </button>
          </div>
        </header>

        <div className="space-y-5 px-6 py-5">
          <Bagian judul="Judul skenario">
            <Teks nilai={skenario.judul} draf={draf.judul} kosong="Judul belum diisi"
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("judul", v)} maksimal={200}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          {/* Sifat: label kiri kecil dan redup, nilai kanan lebih terang.
              Susunan ini yang membuat panel terbaca cepat — mata menyapu kolom
              label, bukan membaca kalimat. */}
          <dl className="space-y-2.5">
            <Sifat label="Status">
              {bolehUbah ? (
                <select value={draf.status} disabled={simpanSibuk}
                  onChange={(e) => ubahDraf("status", e.target.value)}
                  className={cn("rounded px-2 py-1 text-[13.5px] font-medium", st.kelas)}>
                  {["PENDING","PASS","FAIL","BLOCKED"].map((x) => (
                    <option key={x} value={x}>{labelStatus(x)}</option>
                  ))}
                </select>
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
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("langkah_pengujian", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Hasil yang diharapkan">
            <Teks nilai={skenario.hasil_diharapkan} draf={draf.hasil_diharapkan} kosong="Belum diisi"
              bolehUbah={bolehKelolaSkenario} onChange={(v) => ubahDraf("hasil_diharapkan", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Hasil aktual / temuan">
            <Teks nilai={skenario.hasil_aktual} draf={draf.hasil_aktual} kosong="Catat apa yang benar-benar terjadi saat pengujian"
              bolehUbah={bolehUbah} onChange={(v) => ubahDraf("hasil_aktual", v)}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <Bagian judul="Catatan tindak lanjut">
            <Teks nilai={skenario.catatan_tindak_lanjut} draf={draf.catatan_tindak_lanjut}
              kosong={draf.status === "FAIL" || draf.status === "BLOCKED"
                ? "WAJIB diisi untuk status Gagal atau Tertunda" : "Belum ada catatan"}
              bolehUbah={bolehUbah} onChange={(v) => ubahDraf("catatan_tindak_lanjut", v)}
              sorot={draf.status === "FAIL" || draf.status === "BLOCKED"}
              revision={editorRevision} disabled={simpanSibuk} onSimpanSemua={() => void simpanSemua()} />
          </Bagian>

          <div className="border-t border-garis pt-4">
            <BuktiSkenario projectId={projectId} scenarioId={skenario.id} bolehUbah={bolehUbah} bolehHapus={bolehKelolaSkenario} />
          </div>

          {/* Riwayat perubahan: NFR-1 mewajibkan jejak, dan jejak yang tidak
              bisa dilihat tidak ada gunanya saat menelusuri masalah. */}
          <div className="border-t border-garis pt-4">
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-tinta-3">
              Riwayat perubahan
            </p>
            {riwayatMuat ? (
              <p className="text-[13px] text-tinta-3">Memuat riwayat…</p>
            ) : riwayatGalat ? (
              <p role="status" className="text-[13px] text-gagal">{riwayatGalat}</p>
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
          {(bolehUbah || bolehKelolaSkenario) && (
            <div className="sticky bottom-0 -mx-6 border-t border-garis bg-kartu/95 px-6 py-3 backdrop-blur">
              {simpanInfo && (
                <p role="status" className={cn("mb-2 text-[12.5px]", simpanInfo.jenis === "galat" ? "text-gagal" : "text-lulus")}>
                  {simpanInfo.teks}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={batalkanSemua} disabled={!adaDrafKotor || simpanSibuk}
                  className="rounded-md border border-garis px-3 py-2 text-[13px] text-tinta-2 disabled:opacity-50">
                  Batalkan
                </button>
                <button type="button" onClick={() => void simpanSemua()} disabled={!adaDrafKotor || simpanSibuk}
                  className="rounded-md bg-aksi px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                  {simpanSibuk ? "Menyimpan semua…" : "Simpan semua perubahan"}
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
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
  nilai, draf, kosong, bolehUbah, onChange, sorot, maksimal = 20000,
  revision, disabled, onSimpanSemua,
}: {
  nilai: string | null; draf: string; kosong: string; bolehUbah: boolean;
  onChange: (v: string) => void; sorot?: boolean; maksimal?: number;
  revision: number; disabled: boolean; onSimpanSemua: () => void;
}) {
  const [buka, setBuka] = useState(false);
  const berubah = draf !== (nilai ?? "");
  useEffect(() => { setBuka(false); }, [revision]);

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
      <textarea autoFocus rows={4} value={draf} maxLength={maksimal} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onChange(nilai ?? ""); setBuka(false); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSimpanSemua(); }
        }}
        className="w-full rounded border border-aksi bg-kartu px-2 py-1.5 text-[13.5px] leading-relaxed text-tinta-2 outline-none" />
      <p className="mt-1 text-[11px] text-tinta-3">Perubahan masuk ke tombol Simpan semua · Ctrl+Enter untuk menyimpan semua</p>
    </div>
  );
}

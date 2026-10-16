"use client";

import { useEffect, useRef, useState } from "react";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import { tanggalID } from "@/lib/waktu";
import { PanelSkenario } from "./panel-skenario";
import { Spinner } from "@/components/indikator-proses";
import { useFocusTrap } from "@/components/use-focus-trap";
import { Button, Feedback, Input, Select, Textarea } from "@/components/ui";

export type Skenario = {
  id: string; kode: string; fase: string; judul: string;
  langkah_pengujian: string | null; hasil_diharapkan: string | null; hasil_aktual: string | null;
  status: string; catatan_tindak_lanjut: string | null;
  siap_retest: boolean; module_id: string | null; urutan: number;
  penguji_id: string | null; penguji_nama: string | null;
  jumlah_bukti: number; diubah_pada: string; versi: string;
};
export type Modul = { id: string; kode: string; nama: string; urutan: number };
export type Orang = { id: string; nama: string; peran: string };

const STATUS_PILIHAN = ["PENDING","PASS","FAIL","BLOCKED"];

/**
 * Tabel skenario — 8 atribut sesuai PRD.
 *
 * KENAPA EDIT DI TEMPAT, bukan lewat halaman terpisah:
 * Menguji itu pekerjaan berulang: buka skenario, jalankan, catat, lanjut ke
 * berikutnya. Kalau setiap catatan harus lewat halaman baru, memindahkan satu
 * status jadi lima klik — dan orang berhenti memperbarui datanya. Justru itu
 * yang terjadi pada spreadsheet di kantor (10 dari 42 skenario tidak terisi).
 */
export function TabelSkenario({
  projectId, fase, skenarioAwal, modul, moduleIdDefault, orang, sayaId, bolehUbah, bolehKelolaSkenario, onDataMutasi, onDraftChange,
}: {
  projectId: string; fase: string; skenarioAwal: Skenario[];
  modul: Modul[]; moduleIdDefault: string | null; orang: Orang[]; sayaId: string; bolehUbah: boolean; bolehKelolaSkenario: boolean;
  onDataMutasi?: () => void;
  onDraftChange?: (active: boolean) => void;
}) {
  const [data, setData] = useState<Skenario[]>(skenarioAwal);
  const dataRef = useRef<Skenario[]>(skenarioAwal);
  const antreanSimpan = useRef(new Map<string, Promise<boolean>>());
  const barisMutasiAktif = useRef(new Set<string>());
  const [barisSibuk, setBarisSibuk] = useState<Set<string>>(() => new Set());
  const [pesan, setPesan] = useState<{ jenis: "galat" | "info"; teks: string } | null>(null);
  const [jumlahSimpanAktif, setJumlahSimpanAktif] = useState(0);
  const [hapusSibuk, setHapusSibuk] = useState<Set<string>>(() => new Set());
  const hapusAktif = useRef(new Set<string>());
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<Skenario | null>(null);
  const [hapusGalat, setHapusGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState({ status: "", penguji: "", cari: "" });
  // Skenario yang panelnya sedang terbuka. Disimpan sebagai ID, bukan objeknya:
  // objek yang disimpan akan basi begitu datanya diubah di tempat.
  const [bukaPanel, setBukaPanel] = useState<string | null>(null);
  const hapusDialogRef = useFocusTrap<HTMLElement>(konfirmasiHapus !== null, () => {
    if (hapusSibuk.size === 0) { setKonfirmasiHapus(null); setHapusGalat(null); }
  });

  useEffect(() => {
    dataRef.current = skenarioAwal;
    setData(skenarioAwal);
  }, [projectId, fase, skenarioAwal]);

  useEffect(() => {
    setSaring({ status: "", penguji: "", cari: "" });
  }, [projectId, fase, moduleIdDefault]);

  const perbaruiData = (ubahData: (baris: Skenario[]) => Skenario[]) => {
    const berikutnya = ubahData(dataRef.current);
    dataRef.current = berikutnya;
    setData(berikutnya);
  };

  const ubah = (id: string, tambalan: Partial<Skenario>) =>
    perbaruiData((baris) => baris.map((x) => (x.id === id ? { ...x, ...tambalan } : x)));

  /**
   * Simpan berurutan per skenario. Perubahan cepat pada kolom berbeda tidak
   * lagi memakai token versi yang sama, dan draf tetap terbuka jika gagal.
   */
  const buatSkenarioDariDraf = async (id: string, tambalan: Record<string, unknown>): Promise<boolean> => {
    const draf = dataRef.current.find((x) => x.id === id);
    if (!draf) return false;
    const judul = String(tambalan.judul ?? draf.judul).trim();
    if (!judul) {
      setPesan({ jenis: "galat", teks: "Judul skenario wajib diisi sebelum skenario dibuat." });
      return false;
    }

    setJumlahSimpanAktif((n) => n + 1);
    barisMutasiAktif.current.add(id);
    setBarisSibuk(new Set(barisMutasiAktif.current));
    setPesan(null);
    try {
      const r = await fetch("/api/v1/skenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "tambah", projectId, fase, moduleId: draf.module_id, judul }),
      });
      const j = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!r.ok) {
        setPesan({ jenis: "galat", teks: j.pesan ?? "Gagal membuat skenario. Draf Anda tetap tersedia." });
        return false;
      }

      const dibuat: Skenario = { ...draf, id: j.id, kode: j.kode, judul, versi: j.versi, diubah_pada: j.diubahPada };
      perbaruiData((baris) => [...baris.filter((x) => x.id !== id), dibuat]);
      setBukaPanel(j.id);
      onDraftChange?.(false);
      setPesan({ jenis: "info", teks: "Skenario berhasil dibuat." });
      onDataMutasi?.();
      return true;
    } catch {
      setPesan({ jenis: "galat", teks: "Tidak dapat terhubung. Draf tetap tersedia; coba simpan lagi." });
      return false;
    } finally {
      setJumlahSimpanAktif((n) => Math.max(0, n - 1));
      barisMutasiAktif.current.delete(id);
      setBarisSibuk(new Set(barisMutasiAktif.current));
    }
  };

  const simpan = (id: string, tambalan: Record<string, unknown>): Promise<boolean> => {
    if (id.startsWith("draft:")) return buatSkenarioDariDraf(id, tambalan);
    const sebelumnya = antreanSimpan.current.get(id) ?? Promise.resolve(true);
    const permintaan = sebelumnya.catch(() => false).then(async () => {
      const lama = dataRef.current.find((x) => x.id === id);
      if (!lama) return false;
      setPesan(null);
      setJumlahSimpanAktif((n) => n + 1);
      barisMutasiAktif.current.add(id);
      setBarisSibuk(new Set(barisMutasiAktif.current));

      try {
        const r = await fetch("/api/v1/skenario", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ aksi: "ubah", projectId, scenarioId: id, versi: lama.versi, ...tambalan }),
        });
        const j = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
        if (!r.ok) {
          if (j.terbaru) ubah(id, j.terbaru as Partial<Skenario>);
          setPesan({ jenis: "galat", teks: j.pesan ?? "Gagal menyimpan. Draf Anda tetap tersedia." });
          return false;
        }

        const lokal: Partial<Skenario> = {};
        if ("judul" in tambalan) lokal.judul = tambalan.judul as string;
        if ("status" in tambalan) lokal.status = tambalan.status as string;
        if ("langkahPengujian" in tambalan) lokal.langkah_pengujian = tambalan.langkahPengujian as string;
        if ("hasilDiharapkan" in tambalan) lokal.hasil_diharapkan = tambalan.hasilDiharapkan as string;
        if ("hasilAktual" in tambalan) lokal.hasil_aktual = tambalan.hasilAktual as string;
        if ("catatanTindakLanjut" in tambalan) lokal.catatan_tindak_lanjut = tambalan.catatanTindakLanjut as string;
        if ("pengujiId" in tambalan) {
          lokal.penguji_id = tambalan.pengujiId as string | null;
          lokal.penguji_nama = orang.find((o) => o.id === tambalan.pengujiId)?.nama ?? null;
        }
        if ("moduleId" in tambalan) lokal.module_id = tambalan.moduleId as string | null;
        if ("siapRetest" in tambalan) lokal.siap_retest = tambalan.siapRetest as boolean;
        ubah(id, { ...lokal, versi: j.versi, diubah_pada: j.diubahPada });
        onDataMutasi?.();
        return true;
      } catch {
        setPesan({ jenis: "galat", teks: "Tidak dapat terhubung. Draf Anda tetap tersedia; coba simpan lagi." });
        return false;
      } finally {
        setJumlahSimpanAktif((n) => Math.max(0, n - 1));
        barisMutasiAktif.current.delete(id);
        setBarisSibuk(new Set(barisMutasiAktif.current));
      }
    });

    antreanSimpan.current.set(id, permintaan);
    void permintaan.then(() => {
      if (antreanSimpan.current.get(id) === permintaan) antreanSimpan.current.delete(id);
    });
    return permintaan;
  };

  const tambah = (moduleId: string | null) => {
    const drafAda = dataRef.current.find((x) => x.id.startsWith("draft:"));
    if (drafAda) { setBukaPanel(drafAda.id); return; }
    const id = `draft:${Date.now()}`;
    perbaruiData((baris) => [...baris, {
      id, kode: "DRAF", fase, judul: "",
      langkah_pengujian: null, hasil_diharapkan: null, hasil_aktual: null,
      status: "PENDING", catatan_tindak_lanjut: null, siap_retest: false,
      module_id: moduleId, urutan: dataRef.current.length,
      penguji_id: null, penguji_nama: null, jumlah_bukti: 0,
      diubah_pada: new Date().toISOString(), versi: "draft",
    }]);
    onDraftChange?.(true);
    setPesan(null);
    setBukaPanel(id);
  };

  const hapus = async (s: Skenario) => {
    if (s.id.startsWith("draft:")) {
      perbaruiData((baris) => baris.filter((x) => x.id !== s.id));
      if (bukaPanel === s.id) setBukaPanel(null);
      onDraftChange?.(false);
      setKonfirmasiHapus(null);
      setHapusGalat(null);
      setPesan({ jenis: "info", teks: "Draf skenario dibuang; tidak ada perubahan tersimpan." });
      return;
    }
    if (hapusAktif.current.has(s.id)) return;
    setHapusGalat(null);
    setPesan(null);
    hapusAktif.current.add(s.id);
    setHapusSibuk(new Set(hapusAktif.current));
    try {
      const r = await fetch("/api/v1/skenario", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi: "hapus", projectId, scenarioId: s.id }),
      });
      const j = await r.json().catch(() => ({ pesan: "Respons server tidak dapat dibaca." }));
      if (!r.ok) {
        const error = j.pesan ?? "Gagal menghapus skenario.";
        setHapusGalat(error); setPesan({ jenis: "galat", teks: error }); return;
      }
      perbaruiData((baris) => baris.filter((x) => x.id !== s.id));
      if (bukaPanel === s.id) setBukaPanel(null);
      setKonfirmasiHapus(null);
      setHapusGalat(null);
      setPesan({ jenis: "info", teks: "Skenario berhasil dihapus." });
      onDataMutasi?.();
    } catch {
      const error = "Tidak dapat terhubung. Skenario belum dihapus.";
      setHapusGalat(error); setPesan({ jenis: "galat", teks: error });
    } finally {
      hapusAktif.current.delete(s.id);
      setHapusSibuk(new Set(hapusAktif.current));
    }
  };

  // ---- penyaringan ----
  const tersaring = data.filter((s) => {
    if (saring.status && s.status !== saring.status) return false;
    if (saring.penguji && s.penguji_id !== saring.penguji) return false;
    if (saring.cari.trim()) {
      const q = saring.cari.trim().toLowerCase();
      if (!s.kode.toLowerCase().includes(q) && !s.judul.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Kelompokkan per modul, tapi hanya kalau modulnya memang ada.
  const berModul = modul.length > 0;
  const kelompok = berModul
    ? modul.map((m) => ({ modul: m, baris: tersaring.filter((s) => s.module_id === m.id) }))
        .concat(tersaring.some((s) => !s.module_id)
          ? [{ modul: { id: "", kode: "—", nama: "Tanpa modul", urutan: 999 }, baris: tersaring.filter((s) => !s.module_id) }]
          : [])
        .filter((k) => k.baris.length > 0)
    : [{ modul: null as Modul | null, baris: tersaring }];

  const adaFilterAktif = Boolean(saring.status || saring.penguji || saring.cari.trim());
  const terpilih = data.find((x) => x.id === bukaPanel) ?? null;

  return (
    <>
      <div>
      {/* Penyaring */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-garis bg-kartu px-4 py-3">
        <div>
          <label htmlFor="f-status" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Status</label>
          <Select id="f-status" value={saring.status} wrapClassName="w-auto"
            onChange={(e) => setSaring((s) => ({ ...s, status: e.target.value }))}
            className="h-9 w-auto min-w-[120px] py-1 text-[13px]">
            <option value="">Semua</option>
            {STATUS_PILIHAN.map((x) => <option key={x} value={x}>{labelStatus(x)}</option>)}
          </Select>
        </div>

        <div>
          <label htmlFor="f-penguji" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Penguji</label>
          <Select id="f-penguji" value={saring.penguji} wrapClassName="w-full max-w-[180px]"
            onChange={(e) => setSaring((s) => ({ ...s, penguji: e.target.value }))}
            className="h-9 py-1 text-[13px]">
            <option value="">Semua</option>
            {orang.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
          </Select>
        </div>

        <div className="min-w-[160px] flex-1">
          <label htmlFor="f-cari" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Cari</label>
          <Input id="f-cari" value={saring.cari} placeholder="ID atau judul skenario"
            onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))}
            className="h-9 text-[14px]" />
        </div>

        <p className="text-[13px] text-tinta-3">
          {tersaring.filter((x) => !x.id.startsWith("draft:")).length} dari {data.filter((x) => !x.id.startsWith("draft:")).length} skenario
          {tersaring.some((x) => x.id.startsWith("draft:")) && " · draf lokal belum disimpan"}
        </p>
      </div>

      {pesan && (
        <Feedback kind={pesan.jenis === "galat" ? "error" : "info"} className="mb-3">
          {pesan.teks}
        </Feedback>
      )}

      {jumlahSimpanAktif > 0 && (
        <p role="status" aria-live="polite" className="mb-3 inline-flex items-center gap-2 text-[12.5px] text-tinta-3">
          <Spinner className="h-3.5 w-3.5 text-aksi" /> Menyimpan perubahan skenario…
        </p>
      )}

      {bolehKelolaSkenario && moduleIdDefault && data.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="primary" onClick={() => tambah(moduleIdDefault)}
            className="sentuh w-full px-4 text-[14px] shadow-sm hover:bg-[#0b5ed7] disabled:hover:bg-aksi focus-visible:ring-aksi sm:w-auto">
            {data.some((x) => x.id.startsWith("draft:")) ? (
              <>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                Lanjutkan draf
              </>
            ) : (
              <>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M10 3.75v12.5M3.75 10h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
                </svg>
                Tambah skenario
              </>
            )}
          </Button>
          <p className="text-[13px] text-tinta-3">
            {data.length} skenario {fase} · judul berikon membuka panel; kolom teks bertanda pensil dapat diedit
          </p>
        </div>
      )}

      {data.length > 0 && tersaring.length === 0 ? (
        <div className="rounded-lg border border-dashed border-garis-kuat bg-kartu px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-tinta">Tidak ada skenario yang cocok dengan filter</p>
          <p className="mt-1 text-[13.5px] text-tinta-2">Coba ubah kata pencarian atau reset semua filter.</p>
          {adaFilterAktif && <Button type="button" variant="secondary"
            onClick={() => setSaring({ status: "", penguji: "", cari: "" })}
            className="mt-4 min-h-9 px-3 py-1.5 text-[13px]">Reset filter</Button>}
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-tinta">Belum ada skenario {fase}</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
            Tambahkan skenario satu per satu, atau impor dari berkas .xlsx lewat
            skrip <code className="rounded-sm bg-kanvas px-1">npm run impor</code>.
          </p>
          {bolehKelolaSkenario && moduleIdDefault && (
            <Button type="button" variant="primary" onClick={() => tambah(moduleIdDefault)}
              className="sentuh mt-4 px-4 text-[14px] shadow-sm hover:bg-[#0b5ed7] disabled:hover:bg-aksi focus-visible:ring-aksi">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                <path d="M10 3.75v12.5M3.75 10h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
              </svg>
              Tambah skenario
            </Button>
          )}
        </div>
      ) : (
        <>
          {kelompok.map((k) => (
            <section key={k.modul?.id ?? "tanpa"} className="mb-5">
              {k.modul && (
                <h3 className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-tinta">
                  <span className="rounded-sm bg-kanvas px-1.5 py-0.5 text-[12.5px] text-tinta-2">
                    {k.modul.kode}
                  </span>
                  {k.modul.nama}
                  <span className="tabular text-[12.5px] font-normal text-tinta-3">
                    {k.baris.length} skenario
                  </span>
                </h3>
              )}
              <div className="overflow-x-auto rounded-lg border border-garis bg-kartu">
                <table className="w-full min-w-max border-collapse text-[13.5px]">
                  <thead>
                    <tr className="border-b border-garis bg-kanvas text-left">
                      {["ID","Judul Skenario","Langkah Pengujian","Hasil yang Diharapkan","Hasil aktual / temuan",
                        "Penguji","Bukti","Status","Catatan Tindak Lanjut",""].map((h, i) => (
                        <th key={i} className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-tinta-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {k.baris.map((s) => {
                      const st = STATUS_UJI[s.status as keyof typeof STATUS_UJI] ?? STATUS_UJI.PENDING;
                      return (
                        <tr key={s.id} className="group border-b border-garis align-top last:border-0 hover:bg-kanvas/50">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-tinta-2">{s.kode}</td>

                          <td className="max-w-[260px] px-3 py-2">
                            {/* Klik judul membuka panel detail — sama seperti Notion,
                                di mana baris tabel ITU SENDIRI adalah halamannya.
                                Judulnya tidak lagi diketik di tabel supaya klik-untuk-
                                buka dan klik-untuk-ketik tidak berebut tempat yang sama. */}
                            <button type="button" onClick={() => setBukaPanel(s.id)}
                              aria-label={`Buka ${s.id.startsWith("draft:") ? "draf skenario baru" : `skenario ${s.kode}`}`}
                              title="Klik untuk membuka panel detail skenario"
                              className="group flex w-full cursor-pointer items-start justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left font-medium text-tinta transition-colors hover:border-aksi/20 hover:bg-aksi-lembut/30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-aksi">
                              <span className="min-w-0 whitespace-pre-wrap wrap-break-word">{s.judul || (s.id.startsWith("draft:") ? "Skenario baru" : "—")}</span>
                              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-tinta-3 transition-colors group-hover:text-aksi">
                                <path d="M7.5 4.75h7.75v7.75M15.1 4.9 6.5 13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                              </svg>
                            </button>
                          </td>

                          <td className="max-w-[280px] px-3 py-2">
                            <TeksSel nilai={s.langkah_pengujian ?? ""} ariaLabel={`Langkah pengujian ${s.kode}`} bolehUbah={bolehKelolaSkenario} disabled={barisSibuk.has(s.id)}
                              simpan={(v) => simpan(s.id, { langkahPengujian: v })} banyakBaris />
                          </td>

                          <td className="max-w-[280px] px-3 py-2">
                            <TeksSel nilai={s.hasil_diharapkan ?? ""} ariaLabel={`Hasil yang diharapkan ${s.kode}`} bolehUbah={bolehKelolaSkenario} disabled={barisSibuk.has(s.id)}
                              simpan={(v) => simpan(s.id, { hasilDiharapkan: v })} banyakBaris />
                          </td>

                          <td className="max-w-[280px] px-3 py-2">
                            <TeksSel nilai={s.hasil_aktual ?? ""} ariaLabel={`Hasil aktual ${s.kode}`} bolehUbah={bolehUbah} disabled={barisSibuk.has(s.id)}
                              simpan={(v) => simpan(s.id, { hasilAktual: v })} banyakBaris />
                          </td>

                          <td className="px-3 py-2">
                            <Select value={s.penguji_id ?? ""} disabled={!bolehKelolaSkenario || barisSibuk.has(s.id)} aria-busy={barisSibuk.has(s.id)}
                              onChange={(e) => void simpan(s.id, { pengujiId: e.target.value || null })}
                              aria-label={`Penguji ${s.kode}`}
                              wrapClassName="max-w-[150px]" className="h-8 rounded-md border-transparent bg-transparent py-1 pl-1.5 pr-7 text-[13px] text-tinta-2 shadow-none hover:border-garis">
                              <option value="">—</option>
                              {orang.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
                            </Select>
                            {barisSibuk.has(s.id) && <Spinner className="ml-1 inline h-3.5 w-3.5" />}
                          </td>

                          {/* Kolom Bukti: unggahan berkas dikerjakan di Langkah 7.
                              Untuk sekarang ditampilkan sebagai penghitung yang
                              jujur — "belum ada" bukan kesalahan, tapi juga tidak
                              boleh tampak seperti sudah ada. */}
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setBukaPanel(s.id)}
                              className="rounded-sm px-1.5 py-0.5 text-[12.5px] font-medium hover:bg-kanvas"
                              title="Buka panel untuk mengunggah atau melihat bukti">
                              {s.jumlah_bukti > 0 ? (
                                <span className="text-aksi">{s.jumlah_bukti} berkas</span>
                              ) : (
                                <span className="text-tinta-3">belum ada</span>
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-2">
                            <Select value={s.status} disabled={!bolehKelolaSkenario || barisSibuk.has(s.id)} aria-busy={barisSibuk.has(s.id)}
                              onChange={(e) => void simpan(s.id, { status: e.target.value })}
                              aria-label={`Status ${s.kode}`}
                              wrapClassName="max-w-[145px]" className={cn("h-8 rounded-md py-1 pl-2 pr-7 text-[12.5px] font-medium shadow-none", st.kelas)}>
                              {STATUS_PILIHAN.map((x) => <option key={x} value={x}>{labelStatus(x)}</option>)}
                            </Select>
                            {barisSibuk.has(s.id) && <Spinner className="ml-1 inline h-3.5 w-3.5" />}
                          </td>

                          <td className="max-w-[260px] px-3 py-2">
                            <button type="button" onClick={() => setBukaPanel(s.id)}
                              className={cn("block w-full whitespace-pre-wrap wrap-break-word rounded-sm px-1 py-0.5 text-left",
                                s.catatan_tindak_lanjut ? "text-tinta-2" : "text-tinta-3",
                                // Status Gagal/Tertunda wajib bercatatan (PRD FR-2.5),
                                // jadi sel ini ditandai saat itu terjadi.
                                (s.status === "FAIL" || s.status === "BLOCKED")
                                  && !s.catatan_tindak_lanjut && "ring-1 ring-gagal/40",
                                "hover:bg-kanvas")}>
                              {s.catatan_tindak_lanjut
                                || ((s.status === "FAIL" || s.status === "BLOCKED")
                                  ? "Wajib diisi untuk status Gagal/Tertunda" : "Kosong")}
                            </button>
                            {s.siap_retest && (
                              <span className="mt-1 inline-block rounded-sm bg-lulus-lembut px-2 py-0.5 text-[12px] font-medium text-lulus">
                                siap diuji ulang
                              </span>
                            )}
                          </td>

                          <td className="px-2 py-2 text-right">
                            {bolehKelolaSkenario && (
                              <button type="button" onClick={() => { setHapusGalat(null); setKonfirmasiHapus(s); }} disabled={hapusSibuk.has(s.id)}
                                aria-label={s.id.startsWith("draft:") ? "Buang draf skenario" : `Hapus ${s.kode}`}
                                title={s.id.startsWith("draft:") ? "Buang draf" : "Hapus skenario"}
                                aria-busy={hapusSibuk.has(s.id)}
                                className="inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[12.5px] text-tinta-3 opacity-0 transition-opacity hover:bg-gagal-lembut hover:text-gagal focus:opacity-100 group-hover:opacity-100">
                                {hapusSibuk.has(s.id) && <Spinner className="h-3.5 w-3.5" />}
                                {hapusSibuk.has(s.id) ? "Menghapus…" : s.id.startsWith("draft:") ? "Buang draf" : "Hapus"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
      </div>

      {terpilih && (
        <PanelSkenario
          key={terpilih.id}
          skenario={terpilih}
          projectId={projectId}
          bolehUbah={bolehUbah}
          bolehKelolaSkenario={bolehKelolaSkenario}
          isDraft={terpilih.id.startsWith("draft:")}
          onDataMutasi={onDataMutasi}
          onDraftChange={onDraftChange}
          onTutup={() => {
            if (terpilih.id.startsWith("draft:")) {
              perbaruiData((baris) => baris.filter((x) => x.id !== terpilih.id));
              onDraftChange?.(false);
            }
            setBukaPanel(null);
          }}
          onUbah={(tambalan) => {
            /*
             * Perubahan dari panel memakai jalur simpan yang SAMA dengan tabel,
             * termasuk pemeriksaan konflik dan aturan "Gagal wajib bercatatan".
             * Kalau panel punya jalurnya sendiri, aturan itu akan terlewat di
             * salah satu tempat — dan itu jenis bug yang baru ketahuan lama.
             */
            const kunci = Object.keys(tambalan)[0];
            const kirim: Record<string, unknown> = {};
            if ("judul" in tambalan) kirim.judul = tambalan.judul;
            if ("status" in tambalan) kirim.status = tambalan.status;
            if ("catatan_tindak_lanjut" in tambalan) kirim.catatanTindakLanjut = tambalan.catatan_tindak_lanjut;
            if ("langkah_pengujian" in tambalan) kirim.langkahPengujian = tambalan.langkah_pengujian;
            if ("hasil_diharapkan" in tambalan) kirim.hasilDiharapkan = tambalan.hasil_diharapkan;
            if ("hasil_aktual" in tambalan) kirim.hasilAktual = tambalan.hasil_aktual;
            if (kunci && Object.keys(kirim).length === 0) kirim[kunci] = tambalan[kunci as keyof typeof tambalan];
            return simpan(terpilih.id, kirim);
          }}
        />
      )}
      {konfirmasiHapus && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
          <button type="button" aria-label="Tutup konfirmasi hapus" disabled={hapusSibuk.has(konfirmasiHapus.id)}
            onClick={() => { setKonfirmasiHapus(null); setHapusGalat(null); }}
            className="absolute inset-0 bg-tinta/45 disabled:cursor-wait" />
          <section ref={hapusDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="judul-konfirmasi-hapus-skenario"
            className="relative z-10 w-full max-w-lg rounded-xl border border-garis bg-kartu p-5 shadow-2xl sm:p-6">
            <h2 id="judul-konfirmasi-hapus-skenario" className="text-lg font-bold text-tinta">
              {konfirmasiHapus.id.startsWith("draft:") ? "Buang draf skenario?" : "Hapus skenario?"}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-2">
              {konfirmasiHapus.id.startsWith("draft:")
                ? "Draf ini belum disimpan ke server. Buang draf dari layar ini?"
                : <>Skenario <strong>{konfirmasiHapus.kode} — {konfirmasiHapus.judul}</strong> akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</>}
            </p>
            {hapusGalat && <Feedback kind="error" className="mt-3">{hapusGalat}</Feedback>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" autoFocus disabled={hapusSibuk.has(konfirmasiHapus.id)}
                onClick={() => { setKonfirmasiHapus(null); setHapusGalat(null); }}
                className="text-[13px]">Batal</Button>
              <Button type="button" variant="danger" busy={hapusSibuk.has(konfirmasiHapus.id)}
                onClick={() => void hapus(konfirmasiHapus)}
                className="text-[13px]">
                {hapusSibuk.has(konfirmasiHapus.id) ? "Menghapus…" : konfirmasiHapus.id.startsWith("draft:") ? "Buang draf" : "Hapus skenario"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/**
 * Sel teks yang bisa diklik lalu diketik.
 *
 * KENAPA DIKETIK DI TEMPAT: lihat penjelasan di atas tabel. Nilai hanya dikirim
 * lewat tombol Simpan/Ctrl+Enter atau saat fokus berpindah. Draf tetap terbuka
 * dan dapat dicoba ulang bila server menolak penyimpanan.
 */
function TeksSel({
  nilai, ariaLabel, bolehUbah, simpan, tebal, banyakBaris, wajib, disabled = false,
}: {
  nilai: string; ariaLabel: string; bolehUbah: boolean; simpan: (v: string) => Promise<boolean>;
  tebal?: boolean; banyakBaris?: boolean; wajib?: boolean; disabled?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [draf, setDraf] = useState(nilai);
  const [sibuk, setSibuk] = useState(false);
  const kunciSimpan = useRef(false);
  const batalRef = useRef(false);
  const pemicuRef = useRef<HTMLButtonElement>(null);

  function tutupDanKembalikanFokus() {
    setBuka(false);
    requestAnimationFrame(() => pemicuRef.current?.focus());
  }

  async function simpanDraf() {
    if (kunciSimpan.current) return;
    if (draf === nilai) { tutupDanKembalikanFokus(); return; }
    kunciSimpan.current = true;
    setSibuk(true);
    try {
      if (await simpan(draf)) tutupDanKembalikanFokus();
    } finally {
      kunciSimpan.current = false;
      setSibuk(false);
    }
  }

  if (!bolehUbah) {
    return (
      <span className={cn("block whitespace-pre-wrap wrap-break-word",
        tebal ? "font-medium text-tinta" : "text-tinta-2",
        !nilai && "text-tinta-3")}>
        {nilai || "—"}
      </span>
    );
  }

  if (!buka) {
    return (
      <button type="button"
        ref={pemicuRef}
        disabled={disabled}
        onClick={() => { batalRef.current = false; setDraf(nilai); setBuka(true); }}
        aria-label={`Edit ${ariaLabel}`}
        title={`Klik untuk mengedit ${ariaLabel}`}
        className={cn("group flex w-full cursor-text items-start justify-between gap-2 rounded-md border border-dashed border-garis/80 bg-transparent px-2 py-1.5 text-left transition-colors hover:border-aksi/50 hover:bg-aksi-lembut/25 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-aksi disabled:cursor-not-allowed disabled:opacity-50",
          tebal ? "font-medium text-tinta" : "text-tinta-2",
          !nilai && "text-tinta-3",
          wajib && !nilai && "border-gagal/40",
        )}>
        <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word">
          {nilai || (wajib ? "Wajib diisi untuk status Gagal/Tertunda" : "Klik untuk mengisi")}
        </span>
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-tinta-3 transition-colors group-hover:text-aksi">
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
            <path d="m12.9 4.1 3 3M4 16l3.3-.7 8.9-8.9a1.6 1.6 0 0 0-2.3-2.3L5 13 4 16Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
          </svg>
        </span>
      </button>
    );
  }

  return (
    <div onBlur={(e) => {
      const tujuan = e.relatedTarget;
      if (tujuan instanceof Node && e.currentTarget.contains(tujuan)) return;
      if (!batalRef.current && draf !== nilai) void simpanDraf();
    }}>
      {banyakBaris ? (
        <Textarea autoFocus aria-label={ariaLabel} value={draf} rows={3} maxLength={20000} disabled={sibuk || disabled}
          onChange={(e) => setDraf(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); batalRef.current = true; setDraf(nilai); tutupDanKembalikanFokus(); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void simpanDraf(); }
          }}
          className={cn("min-h-[60px] rounded-sm border-aksi px-1.5 py-1 text-[13.5px] shadow-none", tebal ? "font-medium text-tinta" : "text-tinta-2")}
        />
      ) : (
        <Input autoFocus aria-label={ariaLabel} value={draf} maxLength={20000} disabled={sibuk || disabled}
          onChange={(e) => setDraf(e.target.value)}
          onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); batalRef.current = true; setDraf(nilai); tutupDanKembalikanFokus(); }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void simpanDraf(); }
        }}
          className={cn("h-8 rounded-sm border-aksi px-1.5 py-1 text-[13.5px] shadow-none", tebal ? "font-medium text-tinta" : "text-tinta-2")}
        />
      )}
      <div className="mt-1 flex items-center gap-1.5">
        <Button type="button" variant="primary" onClick={() => void simpanDraf()} disabled={disabled || draf === nilai} busy={sibuk}
          className="min-h-7 rounded-sm px-2 py-1 text-[11.5px]">
          {sibuk ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button type="button" onClick={() => { batalRef.current = true; setDraf(nilai); tutupDanKembalikanFokus(); }} disabled={sibuk || disabled}
          className="min-h-7 rounded-sm px-2 py-1 text-[11.5px]">
          Batal
        </Button>
      </div>
    </div>
  );
}

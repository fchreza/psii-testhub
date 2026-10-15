"use client";

import { useState } from "react";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import { tanggalID } from "@/lib/waktu";

export type Skenario = {
  id: string; kode: string; fase: string; judul: string;
  langkah_pengujian: string | null; hasil_diharapkan: string | null;
  status: string; catatan_tindak_lanjut: string | null;
  siap_retest: boolean; module_id: string | null; urutan: number;
  penguji_id: string | null; penguji_nama: string | null;
  jumlah_bukti: number; diubah_pada: string;
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
  projectId, fase, skenarioAwal, modul, orang, sayaId, bolehUbah,
}: {
  projectId: string; fase: string; skenarioAwal: Skenario[];
  modul: Modul[]; orang: Orang[]; sayaId: string; bolehUbah: boolean;
}) {
  const [data, setData] = useState<Skenario[]>(skenarioAwal);
  const [pesan, setPesan] = useState<{ jenis: "galat" | "info"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [saring, setSaring] = useState({ status: "", modul: "", penguji: "", cari: "" });

  const ubah = (id: string, tambalan: Partial<Skenario>) =>
    setData((d) => d.map((x) => (x.id === id ? { ...x, ...tambalan } : x)));

  /** Simpan satu perubahan ke server. */
  const simpan = async (id: string, tambalan: Record<string, unknown>) => {
    const lama = data.find((x) => x.id === id);
    if (!lama) return;
    // Ubah tampilan dulu supaya terasa seketika; kembalikan kalau server menolak.
    const sebelum = { ...lama };
    ubah(id, tambalan as Partial<Skenario>);
    setPesan(null);

    const r = await fetch("/api/v1/skenario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aksi: "ubah", projectId, scenarioId: id,
        diubahPada: lama.diubah_pada, ...tambalan,
      }),
    });

    if (!r.ok) {
      const j = await r.json().catch(() => ({ pesan: "Gagal menyimpan" }));
      // Kembalikan ke keadaan semula: data yang tampak tersimpan padahal tidak
      // adalah kebohongan yang paling membingungkan saat pengujian.
      ubah(id, sebelum);
      setPesan({ jenis: "galat", teks: j.pesan ?? "Gagal menyimpan" });
      return;
    }
    const j = await r.json();
    if (j.diubahPada) ubah(id, { diubah_pada: j.diubahPada });
  };

  const tambah = async (moduleId: string | null) => {
    setSibuk(true); setPesan(null);
    const r = await fetch("/api/v1/skenario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi: "tambah", projectId, fase, moduleId, judul: "Skenario baru" }),
    });
    setSibuk(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({ pesan: "Gagal menambah" }));
      setPesan({ jenis: "galat", teks: j.pesan }); return;
    }
    const { id, kode } = await r.json();
    setData((d) => [...d, {
      id, kode, fase, judul: "Skenario baru",
      langkah_pengujian: null, hasil_diharapkan: null,
      status: "PENDING", catatan_tindak_lanjut: null,
      siap_retest: false, module_id: moduleId, urutan: d.length,
      penguji_id: null, penguji_nama: null, jumlah_bukti: 0,
      diubah_pada: new Date().toISOString(),
    }]);
  };

  const hapus = async (s: Skenario) => {
    setPesan(null);
    const r = await fetch("/api/v1/skenario", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aksi: "hapus", projectId, scenarioId: s.id }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({ pesan: "Gagal menghapus" }));
      setPesan({ jenis: "galat", teks: j.pesan }); return;
    }
    setData((d) => d.filter((x) => x.id !== s.id));
  };

  // ---- penyaringan ----
  const tersaring = data.filter((s) => {
    if (saring.status && s.status !== saring.status) return false;
    if (saring.modul && s.module_id !== saring.modul) return false;
    if (saring.penguji && s.penguji_id !== saring.penguji) return false;
    if (saring.cari) {
      const q = saring.cari.toLowerCase();
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

  return (
    <>
      {/* Penyaring */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-garis bg-kartu px-4 py-3">
        <div>
          <label htmlFor="f-status" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Status</label>
          <select id="f-status" value={saring.status}
            onChange={(e) => setSaring((s) => ({ ...s, status: e.target.value }))}
            className="rounded-md border border-garis-kuat px-2.5 py-1.5 text-[14px] text-tinta-2 outline-none focus:border-aksi">
            <option value="">Semua</option>
            {STATUS_PILIHAN.map((x) => <option key={x} value={x}>{labelStatus(x)}</option>)}
          </select>
        </div>

        {berModul && (
          <div>
            <label htmlFor="f-modul" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Modul</label>
            <select id="f-modul" value={saring.modul}
              onChange={(e) => setSaring((s) => ({ ...s, modul: e.target.value }))}
              className="max-w-[220px] rounded-md border border-garis-kuat px-2.5 py-1.5 text-[14px] text-tinta-2 outline-none focus:border-aksi">
              <option value="">Semua</option>
              {modul.map((m) => <option key={m.id} value={m.id}>{m.kode}. {m.nama}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="f-penguji" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Penguji</label>
          <select id="f-penguji" value={saring.penguji}
            onChange={(e) => setSaring((s) => ({ ...s, penguji: e.target.value }))}
            className="max-w-[180px] rounded-md border border-garis-kuat px-2.5 py-1.5 text-[14px] text-tinta-2 outline-none focus:border-aksi">
            <option value="">Semua</option>
            {orang.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
          </select>
        </div>

        <div className="min-w-[160px] flex-1">
          <label htmlFor="f-cari" className="mb-1 block text-[12.5px] font-medium text-tinta-3">Cari</label>
          <input id="f-cari" value={saring.cari} placeholder="ID atau judul skenario"
            onChange={(e) => setSaring((s) => ({ ...s, cari: e.target.value }))}
            className="w-full rounded-md border border-garis-kuat px-2.5 py-1.5 text-[15px] outline-none focus:border-aksi" />
        </div>

        <p className="text-[13px] text-tinta-3">
          {tersaring.length} dari {data.length} skenario
        </p>
      </div>

      {pesan && (
        <div role="alert" className={cn(
          "mb-3 rounded-lg border px-4 py-2.5 text-[13.5px]",
          pesan.jenis === "galat"
            ? "border-gagal bg-gagal-lembut text-gagal"
            : "border-aksi bg-aksi-lembut text-aksi",
        )}>
          {pesan.teks}
        </div>
      )}

      {data.length === 0 ? (
        <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-tinta">Belum ada skenario {fase}</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
            Tambahkan skenario satu per satu, atau impor dari berkas .xlsx lewat
            skrip <code className="rounded bg-kanvas px-1">npm run impor</code>.
          </p>
          {bolehUbah && (
            <button type="button" onClick={() => void tambah(modul[0]?.id ?? null)} disabled={sibuk}
              className="sentuh mt-4 rounded-md bg-aksi px-4 text-[14px] font-medium text-white disabled:opacity-60">
              Tambah skenario
            </button>
          )}
        </div>
      ) : (
        <>
          {kelompok.map((k) => (
            <section key={k.modul?.id ?? "tanpa"} className="mb-5">
              {k.modul && (
                <h3 className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-tinta">
                  <span className="rounded bg-kanvas px-1.5 py-0.5 text-[12.5px] text-tinta-2">
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
                      {["ID","Judul Skenario","Langkah Pengujian","Hasil yang Diharapkan",
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
                            <TeksSel nilai={s.judul} bolehUbah={bolehUbah}
                              simpan={(v) => void simpan(s.id, { judul: v })} tebal />
                          </td>

                          <td className="max-w-[280px] px-3 py-2">
                            <TeksSel nilai={s.langkah_pengujian ?? ""} bolehUbah={bolehUbah}
                              simpan={(v) => void simpan(s.id, { langkahPengujian: v })} banyakBaris />
                          </td>

                          <td className="max-w-[280px] px-3 py-2">
                            <TeksSel nilai={s.hasil_diharapkan ?? ""} bolehUbah={bolehUbah}
                              simpan={(v) => void simpan(s.id, { hasilDiharapkan: v })} banyakBaris />
                          </td>

                          <td className="px-3 py-2">
                            <select value={s.penguji_id ?? ""} disabled={!bolehUbah}
                              onChange={(e) => void simpan(s.id, { pengujiId: e.target.value || null })}
                              aria-label={`Penguji ${s.kode}`}
                              className="max-w-[150px] rounded border border-transparent bg-transparent px-1 py-1 text-[13.5px] text-tinta-2 hover:border-garis focus:border-aksi focus:outline-none">
                              <option value="">—</option>
                              {orang.map((o) => <option key={o.id} value={o.id}>{o.nama}</option>)}
                            </select>
                          </td>

                          {/* Kolom Bukti: unggahan berkas dikerjakan di Langkah 7.
                              Untuk sekarang ditampilkan sebagai penghitung yang
                              jujur — "belum ada" bukan kesalahan, tapi juga tidak
                              boleh tampak seperti sudah ada. */}
                          <td className="px-3 py-2">
                            {s.jumlah_bukti > 0 ? (
                              <span className="rounded bg-aksi-lembut px-2 py-0.5 text-[12.5px] font-medium text-aksi">
                                {s.jumlah_bukti} berkas
                              </span>
                            ) : (
                              <span className="text-[12.5px] text-tinta-3" title="Unggah bukti tersedia di langkah berikutnya">
                                belum ada
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2">
                            <select value={s.status} disabled={!bolehUbah}
                              onChange={(e) => void simpan(s.id, { status: e.target.value })}
                              aria-label={`Status ${s.kode}`}
                              className={cn("rounded px-2 py-1 text-[13px] font-medium", st.kelas)}>
                              {STATUS_PILIHAN.map((x) => <option key={x} value={x}>{labelStatus(x)}</option>)}
                            </select>
                          </td>

                          <td className="max-w-[260px] px-3 py-2">
                            <TeksSel nilai={s.catatan_tindak_lanjut ?? ""} bolehUbah={bolehUbah}
                              simpan={(v) => void simpan(s.id, { catatanTindakLanjut: v })}
                              banyakBaris
                              /* Status Gagal/Tertunda wajib bercatatan (PRD FR-2.5),
                                 jadi kolom ini diberi penanda saat itu terjadi. */
                              wajib={s.status === "FAIL" || s.status === "BLOCKED"} />
                            {s.siap_retest && (
                              <span className="mt-1 inline-block rounded bg-lulus-lembut px-2 py-0.5 text-[12px] font-medium text-lulus">
                                siap diuji ulang
                              </span>
                            )}
                          </td>

                          <td className="px-2 py-2 text-right">
                            {bolehUbah && (
                              <button type="button" onClick={() => void hapus(s)}
                                aria-label={`Hapus ${s.kode}`} title="Hapus skenario"
                                className="rounded px-2 py-1 text-[12.5px] text-tinta-3 opacity-0 transition-opacity hover:bg-gagal-lembut hover:text-gagal focus:opacity-100 group-hover:opacity-100">
                                Hapus
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

          {bolehUbah && (
            <div className="flex flex-wrap items-center gap-4">
              <button type="button" onClick={() => void tambah(modul[0]?.id ?? null)} disabled={sibuk}
                className="sentuh rounded-md border border-garis bg-kartu px-3.5 text-[14px] font-medium text-tinta-2 hover:border-garis-kuat disabled:opacity-60">
                {sibuk ? "Menambah…" : "Tambah skenario"}
              </button>
              <p className="text-[13px] text-tinta-3">
                {data.length} skenario {fase} · klik sel untuk mengubah
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * Sel teks yang bisa diklik lalu diketik.
 *
 * KENAPA DIKETIK DI TEMPAT: lihat penjelasan di atas tabel. Yang perlu
 * diperhatikan: nilai disimpan saat kehilangan fokus atau menekan Enter, bukan
 * setiap ketikan — supaya satu paragraf tidak menjadi 60 permintaan.
 */
function TeksSel({
  nilai, bolehUbah, simpan, tebal, banyakBaris, wajib,
}: {
  nilai: string; bolehUbah: boolean; simpan: (v: string) => void;
  tebal?: boolean; banyakBaris?: boolean; wajib?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [draf, setDraf] = useState(nilai);

  if (!bolehUbah) {
    return (
      <span className={cn("block whitespace-pre-wrap break-words",
        tebal ? "font-medium text-tinta" : "text-tinta-2",
        !nilai && "text-tinta-3")}>
        {nilai || "—"}
      </span>
    );
  }

  if (!buka) {
    return (
      <button type="button"
        onClick={() => { setDraf(nilai); setBuka(true); }}
        className={cn("block w-full whitespace-pre-wrap break-words rounded px-1 py-0.5 text-left hover:bg-kanvas",
          tebal ? "font-medium text-tinta" : "text-tinta-2",
          !nilai && "text-tinta-3",
          wajib && !nilai && "ring-1 ring-gagal/40",
        )}>
        {nilai || (wajib ? "Wajib diisi untuk status Gagal/Tertunda" : "Kosong")}
      </button>
    );
  }

  const Tag = banyakBaris ? "textarea" : "input";
  return (
    <Tag
      autoFocus
      value={draf}
      rows={banyakBaris ? 3 : undefined}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraf(e.target.value)}
      onBlur={() => { setBuka(false); if (draf !== nilai) simpan(draf); }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !banyakBaris) { e.preventDefault(); setBuka(false); if (draf !== nilai) simpan(draf); }
        // Escape membatalkan. Tanpa ini, salah klik lalu menekan Escape akan
        // tetap menyimpan draf — dan sel yang tidak sengaja disentuh terubah.
        if (e.key === "Escape") { e.preventDefault(); setDraf(nilai); setBuka(false); }
      }}
      className={cn("w-full rounded border border-aksi bg-kartu px-1.5 py-1 text-[13.5px] outline-none",
        tebal ? "font-medium text-tinta" : "text-tinta-2")}
    />
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { KemajuanProyekDashboard } from "@/components/kemajuan-proyek-dashboard";
import { cn, STATUS_UJI, labelStatus } from "@/lib/format";
import {
  filterProyekDashboard,
  type ModulDashboard,
  type ProyekDashboard,
} from "@/lib/dashboard";

const TAHAP_PROYEK = [
  ["PERSIAPAN", "Persiapan"],
  ["SIT", "Sedang SIT"],
  ["UAT", "Sedang UAT"],
  ["WAITING_SIGNOFF", "Menunggu tanda tangan"],
  ["SELESAI", "Selesai"],
] as const;

type Tertunda = {
  project_id: string;
  proyek: string;
  scenario_id: string;
  kode: string;
  judul: string;
  status: string;
  catatan_tindak_lanjut: string | null;
  penguji_nama: string | null;
  diubah_pada: string;
};

type Props = {
  proyek: ProyekDashboard[];
  modulPerProyek: ReadonlyMap<string, ModulDashboard[]>;
  perluTindak: Tertunda[];
  lihatSemua: boolean;
};

export function DashboardInteraktif({ proyek, modulPerProyek, perluTindak, lihatSemua }: Props) {
  const [tahap, setTahap] = useState("");
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [tanggalSelesai, setTanggalSelesai] = useState("");
  const [teks, setTeks] = useState("");
  const rentangTidakSah = Boolean(tanggalMulai && tanggalSelesai && tanggalMulai > tanggalSelesai);
  const filterAktif = Boolean(tahap || tanggalMulai || tanggalSelesai || teks.trim());

  const hasil = useMemo(() => {
    if (rentangTidakSah) return { proyek: [], modulPerProyek: new Map<string, ModulDashboard[]>() };
    return filterProyekDashboard(proyek, modulPerProyek, {
      tahap: tahap || null,
      tanggalMulai: tanggalMulai || null,
      tanggalSelesai: tanggalSelesai || null,
      teks,
    });
  }, [proyek, modulPerProyek, tahap, tanggalMulai, tanggalSelesai, teks, rentangTidakSah]);

  const jumlah = useMemo(() => hasil.proyek.reduce(
    (a, p) => ({
      total: a.total + p.total,
      lulus: a.lulus + p.lulus,
      gagal: a.gagal + p.gagal,
      tertunda: a.tertunda + p.tertunda,
      belum: a.belum + p.belum,
    }),
    { total: 0, lulus: 0, gagal: 0, tertunda: 0, belum: 0 },
  ), [hasil.proyek]);
  const persenTotal = jumlah.total > 0 ? Math.round((jumlah.lulus / jumlah.total) * 100) : 0;
  const projectIds = useMemo(() => new Set(hasil.proyek.map((item) => item.id)), [hasil.proyek]);
  const tindakTersaring = perluTindak.filter((item) => projectIds.has(item.project_id));

  function resetFilter() {
    setTahap("");
    setTanggalMulai("");
    setTanggalSelesai("");
    setTeks("");
  }

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-tinta">Dashboard pengujian</h1>
        <p className="mt-1 text-[14px] text-tinta-2">
          {lihatSemua
            ? `${hasil.proyek.length} dari ${proyek.length} proyek di seluruh subdit ditampilkan`
            : `${hasil.proyek.length} dari ${proyek.length} proyek yang Anda menjadi anggotanya ditampilkan`}
        </p>
      </header>

      <section aria-labelledby="judul-filter-dashboard" className="mb-6 rounded-lg border border-garis bg-kartu p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="judul-filter-dashboard" className="text-[15px] font-semibold text-tinta">Filter dashboard</h2>
          <span role="status" aria-live="polite" aria-atomic="true" className="text-[12px] text-tinta-3">
            {rentangTidakSah ? "Perbaiki periode untuk melihat hasil." : `${hasil.proyek.length} proyek cocok`}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="dashboard-cari" label="Cari proyek atau modul">
            <Input id="dashboard-cari" type="search" value={teks} onChange={(e) => setTeks(e.target.value)}
              placeholder="Nama, ID, aplikasi, kode modul…" autoComplete="off"
              aria-describedby="dashboard-bantuan" />
          </Field>
          <Field id="dashboard-tahap" label="Tahap proyek">
            <Select id="dashboard-tahap" value={tahap} onChange={(e) => setTahap(e.target.value)}
              aria-describedby="dashboard-bantuan">
              <option value="">Semua tahap</option>
              {TAHAP_PROYEK.map(([nilai, label]) => <option key={nilai} value={nilai}>{label}</option>)}
            </Select>
          </Field>
          <Field id="dashboard-tanggal-mulai" label="Periode mulai">
            <Input id="dashboard-tanggal-mulai" type="date" value={tanggalMulai}
              onChange={(e) => setTanggalMulai(e.target.value)} aria-describedby="dashboard-bantuan dashboard-galat-periode"
              aria-invalid={rentangTidakSah || undefined} />
          </Field>
          <Field id="dashboard-tanggal-selesai" label="Periode selesai">
            <Input id="dashboard-tanggal-selesai" type="date" value={tanggalSelesai}
              onChange={(e) => setTanggalSelesai(e.target.value)} aria-describedby="dashboard-bantuan dashboard-galat-periode"
              aria-invalid={rentangTidakSah || undefined} />
          </Field>
        </div>

        <p id="dashboard-bantuan" className="mt-3 text-[12px] leading-relaxed text-tinta-3">
          Tahap menyaring tahap proyek. Periode mencocokkan jadwal proyek dari tanggal mulai hingga target selesai secara inklusif;
          tanggal jadwal yang kosong dianggap tanpa batas. Pencarian mencakup nama/ID/unit/aplikasi/modul/jenis pengujian proyek
          serta kode/nama modul; bila hanya modul yang cocok, hanya modul itu yang ditampilkan. KPI dan progres tetap menghitung
          seluruh skenario pada proyek yang lolos filter.
        </p>
        {rentangTidakSah && (
          <p id="dashboard-galat-periode" role="alert" className="mt-2 text-[13px] font-medium text-gagal">
            Tanggal mulai harus sama dengan atau lebih awal dari tanggal selesai.
          </p>
        )}
        {!rentangTidakSah && <span id="dashboard-galat-periode" className="sr-only">Rentang tanggal valid.</span>}
        {filterAktif && (
          <div className="mt-3">
            <Button type="button" onClick={resetFilter} className="min-h-9 px-3 py-1.5 text-[12.5px]">
              Reset filter
            </Button>
          </div>
        )}
      </section>

      {proyek.length === 0 ? (
        <div className="rounded-lg border border-garis bg-kartu px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-tinta">Belum ada proyek untuk ditampilkan</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
            Proyek akan muncul setelah dibuat atau saat Anda mendapat akses sebagai anggota.
          </p>
        </div>
      ) : hasil.proyek.length === 0 ? (
        <div role="status" className="rounded-lg border border-dashed border-garis-kuat bg-kartu px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-tinta">Tidak ada proyek yang cocok</p>
          <p className="mx-auto mt-1 max-w-md text-[14px] leading-relaxed text-tinta-2">
            Ubah kriteria pencarian atau periode, atau reset filter untuk melihat semua proyek.
          </p>
          {filterAktif && (
            <Button type="button" onClick={resetFilter} className="mt-4 min-h-9 px-3 py-1.5 text-[12.5px]">
              Reset filter
            </Button>
          )}
        </div>
      ) : (
        <>
          <section aria-label="Ringkasan proyek yang ditampilkan" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {([
              ["Total skenario", jumlah.total, "text-tinta", "proyek yang tampil"],
              ["Lulus", jumlah.lulus, "text-lulus", `${persenTotal}% dari total yang tampil`],
              ["Gagal", jumlah.gagal, "text-gagal", "butuh perbaikan"],
              ["Tertunda", jumlah.tertunda, "text-tertunda", "terhalang"],
              ["Belum diuji", jumlah.belum, "text-tinta-3", "belum dijalankan"],
            ] as [string, number, string, string][]).map(([label, nilai, warna, keterangan]) => (
              <div key={label} className="rounded-lg border border-garis bg-kartu px-4 py-3.5">
                <p className="text-[12px] font-medium uppercase tracking-wide text-tinta-3">{label}</p>
                <p className={cn("tabular mt-1 text-[26px] font-bold leading-none", warna)}>{nilai}</p>
                <p className="mt-1 text-[12px] text-tinta-3">{keterangan}</p>
              </div>
            ))}
          </section>

          <KemajuanProyekDashboard proyek={hasil.proyek} modulPerProyek={hasil.modulPerProyek} />

          <section aria-label="Perlu tindak lanjut">
            <h2 className="mb-2 text-[15px] font-semibold text-tinta">
              Perlu tindak lanjut
              {tindakTersaring.length > 0 && (
                <span className="tabular ml-2 text-[13px] font-normal text-tinta-3">{tindakTersaring.length} skenario</span>
              )}
            </h2>
            {tindakTersaring.length === 0 ? (
              <p className="rounded-lg border border-garis bg-kartu px-5 py-6 text-center text-[14px] text-tinta-2">
                Tidak ada skenario Gagal atau Tertunda pada proyek yang ditampilkan.
              </p>
            ) : (
              <ul className="divide-y divide-garis overflow-hidden rounded-lg border border-garis bg-kartu">
                {tindakTersaring.map((s) => {
                  const status = STATUS_UJI[s.status as keyof typeof STATUS_UJI] ?? STATUS_UJI.PENDING;
                  return (
                    <li key={s.scenario_id}>
                      <Link href={`/proyek/${s.project_id}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 hover:bg-kanvas">
                        <span className="tabular shrink-0 text-[12.5px] text-tinta-3">{s.kode}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] font-medium text-tinta">{s.judul}</span>
                          <span className="block text-[12.5px] text-tinta-3">
                            {s.proyek}{s.penguji_nama ? ` · ${s.penguji_nama}` : ""}
                            {s.catatan_tindak_lanjut ? ` · ${s.catatan_tindak_lanjut.slice(0, 70)}` : " · belum ada catatan"}
                          </span>
                        </span>
                        <span className={cn("shrink-0 rounded-sm px-2 py-0.5 text-[12.5px] font-medium", status.kelas)}>
                          {labelStatus(s.status)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

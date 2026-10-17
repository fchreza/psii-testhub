"use client";

import type { ReactNode } from "react";
import { labelJenisPengujian } from "@/lib/fase-proyek";
import { tanggalID } from "@/lib/waktu";
import { useMetadataProyek } from "@/components/metadata-proyek-state";

type PIC = { id: string; nama: string };

export function InformasiProyek({ pic, children }: { pic: PIC[]; children?: ReactNode }) {
  const { metadata } = useMetadataProyek();
  const namaPic = metadata.pmId
    ? pic.find((orang) => orang.id === metadata.pmId)?.nama ?? metadata.pmNama
    : metadata.pmNama;
  const informasi: [string, unknown][] = [
    ["Aplikasi", metadata.aplikasi],
    ["Modul", metadata.modul],
    ["Jenis pengujian", labelJenisPengujian(metadata.jenisPengujian)],
    ["Ruang lingkup", metadata.ruangLingkup],
    ["Dasar regulasi", metadata.dasarRegulasi],
    ["Alamat pengujian", metadata.alamatPengujian],
    ["Tahun anggaran", metadata.tahunAnggaran],
    ["Tanggal mulai", metadata.tanggalMulai ? tanggalID(metadata.tanggalMulai) : null],
    ["Target selesai", metadata.targetSelesai ? tanggalID(metadata.targetSelesai) : null],
    ["PIC", namaPic],
  ];

  return (
    <section aria-labelledby="informasi-proyek" className="mb-5 overflow-hidden rounded-xl border border-garis bg-kartu shadow-xs shadow-tinta/3">
      <div className="border-b border-garis px-4 py-3 sm:px-5">
        <h2 id="informasi-proyek" className="text-[14px] font-semibold text-tinta">Informasi proyek</h2>
      </div>
      <dl className="grid sm:grid-cols-2 lg:grid-cols-3">
        {informasi.map(([label, nilai]) => (
          <div key={label} className="min-w-0 border-b border-garis px-4 py-3.5 sm:px-5">
            <dt className="text-[12px] font-medium text-tinta-3">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap wrap-break-word text-[14px] leading-relaxed text-tinta">
              {nilai === null || nilai === undefined || nilai === "" ? <span className="text-tinta-3">—</span> : String(nilai)}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

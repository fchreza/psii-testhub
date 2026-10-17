"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type MetadataProyek = {
  nama: string;
  aplikasi: string | null;
  modul: string | null;
  jenisPengujian: string;
  ruangLingkup: string | null;
  dasarRegulasi: string | null;
  alamatPengujian: string | null;
  tahunAnggaran: number | null;
  tanggalMulai: string | Date | null;
  targetSelesai: string | Date | null;
  pmId: string | null;
  pmNama: string | null;
};

type NilaiMetadata = {
  metadata: MetadataProyek;
  perbaruiMetadata: (tambalan: Partial<MetadataProyek>) => void;
};

const KonteksMetadata = createContext<NilaiMetadata | null>(null);

export function MetadataProyekProvider({
  awal,
  children,
}: {
  awal: MetadataProyek;
  children: ReactNode;
}) {
  const [metadata, setMetadata] = useState(awal);
  const perbaruiMetadata = useCallback((tambalan: Partial<MetadataProyek>) => {
    setMetadata((sebelumnya) => ({ ...sebelumnya, ...tambalan }));
  }, []);
  useEffect(() => setMetadata(awal), [awal]);

  return (
    <KonteksMetadata.Provider value={{ metadata, perbaruiMetadata }}>
      {children}
    </KonteksMetadata.Provider>
  );
}

export function useMetadataProyek(): NilaiMetadata {
  const nilai = useContext(KonteksMetadata);
  if (!nilai) throw new Error("MetadataProyekProvider belum dipasang.");
  return nilai;
}

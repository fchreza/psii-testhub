"use client";

import { useMetadataProyek } from "@/components/metadata-proyek-state";

export function NamaProyek() {
  const { metadata } = useMetadataProyek();
  return <h1 className="text-2xl font-bold tracking-tight text-tinta">{metadata.nama}</h1>;
}

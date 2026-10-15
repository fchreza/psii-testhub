"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TombolKeluar() {
  const [sibuk, setSibuk] = useState(false);
  const router = useRouter();

  return (
    <button type="button" disabled={sibuk}
      onClick={async () => {
        setSibuk(true);
        await fetch("/api/v1/keluar", { method: "POST" });
        router.refresh();
        router.push("/masuk");
      }}
      className="rounded px-2.5 py-1.5 text-[13.5px] text-tinta-3 hover:bg-kanvas hover:text-tinta">
      {sibuk ? "Keluar…" : "Keluar"}
    </button>
  );
}

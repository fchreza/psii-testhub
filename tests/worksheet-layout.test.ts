import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worksheet = readFileSync("components/lembar-skenario.tsx", "utf8");

test("form lembar menyelaraskan tombol dengan input dan memisahkan hint pada grid responsif", () => {
  assert.match(worksheet, /className="grid gap-3 bg-kartu[^\"]*sm:grid-cols-\[minmax\(0,1fr\)_auto\][^\"]*sm:items-end/);
  assert.match(worksheet, /<Field id=\{idNama\} label="Nama kelompok \/ modul \/ menu" required>\s*<Input id=\{idNama\} aria-describedby=\{`\$\{idNama\}-hint`\}/);
  assert.match(worksheet, /<p id=\{`\$\{idNama\}-hint`\} className="text-\[12px\][^\"]*sm:col-span-2"/);
  assert.match(worksheet, /<SaveButton type="submit" variant="primary" busy=\{sibuk\} loadingText="Membuat lembar…" disabled=\{disabled \|\| !nama\.trim\(\)\} className="w-full sm:w-auto">\s*Buat lembar\s*<\/SaveButton>/);
});

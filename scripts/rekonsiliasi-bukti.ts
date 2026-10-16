import { rekonsiliasiBukti } from "../lib/bukti-operasi";

rekonsiliasiBukti().then((hasil) => {
  console.log("Rekonsiliasi bukti selesai:", hasil);
  if (hasil.gagal > 0) process.exitCode = 1;
}).catch((error) => {
  console.error("Rekonsiliasi bukti gagal:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

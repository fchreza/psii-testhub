import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "../lib/format";

test("cn mempertahankan penggabungan konflik utility Tailwind v4", () => {
  assert.equal(cn("rounded-sm rounded-lg"), "rounded-lg");
  assert.equal(cn("bg-aksi bg-gagal"), "bg-gagal");
  assert.equal(cn("focus-visible:ring-2 focus-visible:ring-4"), "focus-visible:ring-4");
  assert.equal(cn("shadow-xs shadow-lg"), "shadow-lg");
});

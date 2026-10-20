import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveButton } from "../components/save-button";

function render(props: Partial<Parameters<typeof SaveButton>[0]> = {}) {
  return renderToStaticMarkup(createElement(SaveButton, {
    children: "Simpan proyek", loadingText: "Menyimpan…", ...props,
  }));
}

test("SaveButton idle tetap tombol native dengan tipe eksplisit dan label aksesibel tunggal", () => {
  const html = render({ type: "submit", name: "aksi", value: "simpan", "aria-describedby": "petunjuk" });
  assert.match(html, /^<button[^>]*type="submit"/);
  assert.match(html, /name="aksi"/);
  assert.match(html, /value="simpan"/);
  assert.match(html, /aria-describedby="petunjuk"/);
  assert.match(html, /aria-label="Simpan proyek"/);
  assert.doesNotMatch(html, / disabled=""|aria-busy="true"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true">Simpan proyek/);
});

test("loading terkendali menonaktifkan tombol dan hanya menampilkan satu spinner", () => {
  const html = render({ busy: true });
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true">Menyimpan…/);
  assert.equal((html.match(/<svg/g) ?? []).length, 1);
  assert.match(html, /motion-reduce:animate-none/);
});

test("disabled dari validasi tetap berlaku saat idle dan varian serta kelas diteruskan", () => {
  const html = render({ disabled: true, variant: "primary", className: "w-full rounded-md" });
  assert.match(html, /disabled=""/);
  assert.match(html, /bg-aksi/);
  assert.match(html, /w-full/);
  assert.match(html, /rounded-md/);
  assert.doesNotMatch(html, /rounded-lg/);
});

test("selesai atau gagal tidak otomatis dianggap sukses; caller harus menyatakan sukses", () => {
  const idle = render({ busy: false });
  assert.doesNotMatch(idle, /<svg|>Tersimpan</);
  const sukses = render({ success: true, successText: "Proyek tersimpan" });
  assert.match(sukses, /role="status" aria-live="polite" aria-atomic="true">Proyek tersimpan/);
  assert.match(sukses, /bg-lulus/);
  const masihSibuk = render({ busy: true, success: true });
  assert.match(masihSibuk, /aria-atomic="true">Menyimpan…/);
  assert.doesNotMatch(masihSibuk, /bg-lulus/);
});

test("animasi menghormati reduced motion, tidak memakai timer demo, dan mereservasi ukuran label", () => {
  const source = readFileSync("components/save-button.tsx", "utf8");
  assert.match(source, /useReducedMotion/);
  assert.match(source, /reducedMotion === false/);
  assert.doesNotMatch(source, /setTimeout|setInterval/);
  assert.match(source, /\[children, loadingText/);
  assert.match(source, /invisible col-start-1 row-start-1/);
});

test("aksi masuk, lembar, skenario, dan proyek menggunakan state proses yang ada", () => {
  for (const [path, state] of [
    ["app/masuk/page.tsx", "sibuk"],
    ["components/lembar-skenario.tsx", "sibuk"],
    ["components/panel-skenario.tsx", "simpanSibuk"],
    ["components/tombol-proyek-baru.tsx", "sibuk"],
    ["components/editor-metadata-proyek.tsx", "sibuk"],
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /import \{ SaveButton \} from "@\/components\/save-button"/);
    assert.match(source, new RegExp(`<SaveButton[\\s\\S]*?busy=\\{${state}\\}[\\s\\S]*?loadingText=`), path);
  }
});

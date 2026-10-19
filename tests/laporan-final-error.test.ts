import test from "node:test";
import assert from "node:assert/strict";
import { korelasiLaporan, metadataGalatLaporan } from "../lib/laporan-final-error";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/laporan-final", { headers });
}

test("korelasiLaporan preserves valid production-style Vercel IDs, including region:: forms", () => {
  for (const value of [
    "zz5fx-1792381087406-58fcc57b1ee0",
    "iad1::zz5fx-1792381087406-58fcc57b1ee0",
    "sfo1::request::part-123",
  ]) {
    assert.equal(korelasiLaporan(request({ "x-vercel-id": value })), value);
  }
});

test("korelasiLaporan prefers a valid Vercel ID and falls back to a valid request ID", () => {
  assert.equal(
    korelasiLaporan(request({ "x-vercel-id": "vercel::region-123", "x-request-id": "request-456" })),
    "vercel::region-123",
  );
  assert.equal(korelasiLaporan(request({ "x-request-id": "req_456:abc" })), "req_456:abc");
  assert.equal(
    korelasiLaporan(request({ "x-vercel-id": "bad header", "x-request-id": "fallback-123" })),
    "fallback-123",
  );
});

test("korelasiLaporan replaces overlong or whitespace-containing invalid headers with UUIDs", () => {
  for (const value of ["x".repeat(161), "has whitespace"]) {
    const correlationId = korelasiLaporan(request({ "x-vercel-id": value }));
    assert.match(correlationId, UUID_V4);
    assert.notEqual(correlationId, value);
  }
});

test("metadataGalatLaporan extracts only postgres-js diagnostic identifiers", () => {
  const correlationId = "iad1::test-request-123";
  const metadata = metadataGalatLaporan({
    code: "23514",
    constraint_name: "th_final_reports_snapshot_check",
    table_name: "th_final_reports",
    message: "synthetic driver message",
    detail: "synthetic detail",
    query: "synthetic query",
    parameters: ["synthetic parameter"],
  }, correlationId);

  assert.deepEqual(metadata, {
    code: "23514",
    constraint: "th_final_reports_snapshot_check",
    table: "th_final_reports",
    correlationId,
  });
});

test("metadataGalatLaporan supports pg-style constraint and table fallback fields", () => {
  assert.deepEqual(metadataGalatLaporan({
    code: "23514",
    constraint: "reports_snapshot_check",
    table: "th_final_reports",
  }, "req-123"), {
    code: "23514",
    constraint: "reports_snapshot_check",
    table: "th_final_reports",
    correlationId: "req-123",
  });
});

test("metadataGalatLaporan rejects malformed codes and identifiers", () => {
  const metadata = metadataGalatLaporan({
    code: "23514;DROP",
    constraint_name: "bad-name",
    constraint: "also-bad",
    table_name: "table with spaces",
    table: "bad.table",
  }, "safe-id");
  assert.deepEqual(metadata, {
    code: undefined,
    constraint: undefined,
    table: undefined,
    correlationId: "safe-id",
  });
});

test("metadataGalatLaporan safely handles non-object errors", () => {
  for (const error of [null, undefined, "not an error", 42, true]) {
    assert.deepEqual(metadataGalatLaporan(error, "safe-id"), {
      code: undefined,
      constraint: undefined,
      table: undefined,
      correlationId: "safe-id",
    });
  }
});

test("serialized error metadata excludes synthetic sensitive error payloads", () => {
  const sensitivePayloads = [
    "SENSITIVE_MESSAGE_PAYLOAD",
    "SENSITIVE_DETAIL_PAYLOAD",
    "SENSITIVE_QUERY_PAYLOAD",
    "SENSITIVE_PARAMETERS_PAYLOAD",
  ];
  const metadata = metadataGalatLaporan({
    code: "23514",
    constraint_name: "th_final_reports_snapshot_check",
    table_name: "th_final_reports",
    message: sensitivePayloads[0],
    detail: sensitivePayloads[1],
    query: sensitivePayloads[2],
    parameters: [sensitivePayloads[3]],
  }, "req-safe-123");
  const serialized = JSON.stringify(metadata);

  for (const sensitive of sensitivePayloads) assert.equal(serialized.includes(sensitive), false);
  assert.deepEqual(JSON.parse(serialized), {
    code: "23514",
    constraint: "th_final_reports_snapshot_check",
    table: "th_final_reports",
    correlationId: "req-safe-123",
  });
});

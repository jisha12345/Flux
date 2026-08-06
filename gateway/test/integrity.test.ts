import assert from "node:assert/strict";
import test from "node:test";
import {
  integrityAdjustment,
  serializeIntegrityEvent,
  summarizeIntegrity,
} from "../src/integrity.js";
import { redactSensitiveText } from "../src/privacy.js";
import type { TurnRow } from "../src/types.js";

function systemTurn(seq: number, text: string): TurnRow {
  return {
    id: String(seq),
    interview_id: "iv",
    seq,
    role: "system",
    text,
    section: null,
    created_at: new Date(0).toISOString(),
  };
}

test("integrity summary is neutral when no signals exist", () => {
  const summary = summarizeIntegrity([]);
  assert.equal(summary.score, 100);
  assert.equal(summary.risk_level, "LOW");
  assert.equal(integrityAdjustment(summary.score), 0);
});

test("integrity signals produce a deterministic, capped score adjustment", () => {
  const turns = [
    systemTurn(1, serializeIntegrityEvent({ event_type: "tab_hidden", occurred_at: new Date(0).toISOString(), duration_seconds: 42 })),
    systemTurn(2, serializeIntegrityEvent({ event_type: "window_blur", occurred_at: new Date(1).toISOString(), duration_seconds: 10 })),
    systemTurn(3, serializeIntegrityEvent({ event_type: "long_break", occurred_at: new Date(2).toISOString(), duration_seconds: 75 })),
  ];
  const summary = summarizeIntegrity(turns);
  assert.equal(summary.score, 74);
  assert.equal(summary.total_away_seconds, 52);
  assert.equal(summary.longest_away_seconds, 42);
  assert.equal(summary.risk_level, "MEDIUM");
  assert.equal(integrityAdjustment(summary.score), -6);
});

test("obvious sensitive identifiers are removed without erasing ordinary metrics", () => {
  const redacted = redactSensitiveText(
    "Email me at me@example.com, phone 9876543210, PAN ABCDE1234F; I grew revenue 42% in 2024.",
  );
  assert.equal(redacted.includes("me@example.com"), false);
  assert.equal(redacted.includes("9876543210"), false);
  assert.equal(redacted.includes("ABCDE1234F"), false);
  assert.match(redacted, /42% in 2024/);
});

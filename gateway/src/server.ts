/**
 * Flux voice gateway — local-first Node service.
 *
 *   WS   /ws?token=<token>            the live interview socket (see session.ts)
 *   GET  /health                      liveness + config sanity
 *   POST /upload/:token/chunk         raw video/webm chunk (appended to local tmp)
 *   POST /upload/:token/photo         raw image/jpeg identity snapshot
 *   POST /upload/:token/finalize      pushes the assembled recording to storage
 *   POST /prepare/:token              pre-generate the blueprint (fire and forget)
 *   POST /evaluate/:token             re-run evaluation for a completed interview
 *
 * Run: npm run dev (tsx watch) — next to `next dev`. Deployable to any Node
 * host later; nothing here assumes localhost.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { env } from "./env.js";
import { evaluateInterview } from "./evaluate.js";
import { ensureBlueprint } from "./interview-engine.js";
import { InterviewSession } from "./session.js";
import { loadInterviewByToken, updateInterview, uploadPhoto, uploadRecording } from "./supabase.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const RECORDINGS_DIR = path.join(here, "..", "tmp-recordings");
fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_BYTES = 800 * 1024 * 1024;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGINS === "*" ? "*" : env.ALLOWED_ORIGINS.split(",")[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

function recordingPath(interviewId: string): string {
  return path.join(RECORDINGS_DIR, `${interviewId}.webm`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true, service: "flux-voice-gateway" });
    return;
  }

  // /upload/:token/(chunk|photo|finalize)
  if (req.method === "POST" && parts[0] === "upload" && parts.length === 3) {
    const token = parts[1];
    const action = parts[2];
    const interview = await loadInterviewByToken(token);
    if (!interview) {
      json(res, 404, { error: "unknown_interview" });
      return;
    }

    if (action === "chunk") {
      const body = await readBody(req, MAX_RECORDING_BYTES);
      if (!body || body.length === 0) {
        json(res, 400, { error: "empty_or_oversized_chunk" });
        return;
      }
      const file = recordingPath(interview.id);
      try {
        const existing = fs.existsSync(file) ? (await fsp.stat(file)).size : 0;
        if (existing + body.length > MAX_RECORDING_BYTES) {
          json(res, 413, { error: "recording_too_large" });
          return;
        }
        await fsp.appendFile(file, body);
        json(res, 200, { ok: true, bytes: existing + body.length });
      } catch (err) {
        console.error("[upload] chunk append failed:", err);
        json(res, 500, { error: "append_failed" });
      }
      return;
    }

    if (action === "photo") {
      const body = await readBody(req, MAX_PHOTO_BYTES);
      if (!body || body.length === 0) {
        json(res, 400, { error: "empty_or_oversized_photo" });
        return;
      }
      const stored = await uploadPhoto(interview.id, body);
      if (stored) await updateInterview(interview.id, { identity_photo_path: stored });
      json(res, stored ? 200 : 500, stored ? { ok: true, path: stored } : { error: "upload_failed" });
      return;
    }

    if (action === "finalize") {
      const file = recordingPath(interview.id);
      if (!fs.existsSync(file)) {
        json(res, 404, { error: "no_recording" });
        return;
      }
      try {
        const webm = await fsp.readFile(file);
        const stored = await uploadRecording(interview.id, webm);
        if (stored) {
          await updateInterview(interview.id, { video_path: stored });
          await fsp.unlink(file).catch(() => {});
          json(res, 200, { ok: true, path: stored, bytes: webm.length });
        } else {
          json(res, 500, { error: "storage_upload_failed" });
        }
      } catch (err) {
        console.error("[upload] finalize failed:", err);
        json(res, 500, { error: "finalize_failed" });
      }
      return;
    }
  }

  // POST /prepare/:token — generate the blueprint ahead of the candidate.
  // Fired when the recruiter creates the link, so the plan is already on disk
  // by the time anyone opens it instead of being the first thing they wait for.
  if (req.method === "POST" && parts[0] === "prepare" && parts.length === 2) {
    const interview = await loadInterviewByToken(parts[1]);
    if (!interview) {
      json(res, 404, { error: "unknown_interview" });
      return;
    }
    if (interview.blueprint) {
      json(res, 200, { ok: true, blueprint: "cached" });
      return;
    }
    // ensureBlueprint dedupes against a candidate who connects mid-generation.
    void ensureBlueprint(interview).catch((err) =>
      console.error("[prepare] blueprint generation failed:", err),
    );
    json(res, 202, { ok: true, blueprint: "generating" });
    return;
  }

  // POST /evaluate/:token — manual (re)trigger for completed interviews
  if (req.method === "POST" && parts[0] === "evaluate" && parts.length === 2) {
    const interview = await loadInterviewByToken(parts[1]);
    if (!interview) {
      json(res, 404, { error: "unknown_interview" });
      return;
    }
    if (interview.status !== "completed" && interview.status !== "in_progress") {
      json(res, 409, { error: `not_evaluable_in_status_${interview.status}` });
      return;
    }
    void evaluateInterview(interview).catch((err) => console.error("[evaluate] crashed:", err));
    json(res, 202, { ok: true, message: "evaluation started" });
    return;
  }

  json(res, 404, { error: "not_found" });
});

// ── WebSocket upgrade ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    void acceptInterviewSocket(ws, url.searchParams.get("token") ?? "");
  });
});

async function acceptInterviewSocket(ws: WebSocket, token: string): Promise<void> {
  const fail = (message: string) => {
    try {
      ws.send(JSON.stringify({ type: "error", message }));
    } catch {
      /* ignore */
    }
    ws.close(1011, "interview_unavailable");
  };

  if (!token) {
    fail("Missing interview token.");
    return;
  }
  const interview = await loadInterviewByToken(token);
  if (!interview) {
    fail("This interview link is invalid.");
    return;
  }
  if (interview.status === "completed" || interview.status === "evaluated") {
    fail("This interview has already been completed.");
    return;
  }
  if (interview.status === "expired" || interview.status === "error") {
    fail("This interview link is no longer active.");
    return;
  }

  const session = new InterviewSession(ws, interview);

  // nginx proxies this socket and its default `proxy_read_timeout` is 60s,
  // measured on traffic *from* the gateway. The browser now connects during the
  // device check and a candidate can easily think for a minute between turns —
  // both are silent stretches long enough to get the connection reaped. A ping
  // costs nothing and the browser pongs automatically.
  const heartbeat = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.ping();
    } catch {
      /* socket is going away anyway */
    }
  }, 25_000);
  const stopHeartbeat = () => clearInterval(heartbeat);

  ws.on("message", (data) => {
    const text =
      typeof data === "string"
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data).toString("utf8")
          : Buffer.from(data as Buffer).toString("utf8");
    session.handleMessage(text);
  });
  ws.on("close", () => {
    stopHeartbeat();
    session.teardown();
  });
  ws.on("error", () => {
    stopHeartbeat();
    session.teardown();
  });

  try {
    await session.init();
  } catch (err) {
    console.error("[session] init failed:", err);
    fail("Could not start the interview. Please refresh and try again.");
  }
}

server.listen(env.PORT, () => {
  console.log(`[gateway] flux-voice-gateway listening on http://localhost:${env.PORT}`);
  console.log(`[gateway] ws endpoint: ws://localhost:${env.PORT}/ws?token=<token>`);
});

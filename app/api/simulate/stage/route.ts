import { NextRequest } from "next/server";
import * as dns from "node:dns";
import * as net from "node:net";
import * as tls from "node:tls";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {
  createSession,
  getSession,
  destroySession,
  touchSession,
  type CertInfo,
} from "@/lib/sim-sessions";

export const runtime = "nodejs";

// ── Helpers ────────────────────────────────────────────────────

function resolveDns(hostname: string): Promise<string> {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return Promise.resolve("127.0.0.1");
  }
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { family: 4 }, (err, address) => {
      if (err) reject(new Error(`DNS lookup failed: ${err.message}`));
      else resolve(address);
    });
  });
}

function tcpConnect(ip: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port, timeout: 10000 });
    socket.once("connect", () => resolve(socket));
    socket.once("timeout", () => { socket.destroy(); reject(new Error("TCP connection timed out")); });
    socket.once("error", (err) => reject(new Error(`TCP error: ${err.message}`)));
  });
}

function tlsHandshake(
  socket: net.Socket,
  hostname: string
): Promise<{ socket: tls.TLSSocket; cert: CertInfo; cipher: string; version: string }> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername: hostname, rejectUnauthorized: false });
    tlsSocket.once("secureConnect", () => {
      const raw = tlsSocket.getPeerCertificate();
      const cipher  = tlsSocket.getCipher();
      const version = tlsSocket.getProtocol() ?? "unknown";
      const subjectCN = Array.isArray(raw.subject?.CN) ? raw.subject.CN[0] : raw.subject?.CN;
      const subjectO  = Array.isArray(raw.subject?.O)  ? raw.subject.O[0]  : raw.subject?.O;
      const issuerO   = Array.isArray(raw.issuer?.O)   ? raw.issuer.O[0]   : raw.issuer?.O;
      const issuerCN  = Array.isArray(raw.issuer?.CN)  ? raw.issuer.CN[0]  : raw.issuer?.CN;
      const cert: CertInfo = {
        subject:     subjectCN ?? subjectO ?? hostname,
        issuer:      issuerO ?? issuerCN ?? "unknown",
        validFrom:   raw.valid_from ?? "unknown",
        validTo:     raw.valid_to   ?? "unknown",
        fingerprint: raw.fingerprint ?? "unknown",
      };
      resolve({ socket: tlsSocket, cert, cipher: cipher.name ?? "unknown", version });
    });
    tlsSocket.once("error", (err) => reject(new Error(`TLS error: ${err.message}`)));
  });
}

// ── Request body shape ─────────────────────────────────────────

interface StageRequest {
  stage: "dns" | "tcp" | "tls" | "request" | "processing" | "response";
  sessionId?: string;
  // For dns stage (first stage)
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: StageRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const { stage } = body;

  // ── DNS — first stage, creates session ──────────────────────
  if (stage === "dns") {
    const { url } = body;
    if (!url) return json({ error: "url is required for dns stage" }, 400);

    let parsed: URL;
    try { parsed = new URL(url); }
    catch { return json({ error: `Invalid URL: ${url}` }, 400); }

    const isHttps  = parsed.protocol === "https:";
    const hostname = parsed.hostname;
    const port     = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;

    const sessionId = randomUUID();
    const session   = createSession(sessionId);
    session.hostname = hostname;
    session.port     = port;
    session.isHttps  = isHttps;

    const t0 = performance.now();
    let ip: string;
    try { ip = await resolveDns(hostname); }
    catch (err) {
      destroySession(sessionId);
      return json({ error: (err as Error).message, stage: "dns" }, 200);
    }
    const duration = Math.round(performance.now() - t0);
    session.ip = ip;
    touchSession(sessionId);

    return json({
      sessionId,
      stage: "dns",
      status: "done",
      duration,
      data: { ip, hostname },
    });
  }

  // All subsequent stages require a valid session
  const { sessionId } = body;
  if (!sessionId) return json({ error: "sessionId is required" }, 400);

  const session = getSession(sessionId);
  if (!session) return json({ error: "Session not found or expired. Please start over." }, 404);

  touchSession(sessionId);

  // ── TCP ───────────────────────────────────────────────────────
  if (stage === "tcp") {
    if (!session.ip || session.port === undefined) {
      return json({ error: "Session missing IP/port — run dns stage first" }, 400);
    }
    const t0 = performance.now();
    let rawSocket: net.Socket;
    try { rawSocket = await tcpConnect(session.ip, session.port); }
    catch (err) {
      destroySession(sessionId);
      return json({ error: (err as Error).message, stage: "tcp" }, 200);
    }
    const duration = Math.round(performance.now() - t0);
    session.rawSocket = rawSocket;
    session.socket    = rawSocket; // default; may be upgraded to TLS

    // Keep socket alive for the next stage — don't destroy on idle
    rawSocket.setKeepAlive(true, 5000);

    return json({ sessionId, stage: "tcp", status: "done", duration });
  }

  // ── TLS ───────────────────────────────────────────────────────
  if (stage === "tls") {
    if (!session.rawSocket || !session.hostname) {
      return json({ error: "Session missing socket — run tcp stage first" }, 400);
    }
    if (!session.isHttps) {
      // Not HTTPS — TLS is skipped
      return json({ sessionId, stage: "tls", status: "skipped", duration: 0 });
    }
    const t0 = performance.now();
    let tlsData: { socket: tls.TLSSocket; cert: CertInfo; cipher: string; version: string };
    try { tlsData = await tlsHandshake(session.rawSocket, session.hostname); }
    catch (err) {
      destroySession(sessionId);
      return json({ error: (err as Error).message, stage: "tls" }, 200);
    }
    const duration = Math.round(performance.now() - t0);
    session.socket    = tlsData.socket;
    session.tlsVersion = tlsData.version;
    session.tlsCipher  = tlsData.cipher;
    session.tlsCert    = tlsData.cert;

    return json({
      sessionId,
      stage: "tls",
      status: "done",
      duration,
      data: { version: tlsData.version, cipher: tlsData.cipher, cert: tlsData.cert },
    });
  }

  // ── Request ───────────────────────────────────────────────────
  if (stage === "request") {
    if (!session.socket || !session.hostname || session.port === undefined) {
      return json({ error: "Session missing socket — run tls/tcp stage first" }, 400);
    }

    const { method = "GET", headers = {}, body: reqBody = "" } = body;
    // Reconstruct path from the original url stored via dns stage
    // We need the full URL to extract the path — re-passed by client
    const { url } = body;
    if (!url) return json({ error: "url is required for request stage" }, 400);

    let parsed: URL;
    try { parsed = new URL(url); }
    catch { return json({ error: `Invalid URL: ${url}` }, 400); }

    const path = (parsed.pathname || "/") + parsed.search;
    const isHttps = session.isHttps ?? false;
    const defaultPort = isHttps ? 443 : 80;
    const hostHeader = session.port !== defaultPort
      ? `${session.hostname}:${session.port}`
      : session.hostname;

    const lines = [
      `${method.toUpperCase()} ${path || "/"} HTTP/1.1`,
      `Host: ${hostHeader}`,
      `Connection: close`,
      `User-Agent: ObsidianSim/1.0`,
      `Accept: */*`,
    ];
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      if (lk === "host") continue;
      if (lk === "content-type" && reqBody) continue;
      lines.push(`${k}: ${v}`);
    }
    if (reqBody) {
      lines.push(`Content-Type: application/json`);
      lines.push(`Content-Length: ${Buffer.byteLength(reqBody, "utf8")}`);
    }
    const requestRaw = lines.join("\r\n") + "\r\n\r\n" + (reqBody ?? "");

    // Attach response listeners BEFORE writing — we must not miss any data
    session.responseChunks  = [];
    session.firstByteAt     = undefined;
    session.responseFinished = false;

    session.socket.on("data", (chunk: Buffer) => {
      if (session.firstByteAt === undefined) {
        session.firstByteAt = performance.now();
      }
      session.responseChunks!.push(chunk);
    });

    session.socket.on("end", () => {
      session.responseFinished = true;
    });

    session.socket.on("error", () => {
      session.responseFinished = true;
    });

    const t0 = performance.now();
    session.socket.write(requestRaw, "utf8");
    const duration = Math.round(performance.now() - t0);
    session.requestSentAt = t0;
    session.requestRaw = requestRaw;

    return json({
      sessionId,
      stage: "request",
      status: "done",
      duration,
      data: { raw: requestRaw },
    });
  }

  // ── Processing (TTFB) ─────────────────────────────────────────
  if (stage === "processing") {
    if (session.requestSentAt === undefined) {
      return json({ error: "Session missing requestSentAt — run request stage first" }, 400);
    }

    // Poll until first byte arrives or socket is closed (with 15s hard timeout)
    const deadline = Date.now() + 15_000;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (session.firstByteAt !== undefined || session.responseFinished || Date.now() > deadline) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    if (session.firstByteAt === undefined) {
      destroySession(sessionId);
      return json({ error: "No response received from server (TTFB timeout)", stage: "processing" }, 200);
    }

    const duration = Math.round(session.firstByteAt - session.requestSentAt);

    return json({ sessionId, stage: "processing", status: "done", duration });
  }

  // ── Response (download) ───────────────────────────────────────
  if (stage === "response") {
    if (!session.responseChunks) {
      return json({ error: "No response buffer — run request stage first" }, 400);
    }

    // Poll until the full response is downloaded (with 30s hard timeout)
    const deadline = Date.now() + 30_000;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (session.responseFinished || Date.now() > deadline) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    const t0 = performance.now();
    const raw = Buffer.concat(session.responseChunks).toString("utf8");
    const downloadBytes = Buffer.byteLength(raw, "utf8");

    const splitIdx = raw.indexOf("\r\n\r\n");
    const headerSection = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
    const bodySection   = splitIdx >= 0 ? raw.slice(splitIdx + 4) : "";

    const headerLines = headerSection.split("\r\n");
    const statusLine  = headerLines[0] ?? "HTTP/1.1 0 Unknown";
    const parts       = statusLine.split(" ");
    const status      = parseInt(parts[1] ?? "0", 10);
    const statusText  = parts.slice(2).join(" ");

    const responseHeaders: Record<string, string> = {};
    for (const line of headerLines.slice(1)) {
      const colon = line.indexOf(":");
      if (colon > -1) {
        responseHeaders[line.slice(0, colon).toLowerCase().trim()] = line.slice(colon + 1).trim();
      }
    }

    // Decode chunked transfer encoding
    let decodedBody = bodySection;
    if ((responseHeaders["transfer-encoding"] ?? "").toLowerCase().includes("chunked")) {
      decodedBody = "";
      let remaining = bodySection;
      while (remaining.length > 0) {
        const crlfIdx = remaining.indexOf("\r\n");
        if (crlfIdx === -1) break;
        const chunkSize = parseInt(remaining.slice(0, crlfIdx), 16);
        if (isNaN(chunkSize) || chunkSize === 0) break;
        decodedBody += remaining.slice(crlfIdx + 2, crlfIdx + 2 + chunkSize);
        remaining = remaining.slice(crlfIdx + 2 + chunkSize + 2);
      }
    }

    const responseBody  = decodedBody.slice(0, 10240);
    const duration = Math.round(performance.now() - t0);

    // Session is complete — clean up
    destroySession(sessionId);

    return json({
      sessionId,
      stage: "response",
      status: "done",
      duration,
      data: { status, statusText, headers: responseHeaders, body: responseBody, bytes: downloadBytes },
    });
  }

  return json({ error: `Unknown stage: ${stage}` }, 400);
}

// ── Helpers ────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

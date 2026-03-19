import { NextRequest } from "next/server";
import * as dns from "node:dns";
import * as net from "node:net";
import * as tls from "node:tls";
import { performance } from "node:perf_hooks";

export const runtime = "nodejs";

// ── Types ──────────────────────────────────────────────────────

interface SimRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

interface CertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

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
      const cipher = tlsSocket.getCipher();
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

// Callbacks fire at the exact moment each sub-stage completes,
// letting the SSE stream emit events in true real-time.
function sendHttpRequest(
  socket: net.Socket | tls.TLSSocket,
  opts: {
    method: string;
    hostname: string;
    port: number;
    path: string;
    headers: Record<string, string>;
    body: string;
    isHttps: boolean;
  },
  callbacks: {
    onRequestSent: (raw: string, duration: number) => void;
    onTtfb: (duration: number) => void;
  }
): Promise<{
  downloadDuration: number;
  downloadBytes: number;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}> {
  return new Promise((resolve, reject) => {
    const { method, hostname, port, path, headers, body, isHttps } = opts;
    const defaultPort = isHttps ? 443 : 80;
    const hostHeader  = port !== defaultPort ? `${hostname}:${port}` : hostname;

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
      if (lk === "content-type" && body) continue; // avoid duplicate; added below
      lines.push(`${k}: ${v}`);
    }
    if (body) {
      lines.push(`Content-Type: application/json`);
      lines.push(`Content-Length: ${Buffer.byteLength(body, "utf8")}`);
    }
    const requestRaw = lines.join("\r\n") + "\r\n\r\n" + (body ?? "");

    // ── Request sent ──────────────────────────────────────────
    const t0 = performance.now();
    socket.write(requestRaw, "utf8");
    const requestDuration = Math.round(performance.now() - t0);
    callbacks.onRequestSent(requestRaw, requestDuration); // fires immediately

    // ── TTFB + download ───────────────────────────────────────
    let firstByte    = false;
    let downloadStart = 0;
    const ttfbStart  = performance.now();
    const chunks: Buffer[] = [];

    socket.on("data", (chunk: Buffer) => {
      if (!firstByte) {
        firstByte = true;
        const ttfbDuration = Math.round(performance.now() - ttfbStart);
        downloadStart = performance.now();
        callbacks.onTtfb(ttfbDuration); // fires on first byte
      }
      chunks.push(chunk);
    });

    socket.on("end", () => {
      const downloadDuration = Math.round(performance.now() - (downloadStart || performance.now()));
      const raw = Buffer.concat(chunks).toString("utf8");
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
      // Decode chunked transfer encoding if present
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
          remaining = remaining.slice(crlfIdx + 2 + chunkSize + 2); // skip chunk + trailing \r\n
        }
      }
      const responseBody  = decodedBody.slice(0, 10240);
      const downloadBytes = Buffer.byteLength(raw, "utf8");
      resolve({ downloadDuration, downloadBytes, status, statusText, responseHeaders, responseBody });
    });

    socket.on("error", (err: Error) => reject(new Error(`Request error: ${err.message}`)));
  });
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SimRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { method = "GET", url, headers = {}, body: reqBody = "" } = body;

  if (!url) {
    return new Response(JSON.stringify({ error: "URL is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response(JSON.stringify({ error: `Invalid URL: ${url}` }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const isHttps  = parsed.protocol === "https:";
  const hostname = parsed.hostname;
  const port     = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;
  const path     = (parsed.pathname || "/") + parsed.search;

  const encoder = new TextEncoder();
  function emit(controller: ReadableStreamDefaultController, event: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  const stream = new ReadableStream({
    async start(controller) {
      let total = 0;
      try {
        // ── 1. DNS ──────────────────────────────────────────────
        const dnsStart = performance.now();
        let ip: string;
        try { ip = await resolveDns(hostname); }
        catch (err) {
          emit(controller, { type: "error", stage: "dns", message: (err as Error).message });
          controller.close(); return;
        }
        const dnsDuration = Math.round(performance.now() - dnsStart);
        total += dnsDuration;
        emit(controller, { type: "stage", id: "dns", status: "done", duration: dnsDuration, data: { ip, hostname } });

        // ── 2. TCP ──────────────────────────────────────────────
        const tcpStart = performance.now();
        let socket: net.Socket;
        try { socket = await tcpConnect(ip, port); }
        catch (err) {
          emit(controller, { type: "error", stage: "tcp", message: (err as Error).message });
          controller.close(); return;
        }
        const tcpDuration = Math.round(performance.now() - tcpStart);
        total += tcpDuration;
        emit(controller, { type: "stage", id: "tcp", status: "done", duration: tcpDuration });

        // ── 3. TLS (HTTPS only) ─────────────────────────────────
        let activeSocket: net.Socket | tls.TLSSocket = socket;
        if (isHttps) {
          const tlsStart = performance.now();
          let tlsData: { socket: tls.TLSSocket; cert: CertInfo; cipher: string; version: string };
          try { tlsData = await tlsHandshake(socket, hostname); }
          catch (err) {
            emit(controller, { type: "error", stage: "tls", message: (err as Error).message });
            controller.close(); return;
          }
          const tlsDuration = Math.round(performance.now() - tlsStart);
          total += tlsDuration;
          emit(controller, {
            type: "stage", id: "tls", status: "done", duration: tlsDuration,
            data: { version: tlsData.version, cipher: tlsData.cipher, cert: tlsData.cert },
          });
          activeSocket = tlsData.socket;
        } else {
          emit(controller, { type: "stage", id: "tls", status: "skipped", duration: 0 });
        }

        // ── 4. HTTP request → TTFB → download ──────────────────
        let downloadResult: Awaited<ReturnType<typeof sendHttpRequest>>;
        try {
          downloadResult = await sendHttpRequest(
            activeSocket,
            { method, hostname, port, path, headers, body: reqBody, isHttps },
            {
              onRequestSent: (raw, duration) => {
                total += duration;
                emit(controller, { type: "stage", id: "request", status: "done", duration, data: { raw } });
              },
              onTtfb: (duration) => {
                total += duration;
                emit(controller, { type: "stage", id: "processing", status: "done", duration });
              },
            }
          );
        } catch (err) {
          emit(controller, { type: "error", stage: "request", message: (err as Error).message });
          controller.close(); return;
        }

        const { downloadDuration, downloadBytes, status, statusText, responseHeaders, responseBody } = downloadResult;
        total += downloadDuration;
        emit(controller, {
          type: "stage", id: "response", status: "done", duration: downloadDuration,
          data: { status, statusText, headers: responseHeaders, body: responseBody, bytes: downloadBytes },
        });

        emit(controller, { type: "complete", total });
        controller.close();
      } catch (err) {
        emit(controller, { type: "error", stage: "unknown", message: (err as Error).message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "Connection":      "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/proxy buffering
    },
  });
}

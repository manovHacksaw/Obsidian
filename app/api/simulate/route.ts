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
  // When true the route makes TWO requests on the same socket, emitting
  // req: 1 then req: 2 stage events so the frontend can show that
  // DNS + TCP + TLS are skipped on the second request.
  keepAlive?: boolean;
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

// ── Keep-alive request sender ──────────────────────────────────
// Like sendHttpRequest but uses Connection: keep-alive and detects
// end-of-response via Content-Length or chunked terminal chunk rather
// than socket close — so the connection can be reused for a second request.

interface KeepAliveResult {
  downloadDuration: number;
  downloadBytes:    number;
  status:           number;
  statusText:       string;
  responseHeaders:  Record<string, string>;
  responseBody:     string;
  serverKeepAlive:  boolean; // did the server honour keep-alive?
}

function sendHttpRequestKeepAlive(
  socket: net.Socket | tls.TLSSocket,
  opts: {
    method: string; hostname: string; port: number; path: string;
    headers: Record<string, string>; body: string; isHttps: boolean;
  },
  callbacks: {
    onRequestSent: (raw: string, duration: number) => void;
    onTtfb:        (duration: number) => void;
  },
): Promise<KeepAliveResult> {
  return new Promise((resolve, reject) => {
    const { method, hostname, port, path, headers, body, isHttps } = opts;
    const defaultPort = isHttps ? 443 : 80;
    const hostHeader  = port !== defaultPort ? `${hostname}:${port}` : hostname;

    const lines = [
      `${method.toUpperCase()} ${path || "/"} HTTP/1.1`,
      `Host: ${hostHeader}`,
      `Connection: keep-alive`,   // ← keep connection open
      `User-Agent: ObsidianSim/1.0`,
      `Accept: */*`,
    ];
    for (const [k, v] of Object.entries(headers)) {
      const lk = k.toLowerCase();
      if (lk === "host" || lk === "connection") continue;
      if (lk === "content-type" && body) continue;
      lines.push(`${k}: ${v}`);
    }
    if (body) {
      lines.push(`Content-Type: application/json`);
      lines.push(`Content-Length: ${Buffer.byteLength(body, "utf8")}`);
    }
    const requestRaw = lines.join("\r\n") + "\r\n\r\n" + (body ?? "");

    const t0 = performance.now();
    socket.write(requestRaw, "utf8");
    const requestDuration = Math.round(performance.now() - t0);
    callbacks.onRequestSent(requestRaw, requestDuration);

    let buf          = Buffer.alloc(0);
    let ttfbFired    = false;
    let ttfbStart    = performance.now();
    let downloadStart = 0;

    function settle(chunk: Buffer) {
      const raw = chunk.toString("utf8");
      const sep = raw.indexOf("\r\n\r\n");
      const headerSection = sep >= 0 ? raw.slice(0, sep) : raw;
      const bodySection   = sep >= 0 ? raw.slice(sep + 4) : "";
      const headerLines   = headerSection.split("\r\n");
      const statusLine    = headerLines[0] ?? "HTTP/1.1 0 Unknown";
      const parts         = statusLine.split(" ");
      const status        = parseInt(parts[1] ?? "0", 10);
      const statusText    = parts.slice(2).join(" ");

      const responseHeaders: Record<string, string> = {};
      for (const line of headerLines.slice(1)) {
        const colon = line.indexOf(":");
        if (colon > -1) {
          responseHeaders[line.slice(0, colon).toLowerCase().trim()] =
            line.slice(colon + 1).trim();
        }
      }

      let body = bodySection;
      if ((responseHeaders["transfer-encoding"] ?? "").toLowerCase().includes("chunked")) {
        body = "";
        let rem = bodySection;
        while (rem.length > 0) {
          const nl = rem.indexOf("\r\n");
          if (nl === -1) break;
          const size = parseInt(rem.slice(0, nl), 16);
          if (isNaN(size) || size === 0) break;
          body += rem.slice(nl + 2, nl + 2 + size);
          rem   = rem.slice(nl + 2 + size + 2);
        }
      }

      const serverConn = (responseHeaders["connection"] ?? "").toLowerCase();
      // HTTP/1.1 defaults to keep-alive; server closes only if explicitly said so
      const serverKeepAlive = serverConn !== "close";

      resolve({
        downloadDuration: Math.round(performance.now() - downloadStart),
        downloadBytes:    chunk.length,
        status, statusText,
        responseHeaders,
        responseBody:     body.slice(0, 10240),
        serverKeepAlive,
      });
    }

    function trySettle() {
      const raw = buf.toString("utf8");
      const sep = raw.indexOf("\r\n\r\n");
      if (sep === -1) return; // headers not yet complete

      const headerSection = raw.slice(0, sep);
      const headerLines   = headerSection.split("\r\n");
      const headerMap: Record<string, string> = {};
      for (const line of headerLines.slice(1)) {
        const c = line.indexOf(":");
        if (c > -1) headerMap[line.slice(0, c).toLowerCase().trim()] = line.slice(c + 1).trim();
      }

      const te  = (headerMap["transfer-encoding"] ?? "").toLowerCase();
      const cl  = parseInt(headerMap["content-length"] ?? "", 10);
      const body = raw.slice(sep + 4);

      if (te.includes("chunked")) {
        // Wait for terminal chunk: 0\r\n\r\n
        if (body.includes("\r\n0\r\n\r\n") || body.endsWith("0\r\n\r\n")) {
          socket.removeListener("data", onData);
          socket.removeListener("error", onError);
          settle(buf);
        }
        return;
      }

      if (!isNaN(cl)) {
        const bodyBytes = buf.length - (sep + 4);
        if (bodyBytes >= cl) {
          socket.removeListener("data", onData);
          socket.removeListener("error", onError);
          settle(buf.slice(0, sep + 4 + cl));
        }
        return;
      }

      // No Content-Length and not chunked — fall through to socket close
    }

    function onData(chunk: Buffer) {
      if (!ttfbFired) {
        ttfbFired     = true;
        const ttfbMs  = Math.round(performance.now() - ttfbStart);
        downloadStart = performance.now();
        callbacks.onTtfb(ttfbMs);
      }
      buf = Buffer.concat([buf, chunk]);
      trySettle();
    }

    function onError(err: Error) {
      socket.removeListener("data",  onData);
      socket.removeListener("error", onError);
      reject(new Error(`Request error: ${err.message}`));
    }

    // Fallback: if server closes the connection, resolve with what we have.
    socket.once("end", () => {
      socket.removeListener("data",  onData);
      socket.removeListener("error", onError);
      if (buf.length > 0) {
        settle(buf);
      } else {
        reject(new Error("Connection closed before response"));
      }
    });

    socket.on("data",  onData);
    socket.on("error", onError);

    // Safety timeout
    setTimeout(() => {
      socket.removeListener("data",  onData);
      socket.removeListener("error", onError);
      if (buf.length > 0) settle(buf);
      else reject(new Error("Keep-alive request timed out"));
    }, 15000);
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

  const { method = "GET", url, headers = {}, body: reqBody = "", keepAlive = false } = body;

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
      let socket: net.Socket | null = null;
      let activeSocket: net.Socket | tls.TLSSocket | null = null;
      const closeSocket = (s: net.Socket | tls.TLSSocket | null) => {
        if (!s || s.destroyed) return;
        try { s.end(); } catch { /* no-op */ }
        s.destroy();
      };

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
        const dnsCached = dnsDuration < 3;
        emit(controller, { type: "stage", id: "dns", status: "done", duration: dnsDuration, data: { ip, hostname, cached: dnsCached } });

        // ── 2. TCP ──────────────────────────────────────────────
        const tcpStart = performance.now();
        try { socket = await tcpConnect(ip, port); }
        catch (err) {
          emit(controller, { type: "error", stage: "tcp", message: (err as Error).message });
          controller.close(); return;
        }
        const tcpDuration = Math.round(performance.now() - tcpStart);
        total += tcpDuration;
        emit(controller, { type: "stage", id: "tcp", status: "done", duration: tcpDuration });

        // ── 3. TLS (HTTPS only) ─────────────────────────────────
        activeSocket = socket;
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

        // ── 4a. Request 1 ───────────────────────────────────────
        // keepAlive mode uses the keep-alive parser for req 1 so the socket
        // stays open; normal mode uses the original close-based parser.
        const req = keepAlive ? sendHttpRequestKeepAlive : sendHttpRequest;

        let downloadResult1: KeepAliveResult;
        try {
          downloadResult1 = await req(
            activeSocket,
            { method, hostname, port, path, headers, body: reqBody, isHttps },
            {
              onRequestSent: (raw, duration) => {
                total += duration;
                emit(controller, {
                  type: "stage", id: "request", status: "done", duration,
                  data: { raw }, ...(keepAlive ? { req: 1 } : {}),
                });
              },
              onTtfb: (duration) => {
                total += duration;
                emit(controller, {
                  type: "stage", id: "processing", status: "done", duration,
                  ...(keepAlive ? { req: 1 } : {}),
                });
              },
            }
          ) as KeepAliveResult;
        } catch (err) {
          emit(controller, { type: "error", stage: "request", message: (err as Error).message });
          controller.close(); return;
        }

        const { downloadDuration: dl1, downloadBytes: db1, status: st1,
                statusText: stx1, responseHeaders: rh1, responseBody: rb1,
                serverKeepAlive } = downloadResult1;
        total += dl1;
        emit(controller, {
          type: "stage", id: "response", status: "done", duration: dl1,
          data: { status: st1, statusText: stx1, headers: rh1, body: rb1, bytes: db1 },
          ...(keepAlive ? { req: 1 } : {}),
        });

        // ── 4b. Keep-alive: Request 2 (reuses socket) ───────────
        if (keepAlive && serverKeepAlive && activeSocket && !activeSocket.destroyed) {
          // Signal the frontend that the connection is being reused
          emit(controller, {
            type:       "keep_alive_reuse",
            savedMs:    tcpDuration + (isHttps ? 0 : 0), // TLS ms is in stageData
            ip,
            port,
          });

          // DNS / TCP / TLS are all "reused" — emit them as 0ms skipped stages
          emit(controller, { type: "stage", id: "dns", status: "reused", duration: 0, req: 2,
            data: { ip, hostname, cached: true, reused: true } });
          emit(controller, { type: "stage", id: "tcp", status: "reused", duration: 0, req: 2 });
          emit(controller, { type: "stage", id: "tls", status: "reused", duration: 0, req: 2 });

          let total2 = 0;
          let downloadResult2: KeepAliveResult;
          try {
            downloadResult2 = await sendHttpRequestKeepAlive(
              activeSocket,
              { method, hostname, port, path, headers, body: reqBody, isHttps },
              {
                onRequestSent: (raw, duration) => {
                  total2 += duration;
                  emit(controller, {
                    type: "stage", id: "request", status: "done", duration,
                    data: { raw }, req: 2,
                  });
                },
                onTtfb: (duration) => {
                  total2 += duration;
                  emit(controller, { type: "stage", id: "processing", status: "done", duration, req: 2 });
                },
              }
            );
          } catch (err) {
            // Second request failed — not a fatal error for the session
            emit(controller, { type: "error", stage: "request-2", message: (err as Error).message });
            emit(controller, { type: "complete", total, keepAlive: false });
            controller.close(); return;
          }

          const { downloadDuration: dl2, downloadBytes: db2, status: st2,
                  statusText: stx2, responseHeaders: rh2, responseBody: rb2 } = downloadResult2;
          total2 += dl2;
          emit(controller, {
            type: "stage", id: "response", status: "done", duration: dl2,
            data: { status: st2, statusText: stx2, headers: rh2, body: rb2, bytes: db2 },
            req: 2,
          });
          emit(controller, { type: "complete", total, total2, keepAlive: true });
        } else {
          emit(controller, { type: "complete", total });
        }

        controller.close();
      } catch (err) {
        emit(controller, { type: "error", stage: "unknown", message: (err as Error).message });
        controller.close();
      } finally {
        closeSocket(activeSocket);
        if (socket && socket !== activeSocket) closeSocket(socket);
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

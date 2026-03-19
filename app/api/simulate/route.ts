import { NextRequest, NextResponse } from "next/server";
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

interface SimResult {
  dns: { ip: string; hostname: string; duration: number };
  tcp: { duration: number };
  tls?: { version: string; cipher: string; cert: CertInfo; duration: number };
  request: { raw: string; duration: number };
  ttfb: { duration: number };
  download: { bytes: number; duration: number };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  };
  total: number;
}

// ── Helpers ────────────────────────────────────────────────────

function resolveDns(hostname: string): Promise<string> {
  // localhost shortcuts — skip actual DNS
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
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("TCP connection timed out"));
    });
    socket.once("error", (err) => reject(new Error(`TCP error: ${err.message}`)));
  });
}

function tlsHandshake(
  socket: net.Socket,
  hostname: string
): Promise<{ socket: tls.TLSSocket; cert: CertInfo; cipher: string; version: string }> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      socket,
      servername: hostname,
      rejectUnauthorized: false, // show cert even if self-signed
    });

    tlsSocket.once("secureConnect", () => {
      const raw = tlsSocket.getPeerCertificate();
      const cipher = tlsSocket.getCipher();
      const version = tlsSocket.getProtocol() ?? "unknown";

      const subjectCN = Array.isArray(raw.subject?.CN) ? raw.subject.CN[0] : raw.subject?.CN;
      const subjectO = Array.isArray(raw.subject?.O) ? raw.subject.O[0] : raw.subject?.O;
      const issuerO = Array.isArray(raw.issuer?.O) ? raw.issuer.O[0] : raw.issuer?.O;
      const issuerCN = Array.isArray(raw.issuer?.CN) ? raw.issuer.CN[0] : raw.issuer?.CN;

      const cert: CertInfo = {
        subject: subjectCN ?? subjectO ?? hostname,
        issuer: issuerO ?? issuerCN ?? "unknown",
        validFrom: raw.valid_from ?? "unknown",
        validTo: raw.valid_to ?? "unknown",
        fingerprint: raw.fingerprint ?? "unknown",
      };

      resolve({ socket: tlsSocket, cert, cipher: cipher.name ?? "unknown", version });
    });

    tlsSocket.once("error", (err) =>
      reject(new Error(`TLS error: ${err.message}`))
    );
  });
}

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
  }
): Promise<{
  requestRaw: string;
  requestDuration: number;
  ttfbDuration: number; 
  downloadDuration: number;
  downloadBytes: number;
  status: number;
  statusText: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
}> {
  return new Promise((resolve, reject) => {
    const { method, hostname, port, path, headers, body, isHttps } = opts;

    // Build raw HTTP/1.1 request
    const defaultPort = isHttps ? 443 : 80;
    const hostHeader = port !== defaultPort ? `${hostname}:${port}` : hostname;

    const lines = [
      `${method.toUpperCase()} ${path || "/"} HTTP/1.1`,
      `Host: ${hostHeader}`,
      `Connection: close`,
      `User-Agent: ObsidianSim/1.0`,
      `Accept: */*`,
    ];

    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== "host") lines.push(`${k}: ${v}`);
    }

    if (body) {
      lines.push(`Content-Type: application/json`);
      lines.push(`Content-Length: ${Buffer.byteLength(body, "utf8")}`);
    }

    const requestRaw = lines.join("\r\n") + "\r\n\r\n" + (body ?? "");

    const t0 = performance.now();
    socket.write(requestRaw, "utf8");
    const requestDuration = Math.round(performance.now() - t0);

    let firstByte = false;
    let ttfbDuration = 0;
    let downloadStart = 0;
    const ttfbStart = performance.now();
    const chunks: Buffer[] = [];

    socket.on("data", (chunk: Buffer) => {
      if (!firstByte) {
        firstByte = true;
        ttfbDuration = Math.round(performance.now() - ttfbStart);
        downloadStart = performance.now();
      }
      chunks.push(chunk);
    });

    socket.on("end", () => {
      const downloadDuration = Math.round(performance.now() - (downloadStart || performance.now()));
      const raw = Buffer.concat(chunks).toString("utf8");
      const splitIdx = raw.indexOf("\r\n\r\n");
      const headerSection = splitIdx >= 0 ? raw.slice(0, splitIdx) : raw;
      const bodySection = splitIdx >= 0 ? raw.slice(splitIdx + 4) : "";

      const headerLines = headerSection.split("\r\n");
      const statusLine = headerLines[0] ?? "HTTP/1.1 0 Unknown";
      const parts = statusLine.split(" ");
      const status = parseInt(parts[1] ?? "0", 10);
      const statusText = parts.slice(2).join(" ");

      const responseHeaders: Record<string, string> = {};
      for (const line of headerLines.slice(1)) {
        const colon = line.indexOf(":");
        if (colon > -1) {
          const key = line.slice(0, colon).toLowerCase().trim();
          const val = line.slice(colon + 1).trim();
          responseHeaders[key] = val;
        }
      }

      // Cap body at 10KB for display
      const responseBody = bodySection.slice(0, 10240);
      const downloadBytes = Buffer.byteLength(raw, "utf8");

      resolve({
        requestRaw,
        requestDuration,
        ttfbDuration,
        downloadDuration,
        downloadBytes,
        status,
        statusText,
        responseHeaders,
        responseBody,
      });
    });

    socket.on("error", (err: Error) =>
      reject(new Error(`Request error: ${err.message}`))
    );
  });
}

// ── Handler ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: SimRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { method = "GET", url, headers = {}, body: reqBody = "" } = body;

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: `Invalid URL: ${url}` }, { status: 400 });
  }

  const isHttps = parsed.protocol === "https:";
  const hostname = parsed.hostname;
  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : isHttps ? 443 : 80;
  const path = (parsed.pathname || "/") + parsed.search;

  try {
    const result: Partial<SimResult> = {};

    // ── 1. DNS ──
    const dnsStart = performance.now();
    const ip = await resolveDns(hostname);
    result.dns = {
      ip,
      hostname,
      duration: Math.round(performance.now() - dnsStart),
    };

    // ── 2. TCP ──
    const tcpStart = performance.now();
    const socket = await tcpConnect(ip, port);
    result.tcp = { duration: Math.round(performance.now() - tcpStart) };

    // ── 3. TLS (HTTPS only) ──
    let activeSocket: net.Socket | tls.TLSSocket = socket;
    if (isHttps) {
      const tlsStart = performance.now();
      const { socket: tlsSock, cert, cipher, version } = await tlsHandshake(socket, hostname);
      result.tls = {
        version,
        cipher,
        cert,
        duration: Math.round(performance.now() - tlsStart),
      };
      activeSocket = tlsSock;
    }

    // ── 4. HTTP Request + TTFB + Download ──
    const {
      requestRaw,
      requestDuration,
      ttfbDuration,
      downloadDuration,
      downloadBytes,
      status,
      statusText,
      responseHeaders,
      responseBody,
    } = await sendHttpRequest(activeSocket, {
      method,
      hostname,
      port,
      path,
      headers,
      body: reqBody,
      isHttps,
    });

    result.request = { raw: requestRaw, duration: requestDuration };
    result.ttfb = { duration: ttfbDuration };
    result.download = { bytes: downloadBytes, duration: downloadDuration };
    result.response = { status, statusText, headers: responseHeaders, body: responseBody };
    result.total =
      result.dns.duration +
      result.tcp.duration +
      (result.tls?.duration ?? 0) +
      requestDuration +
      ttfbDuration +
      downloadDuration;

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

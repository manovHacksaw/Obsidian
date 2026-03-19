import type { HttpMethod, StageId, Route } from "./types";

// ── Constants ──────────────────────────────────────────────────

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export const METHOD_INFO: Record<HttpMethod, { short: string; hint: string; safe: boolean; idempotent: boolean }> = {
  GET:    { short: "Read",    hint: "Fetches a resource. No body, no side effects — safe to call multiple times.", safe: true,  idempotent: true  },
  POST:   { short: "Create",  hint: "Submits data to create a resource. Has a body. Calling twice may create duplicates.", safe: false, idempotent: false },
  PUT:    { short: "Replace", hint: "Replaces a resource entirely with the body you send. Creates it if it doesn't exist.", safe: false, idempotent: true  },
  PATCH:  { short: "Update",  hint: "Partially updates a resource — only the fields you send are changed.", safe: false, idempotent: false },
  DELETE: { short: "Delete",  hint: "Removes a resource. Calling it again on a missing resource usually returns 404.", safe: false, idempotent: true  },
};

export const METHOD_COLORS: Record<HttpMethod, { text: string; bg: string; border: string }> = {
  GET:    { text: "text-blue-400",   bg: "bg-blue-500/15",   border: "border-blue-500/30" },
  POST:   { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  PUT:    { text: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30" },
  DELETE: { text: "text-red-400",    bg: "bg-red-500/15",    border: "border-red-500/30" },
  PATCH:  { text: "text-purple-400", bg: "bg-purple-500/15", border: "border-purple-500/30" },
};

export function sanitizeError(raw: string, stage: string): string {
  const r = raw.toLowerCase();
  if (r.includes("dns") || r.includes("lookup") || r.includes("enotfound") || r.includes("getaddrinfo"))
    return "Could not resolve the hostname. Check the URL and your network connection.";
  if (r.includes("econnrefused") || r.includes("tcp") || r.includes("connection refused"))
    return "Connection refused — the server is not accepting connections on this port.";
  if (r.includes("etimedout") || r.includes("timed out") || r.includes("timeout"))
    return "Connection timed out — the server took too long to respond.";
  if (r.includes("econnreset") || r.includes("socket hang up") || r.includes("aborted") || r.includes("stream"))
    return "The connection was closed unexpectedly. The server may have reset it mid-response.";
  if (r.includes("tls") || r.includes("ssl") || r.includes("certificate") || r.includes("handshake"))
    return "TLS handshake failed — the server's certificate could not be verified.";
  if (r.includes("invalid url") || r.includes("invalid")) return "The URL is not valid.";
  if (stage === "dns")        return "DNS resolution failed — hostname could not be found.";
  if (stage === "tcp")        return "TCP connection failed — could not reach the server.";
  if (stage === "tls")        return "TLS negotiation failed — secure connection could not be established.";
  if (stage === "request")    return "Request could not be sent — the connection was lost.";
  if (stage === "processing") return "No response received — the server did not reply in time.";
  return "Something went wrong while connecting to the server.";
}

export const DEFAULT_ROUTES: Route[] = [
  {
    id: "r1", method: "GET", path: "/users", status: 200, delay: 80,
    description: "List all users",
    responseBody: '{\n  "users": [\n    { "id": 1, "name": "Alice", "role": "admin" },\n    { "id": 2, "name": "Bob", "role": "user" }\n  ],\n  "total": 2\n}',
  },
  {
    id: "r2", method: "GET", path: "/users/:id", status: 200, delay: 60,
    description: "Get user by ID",
    responseBody: '{\n  "id": ":id",\n  "name": "User :id",\n  "role": "user"\n}',
  },
  {
    id: "r3", method: "POST", path: "/users", status: 201, delay: 120,
    description: "Create a new user",
    responseBody: '{\n  "id": 3,\n  "message": "User created successfully"\n}',
  },
  {
    id: "r4", method: "DELETE", path: "/users/:id", status: 200, delay: 90,
    description: "Delete user by ID",
    responseBody: '{\n  "message": "User :id deleted",\n  "success": true\n}',
  },
];

export const REAL_PRESETS = [
  { label: "JSONPlaceholder",  url: "https://jsonplaceholder.typicode.com/todos/1",    method: "GET" as HttpMethod },
  { label: "GitHub Zen",       url: "https://api.github.com/zen",                      method: "GET" as HttpMethod },
  { label: "httpbin GET",      url: "https://httpbin.org/get",                         method: "GET" as HttpMethod },
  { label: "httpbin POST",     url: "https://httpbin.org/post",                        method: "POST" as HttpMethod },
  { label: "Localhost :3000",  url: "http://localhost:3000",                           method: "GET" as HttpMethod },
  { label: "Localhost :3001",  url: "http://localhost:3001",                           method: "GET" as HttpMethod },
];

export const STAGE_DEFS: { id: StageId; label: string; desc: string; realDesc: string; direction: "→" | "←" | "⚙" }[] = [
  { id: "dns",        label: "DNS Resolution",   desc: "Resolving hostname to IP",           realDesc: "OS resolver → actual A record lookup",    direction: "→" },
  { id: "tcp",        label: "TCP Handshake",     desc: "SYN → SYN-ACK → ACK",               realDesc: "Real 3-way handshake, measured in ms",    direction: "→" },
  { id: "tls",        label: "TLS Handshake",     desc: "Certificate negotiation",            realDesc: "ClientHello → ServerHello → cert chain",  direction: "→" },
  { id: "request",    label: "HTTP Request",      desc: "Method, path, headers sent",         realDesc: "Raw HTTP/1.1 written to socket",          direction: "→" },
  { id: "processing", label: "Server Processing", desc: "Route matched, response generated",  realDesc: "Time To First Byte (TTFB)",               direction: "⚙" },
  { id: "response",   label: "HTTP Response",     desc: "Status + headers + body returned",   realDesc: "Download time, full body received",       direction: "←" },
];

export const STAGE_BASE_MS: Record<StageId, number> = {
  dns: 18, tcp: 42, tls: 78, request: 8, processing: 0, response: 15,
};

export const STAGE_BAR_COLORS: Record<StageId, string> = {
  dns: "bg-blue-500", tcp: "bg-purple-500", tls: "bg-yellow-500",
  request: "bg-orange-400", processing: "bg-[#ff8f6f]", response: "bg-green-500",
};
export const STAGE_TEXT_COLORS: Record<StageId, string> = {
  dns: "text-blue-400", tcp: "text-purple-400", tls: "text-yellow-400",
  request: "text-orange-400", processing: "text-[#ff8f6f]", response: "text-green-400",
};
export const STAGE_BORDER_COLORS: Record<StageId, string> = {
  dns: "border-l-blue-500/60", tcp: "border-l-purple-500/60", tls: "border-l-yellow-500/60",
  request: "border-l-orange-400/60", processing: "border-l-[#ff8f6f]/60", response: "border-l-green-500/60",
};
export const STAGE_BG_ACTIVE: Record<StageId, string> = {
  dns: "bg-blue-500/5", tcp: "bg-purple-500/5", tls: "bg-yellow-500/5",
  request: "bg-orange-400/5", processing: "bg-[#ff8f6f]/5", response: "bg-green-500/5",
};
export const STAGE_ICON: Record<StageId, string> = {
  dns: "travel_explore", tcp: "cable", tls: "lock",
  request: "upload", processing: "memory", response: "download",
};

export const STATUS_TEXT: Record<number, string> = {
  200: "OK", 201: "Created", 204: "No Content",
  301: "Moved Permanently", 302: "Found", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
  404: "Not Found", 429: "Too Many Requests",
  500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
};

// ── Utilities ──────────────────────────────────────────────────

export function statusColor(s: number): string {
  if (s >= 200 && s < 300) return "text-green-400";
  if (s >= 300 && s < 400) return "text-blue-400";
  if (s >= 400 && s < 500) return "text-yellow-400";
  return "text-red-400";
}

export function substituteParams(body: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((b, [k, v]) => b.replaceAll(`:${k}`, v), body);
}

export function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
export function uid() { return Math.random().toString(36).slice(2, 10); }

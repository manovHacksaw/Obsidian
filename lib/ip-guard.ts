/**
 * Rejects private/loopback/link-local/reserved IPv4 and IPv6 addresses
 * to prevent Server-Side Request Forgery (SSRF).
 *
 * Covers: RFC 1918, RFC 5737, RFC 3927, RFC 6598, loopback, multicast,
 * and IPv6 ULA / link-local / multicast ranges.
 */
export function isBlockedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [, a, b, c] = v4.map(Number);
    return (
      a === 0 ||                                        // 0.0.0.0/8
      a === 10 ||                                       // 10.0.0.0/8
      a === 127 ||                                      // 127.0.0.0/8 loopback
      (a === 100 && b >= 64 && b <= 127) ||             // 100.64.0.0/10 shared
      (a === 169 && b === 254) ||                       // 169.254.x.x link-local / metadata
      (a === 172 && b >= 16 && b <= 31) ||              // 172.16.0.0/12
      (a === 192 && b === 0 && c === 2) ||              // 192.0.2.0/24 TEST-NET-1
      (a === 192 && b === 168) ||                       // 192.168.0.0/16
      (a === 198 && (b === 18 || b === 19)) ||          // 198.18.0.0/15 benchmarking
      (a === 198 && b === 51 && c === 100) ||           // 198.51.100.0/24 TEST-NET-2
      (a === 203 && b === 0 && c === 113) ||            // 203.0.113.0/24 TEST-NET-3
      a >= 224                                          // 224.0.0.0/4 multicast + reserved
    );
  }
  const lower = ip.toLowerCase();
  return (
    lower === "::1"            ||                       // IPv6 loopback
    lower === "::"             ||                       // IPv6 unspecified
    lower.startsWith("fe80:") ||                        // link-local
    lower.startsWith("fc")    ||                        // ULA
    lower.startsWith("fd")    ||                        // ULA
    lower.startsWith("ff")                              // multicast
  );
}

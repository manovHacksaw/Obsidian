@AGENTS.md

---

## Versioned Engineering Reviews

### Purpose

Periodic system-level reviews capture the honest engineering state of the codebase — correctness issues, security gaps, misleading abstractions, and prioritized next steps. These reviews are the primary mechanism for maintaining mental-model integrity across the project.

They are stored as versioned snapshots, not overwritten, so progress over time can be tracked.

### File Naming Convention

```
/versions/<ISO-date>_<HH-MM-SS>.md
```

Examples:
- `versions/2026-03-25_00-00-00.md` — initial review

Always use ISO-8601 format. Never overwrite an existing file.

### When to Run a Review

Run a full system review:
- After completing any major feature (new protocol module, new API route)
- Before opening a PR that adds real-mode network behavior
- When a new contributor joins the project
- After any security-relevant change (SSRF protection, header validation, TLS config)
- Quarterly as a baseline check

### How to Run

```
Run full system review and save to /versions/<timestamp>.md
```

Instruct Claude to:
1. Read all API routes and frontend pages
2. Identify correctness issues, security gaps, silent lies, and conceptual gaps
3. Generate a structured report (System Overview / Strengths / Critical Issues / Limitations / Conceptual Gaps / Roadmap)
4. Save to `/versions/<YYYY-MM-DD_HH-MM-SS>.md`
5. Update this CLAUDE.md with any new process notes

### How to Interpret Reports

Reports use a severity scale:

| Level | Meaning |
|-------|---------|
| **P0** | Production-breaking — must fix immediately |
| **P1** | Security issue — fix before any public exposure |
| **P2** | Incorrect or misleading — fix before teaching this concept |
| **P3** | Incomplete — schedule for next milestone |

Reports also distinguish:
- **Bug** — code that doesn't do what it claims
- **Silent Lie** — code that works but teaches the wrong thing
- **Architectural gap** — design decision that limits correctness or scalability
- **Conceptual gap** — a missing mental model the learner needs

### Guidelines for This Project

1. **Fix correctness before adding features.** A P1 security issue or P0 bug takes precedence over any new protocol module. An SSE syntax error that kills real mode is more urgent than implementing HTTP/2.

2. **Prioritize mental model integrity.** A simulation that teaches a wrong timing intuition (e.g., "DNS takes 10ms") is actively harmful. Virtual mode timings must be calibrated to real-world medians, with ranges shown.

3. **Avoid misleading abstractions ("silent lies").** Examples of silent lies this project has had:
   - Reporting `savedMs` in keep-alive without TLS duration
   - Labeling `socket.write()` duration as "request sent over network"
   - Using `dnsDuration < 3` as a cache detection heuristic

4. **SSRF protection must be uniform.** Every route that performs DNS resolution + TCP connection on user-supplied input must call `isBlockedIp()` on the resolved IP. No exceptions.

5. **TLS cert validation is disabled by design** (`rejectUnauthorized: false`). This must be explained to learners in the UI. Never ship this configuration without an explicit educational callout.

6. **The virtual/real mode event schema must stay symmetric.** Both modes emit the same event types. Frontend rendering code must not fork on mode — only on the data in the events.

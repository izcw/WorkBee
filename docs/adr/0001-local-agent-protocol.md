# ADR 0001: Local Agent process and credential handoff

- Status: accepted
- Date: 2026-07-14

## Decision

Electron Main owns the Python Agent process and communicates over versioned JSON Lines on stdin/stdout. The renderer only receives business-specific APIs from preload. Python is the sole writer of the local SQLite business database.

Provider keys are encrypted with Electron `safeStorage` and persisted in the desktop user-data directory. Main injects the decrypted key only into the Agent process environment. The key is never placed in protocol messages, SQLite, repository files, command arguments, events, or logs. `AIVRA_DEEPSEEK_API_KEY` remains an explicit development/CI fallback.

The first release uses one local Agent and one OpenAI-compatible provider configuration: DeepSeek at `https://api.deepseek.com`, model `deepseek-v4-flash`. Account and marketplace data remain local UI placeholders until the cloud service is implemented.

## Consequences

The process environment is not a perfect secret channel, but it avoids normal protocol persistence and command-line exposure. A future hardened build may replace it with an anonymous pipe or provider-scoped short-lived token without changing renderer APIs.

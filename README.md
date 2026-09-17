# JEP Guard for ClawHub 1.2.0 — repair candidate

This package contains a Manifest V3 browser companion, a Node.js local evidence recorder, and setup instructions for agent hosts. It displays records explicitly submitted to the bundled recorder. It does not intercept OpenClaw execution or automatically trace browser installations.

## Setup

Use Node.js 24.16 or later on a host with POSIX private-file permissions. Windows ACL enforcement and Firefox support have not been validated; use a supported POSIX environment for this candidate.

1. Stop the old daemon before upgrading. Review the migration section below.
2. From this directory, run `node daemon.js` (or `./start.sh`). This is a foreground process; Ctrl+C stops it. Installation does not run it automatically.
3. Load this directory as an unpacked extension in a Chromium browser's extension developer page. Live browser installation still requires validation before release.
4. The daemon creates `~/.jep-data/auth-token`, a random secret in a private file. Transfer that value locally into the extension's **Daemon Auth Token** field. Never put it in an issue, chat, URL, or source repository.
5. Select **Connect to the local recorder**, keep the default `http://127.0.0.1:9745`, and save. Remote hosts and HTTP redirects are rejected. There is no unauthenticated pairing endpoint.
6. ClawHub page annotations and browser notifications are optional. A page annotation only reminds you to inspect the published audit; it is not a safety verdict.

The token is stored in device-local extension storage, accessible only to trusted extension contexts. It is not cloud synced or supplied to content scripts. Daemon events and the token are sensitive local data.

## Implemented behavior

- `GET /health`: only availability and version; does not expose tokens or event counts.
- All data endpoints require `X-JEP-Token`. `/status` returns explicitly selected fields, never the token.
- `POST /judge`: accepts JSON containing a bounded `who` label, optional UUIDv4 `nonce`, and `payload`. Success means **recorded**, never authorization to execute. The issuer label is caller-supplied, not an authenticated issuer identity.
- `GET /events`: returns at most the latest 100 matching records, with optional `since`, `agent`, and `verb` filters. Extension exports/reports cover this window, not the complete archive.
- Entries contain local SHA-256 chain checksums and persistent nonces. Restart checks the stored chain. These are not issuer signatures, JWS proofs, third-party attestations, or compliance certificates. A host administrator can replace/roll back the entire log.
- Input bodies are limited to 64 KiB; the log to 10,000 records and 16 MiB. Pause the daemon and archive deliberately at the limit. A new archive creates a new replay scope; global historical replay protection is not provided.
- `/skills` reports unsupported, and `/session-graph` is empty. Skill reputation, cross-tab tracing, install enforcement, AI-page overlays, and token-budget interception are not implemented. Their relevant UI controls are disabled.

## Configuration and storage

| Variable | Default | Meaning |
| --- | --- | --- |
| `JEP_PORT` | `9745` | Loopback HTTP port, 1024–65535 |
| `JEP_DATA_DIR` | `~/.jep-data` | Existing directory must be owned by the current user and mode 0700 |
| `JEP_AUTH_TOKEN` | Generated private token file | Optional pre-provisioned high-entropy secret, 43–256 non-whitespace characters |
| `JEP_EXTENSION_ORIGIN` | Extension origins only | Optional exact `chrome-extension://...` origin allowlist entry |

The daemon binds `127.0.0.1`; validates Host and Origin; and authenticates requests independently of CORS. An absent Origin is permitted for local API clients, which still require a token. Other extension origins still require the secret; configure the exact origin for a tighter boundary. This is not isolation from other processes running under your OS account.

Files are `auth-token` and `events-v2.jsonl`, mode 0600. No filesystem ownership/permission changes are silently applied to existing user data. An invalid private directory or log fails startup. Do not disable these checks to get an old directory working.

Clearing extension preferences pauses polling and clears the stored token. It does not delete daemon files. Stop the daemon and separately manage those files when removing the application. To rotate credentials, stop it, securely replace/remove only `auth-token` (or rotate the configured environment secret), restart, and update the extension locally.

## Migration from 1.1.6

The published archive mixed several internal versions and used CommonJS `require` inside an ES module package. The new daemon uses ESM consistently. The old unauthenticated `/status` response included its token, and its automatic pairing window could be claimed by another client. Treat the old token as exposed and provision a new one.

The new recorder never reads the old `state.json` token or `events.jsonl`. Those files are left intact for the owner to review/archive privately; protect them because the old state can contain credentials. Fresh credentials go into `auth-token`, and new records into `events-v2.jsonl`. Manually secure the data directory first if it was created with broad permissions.

This HTTP recorder is a different component from the JEP Guard 3.0.0 Unix-socket daemon. They are not interchangeable. Configure the browser only against this recorder.

## OpenClaw integration

This release remains a **Code Plugin**, matching the existing ClawHub listing. The root `openclaw.plugin.json` declares the configuration, setup skill, and tool ownership; `package.json` points to the real JavaScript entry `openclaw.js`.

The native entry registers one optional tool, `jep_guard_health`. Enable the plugin and allow this tool in the host's tool policy before calling it. Operator configuration `plugins.entries.jep-guard-clawhub.config.port` defaults to 9745 and must match the recorder port. The tool accepts no arguments and contacts only `127.0.0.1:<port>/health` on demand. It has a two-second deadline, a 4 KiB response limit, and never follows redirects. It returns only availability and a bounded reported version. A health response does not authenticate the local service or prove its security.

Loading the plugin does not open a socket, start a daemon, read a token or event file, install a browser extension, or register enforcement hooks. The health tool never calls the authenticated data endpoints. The browser and local recorder still use the manual setup above.

The Code Plugin artifact intentionally excludes Codex/Claude bundle manifests to avoid ambiguous family detection. The setup skill remains available through the native manifest. OpenClaw compatibility is pinned to 2026.9.4; other host versions require validation.

## Packaging and release limits

Source: https://github.com/schchit/jep-guard-clawhub . When publishing, use the exact source commit supplied with this archive, not the earlier bundle commit. The package version remains 1.2.0 because the earlier candidate was rejected before publication.

Run `npm test`, `npm run build`, `clawhub package validate . --openclaw-version 2026.9.4`, and `clawhub package publish . --dry-run` before publication. Local validation and runtime registration capture do not constitute a completed ClawHub security audit or a full installed Chromium/Gateway integration test.

License metadata is retained from the original package (MIT-0). This candidate does not claim an official endorsement or a completed platform audit.

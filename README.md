# JEP Guard for ClawHub 1.2.0 — repair candidate

This bundle contains a Manifest V3 browser companion, a Node.js local evidence recorder, and setup instructions for agent hosts. It displays records explicitly submitted to the bundled recorder. It does not intercept OpenClaw execution or automatically trace browser installations.

## Setup

Use Node.js 22 or later on a host with POSIX private-file permissions. Windows ACL enforcement and Firefox support have not been validated; use a supported POSIX environment for this candidate.

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

## Packaging and release limits

Agent plugin installation exposes the setup skill. It does not load the browser `manifest.json` as JavaScript, start the daemon, grant browser permissions, or register enforcement hooks. The invalid `openclaw.extensions: ["./manifest.json"]` metadata and unsupported native manifest were removed; the companion uses its existing Codex/Claude bundle layout.

The ClawHub listing was classified as a code plugin. Confirm that the registry permits correction to a bundle plugin, or arrange the appropriate package migration before publishing. Supply the actual GitHub source repository and the exact committed source revision; the historical repository URL could not be accessed during repair. No replacement source provenance has been invented.

Run `npm test`, syntax checks, and `clawhub package validate .` locally. Before production publication, also exercise a real daemon socket, Chromium installation, connect/pause/clear/reload, and the intended agent host. The repair workspace could not open listening sockets; request-handler and VM tests do not establish these integrations.

License metadata is retained from the original package (MIT-0). This candidate does not claim an official endorsement or a completed platform audit.

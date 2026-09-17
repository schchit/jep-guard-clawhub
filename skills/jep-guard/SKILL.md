---
name: jep-guard
description: Set up or diagnose the JEP Guard for ClawHub browser companion and its bundled local evidence recorder. Use for this companion's local connection or exported records, not OpenClaw execution enforcement.
---

# JEP Guard browser companion

Read `../../README.md` for setup, token rotation, private file permissions, endpoint contracts, and upgrade limits.

The recorder must be started explicitly by the operator. The native OpenClaw entry registers the optional `jep_guard_health` tool; when allowed by host policy, it checks only the local recorder's public health endpoint on demand. It does not launch a service or modify another host's policy. The browser extension needs its own installation and explicit connection setting.

Use the bundled HTTP recorder, not the separate JEP Guard Unix-socket daemon. Keep its token local; do not print it into chat or attach it to diagnostics. Start troubleshooting with the public `/health` response and non-sensitive error messages.

A successful record is labelled `recorded`. The caller supplies the issuer label; chain hashes are checksums, not signatures. Exports show at most the latest 100 matching records. Do not present a report or a page reminder as an execution grant, a verified skill, a compliance certificate, or complete history.

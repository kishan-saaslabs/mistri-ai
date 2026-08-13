# Security Policy

## Supported versions

This project is pre-1.0. Security fixes land on `main`.

## Reporting a vulnerability

**Do not file a public GitHub issue for security reports.**

Use [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/privately-reporting-a-security-vulnerability) on this repository so maintainers can coordinate a fix before disclosure.

Please include:

- A description of the issue and impact
- Steps to reproduce (proof of concept if possible)
- Affected commit, tag, or branch

You should receive an acknowledgement within 7 days. We will keep you updated as we investigate and ship a fix.

## Secrets and credentials

- Never commit `.env` files, API keys, JWT secrets, or database passwords.
- Use `.env.example` as the template for required variables (empty placeholders only).
- Rotate any credential that was accidentally committed.

## Scope notes

Mistri AI is designed to ingest call recordings. Treat uploaded audio as sensitive:

- Do not log request bodies that may contain tokens, passwords, or transcript PII beyond what is required for debugging.
- File uploads must be type- and size-checked on the server. Do not trust client-supplied MIME types alone.

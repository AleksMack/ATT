# Changelog

All notable changes to this project are recorded in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go at the top, under "Unreleased", until the changes are committed; then they move to an entry headed with the commit date and message.

## [Unreleased]

### Known issues
- `.env` still uses the old key names (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_USER_OTP`, `API_BASE_URL`), while the config expects `USER_LOGIN`, `USER_PASSWORD`, `USER_OTP`, `API_URL`. Until they are renamed, the `setup` project fails with "Missing keys in .env".

## 2026-09-29 — Add conventions to CLAUDE.md

### Added
- "Conventions" section in `CLAUDE.md`: Page Objects, locator priority, no hard waits, self-contained test data with the `AUTO_` prefix, typed API helpers in `api/`, reference data via API, secrets only from `.env`, test naming `should <expected result> when <condition>`.

## 2026-09-29 — Add login setup, changelog and language rule

### Added
- `CHANGELOG.md`: a log of changes, updated on every iteration.
- A rule in `CLAUDE.md` to keep `CHANGELOG.md` up to date.
- A rule in `CLAUDE.md` that all documents and files are written in English.
- `tests/setup/auth.setup.ts`: logs in with `USER_LOGIN`, `USER_PASSWORD` and `USER_OTP` (Login/Password → "Use OTP from the app" → OTP), waits for `/dashboard` and the main menu, and saves the session to `playwright/.auth/user.json`.
- `USER_OTP` key in `.env.example`.
- `/.playwright-mcp/` (Playwright MCP output) in `.gitignore`.

### Changed
- `setup` project: trace and video are turned off so the password and OTP are never recorded; the failure screenshot is kept.

## 2026-09-29 — `cc63b71` Add Playwright MCP and Test Agents

### Added
- `.mcp.json` with two MCP servers, both started via `cmd /c npx` (on Windows a bare `npx` fails to start with ENOENT):
  - `playwright`: `@playwright/mcp`, pinned to version 0.0.83;
  - `playwright-test`: `npx playwright run-test-mcp-server`, used by the agents.
- Playwright Test Agents for Claude (`npx playwright init-agents --loop=claude`): `planner`, `generator` and `healer` in `.claude/agents/`.
- `specs/`: folder for the planner agent's test plans.
- `tests/ui/seed.spec.ts`: the seed test the agents start from (empty for now).
- A section about the AI tooling in `CLAUDE.md`.

### Removed
- `.github/` (GitHub Actions workflow): CI will be set up later. The folder was never committed.

## 2026-09-29 — `6569696` Project setup

### Added
- `playwright.config.ts`: loads `.env` via dotenv, `baseURL` from `BASE_URL`, Chromium only, `workers: 1`, trace, screenshot and video kept only on failure, list and html reporters.
- Three projects: `setup` (`tests/setup/*.setup.ts`, saves the session to `playwright/.auth/user.json`), `ui` (`tests/ui`, depends on `setup`, uses the saved session if the file already exists), `api` (`tests/api`, `baseURL` from `API_URL`).
- Folders `tests/ui`, `tests/api`, `tests/setup`, `pages`, `data`.
- `.env.example` with the keys `BASE_URL`, `API_URL`, `USER_LOGIN`, `USER_PASSWORD`.
- `.gitignore`: `node_modules`, `.env`, `playwright/.auth`, `test-results`, `playwright-report`, `blob-report`.
- `CLAUDE.md` describing the project for Claude Code.

### Removed
- The Playwright example `tests/example.spec.ts`.
- The empty file `1` from the initial commit.

## 2026-09-29 — `50a3413` Initial commit

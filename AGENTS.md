# Repository Guidelines

你是一个中文开发者，回答也请用中文。

## Project Structure & Module Organization
- `src/`: React frontend (entry: `main.jsx`, app shell: `App.jsx`, screens: `Login.jsx`, `Home.jsx`).
- `src-tauri/src/`: Rust backend for Tauri commands (`main.rs`) plus modules for persistence and crypto (`db.rs`, `crypto.rs`).
- `src-tauri/tauri.conf.json`: Tauri app/build config.
- Root build files: `package.json`, `vite.config.js`, `index.html`.
- Build artifacts (`node_modules/`, `src-tauri/target/`, `dist/`) should not be edited manually.

## Build, Test, and Development Commands
- `npm run dev`: start Vite frontend dev server.
- `npm run tauri-dev`: run full desktop app (frontend + Tauri runtime).
- `npm run build`: produce frontend production bundle in `dist/`.
- `npm run tauri-build`: build desktop installers/binaries.
- `cd src-tauri && cargo test`: run Rust unit/integration tests (when present).

## Coding Style & Naming Conventions
- JavaScript/JSX: 2-space indentation, semicolons, single quotes, functional React components with hooks.
- Component/file naming: PascalCase for components (`Home.jsx`), camelCase for variables/functions.
- Rust: follow `rustfmt` defaults (4-space indentation), `snake_case` for functions/modules, `PascalCase` for structs.
- Keep Tauri commands explicit and serializable (`#[tauri::command]`, `serde` types).

## Testing Guidelines
- Frontend test framework is not configured yet; add tests next to source files as `*.test.jsx` when introducing test tooling.
- Rust tests should live in `#[cfg(test)]` modules or `src-tauri/tests/` with descriptive names like `db_open_rejects_bad_password`.
- Before opening a PR, at minimum run `npm run build` and `cargo test` (if tests exist).

## Commit & Pull Request Guidelines
- Git metadata is not available in this workspace snapshot, so no historical commit convention could be derived.
- Use concise, imperative commit messages (example: `feat: add secret type filter`, `fix: handle invalid db header`).
- PRs should include: purpose, key changes, manual verification steps, and screenshots for UI changes.
- Link related issues and call out security-sensitive changes (crypto, DB access, file-system permissions).

## Security & Configuration Tips
- Never commit real API keys, database files, or plaintext secrets.
- Review `src-tauri/tauri.conf.json` allowlist changes carefully; keep permissions minimal.
- Validate error messages to avoid exposing sensitive crypto or storage details.

## Collaboration Note
- 如果遇到本地权限问题（如沙箱限制、提权受限、网络受限），请先让我手动在本地执行相关命令，再继续后续步骤。

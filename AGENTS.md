# Repository Guidelines

你是一个中文开发者，回答也请用中文。

## Project Structure & Module Organization
- `src/`: React frontend (entry: `main.jsx`, app shell: `App.jsx`, screens: `Login.jsx`, `Home.jsx`).
- `server/src/`: Fastify API, authentication, database access, encryption logic.
- `deploy/`: deployment examples and container configuration.
- Root build files: `package.json`, `vite.config.js`, `index.html`, `docker-compose.yml`.
- Build artifacts (`node_modules/`, `dist/`) should not be edited manually.

## Build, Test, and Development Commands
- `pnpm dev`: start Vite frontend dev server.
- `pnpm api-dev`: start Fastify API in watch mode.
- `pnpm build`: produce frontend production bundle in `dist/`.
- `docker compose up -d --build`: start the self-hosted web stack.

## Coding Style & Naming Conventions
- JavaScript/JSX: 2-space indentation, semicolons, single quotes, functional React components with hooks.
- Component/file naming: PascalCase for components (`Home.jsx`), camelCase for variables/functions.
- Node.js service code should stay modular; prefer extracting route helpers/service logic when files grow.

## Testing Guidelines
- Frontend test framework is not configured yet; add tests next to source files as `*.test.jsx` when introducing test tooling.
- API tests can live under `server/` with descriptive names.
- Before opening a PR, at minimum run `pnpm build`.

## Commit & Pull Request Guidelines
- Git metadata is not available in this workspace snapshot, so no historical commit convention could be derived.
- Use concise, imperative commit messages (example: `feat: add secret type filter`, `fix: handle invalid db header`).
- PRs should include: purpose, key changes, manual verification steps, and screenshots for UI changes.
- Link related issues and call out security-sensitive changes (crypto, DB access, file-system permissions).

## Security & Configuration Tips
- Never commit real API keys, database files, or plaintext secrets.
- Review environment variable and container configuration changes carefully; keep exposed ports and secrets minimal.
- Validate error messages to avoid exposing sensitive crypto or storage details.

## Collaboration Note
- 如果遇到本地权限问题（如沙箱限制、提权受限、网络受限），请先让我手动在本地执行相关命令，再继续后续步骤。
- 如果出现代码更新，每次都需要提醒用户上传到 GitHub，并给出可直接执行的 `git add`、`git commit`、`git push` 命令。

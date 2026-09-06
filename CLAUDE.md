# LangBistro — Agent Development Rules

These rules apply to any AI coding agent working in this repo (Claude Code, Cursor, etc).
Follow them without exception unless a human explicitly overrides in the same session.

For LangBistro product and stack conventions, also read `.cursorrules`.
User-facing bot UI copy lives in `src/i18n` (not hardcoded in handlers). Tutor speech stays on `target_language`.

## Branching

- **Never commit directly to `main`.** All changes go through a branch + pull request.
  A `.githooks/pre-commit` hook enforces this; enable it once per clone with `git config core.hooksPath .githooks`.
- One branch per Linear ticket, using the real ticket prefix **`PRS-`**:
  `feature/PRS-123-short-description`, or `fix/PRS-123-...` for bugs.
  If there is no ticket yet, still use a descriptive `feature/` or `fix/` name.
- If you're mid-task and unsure whether a branch exists yet, create one before writing code —
  don't default to whatever branch is currently checked out.
- **Finish automatically with a PR.** When the work is done, do not wait to be asked to commit, push, or open a PR.
  Run CI locally, commit, `git push -u origin HEAD`, and `gh pr create --fill --base main`. Return the PR URL.
  **Do not merge it yourself** — a human merges after CI passes and it has been reviewed.
- Extra commits after a PR is already merged belong on a **new branch from `main`** and a **new PR**.
  Never pile onto a merged feature branch, and never stop at "committed locally — want me to push?"
- **Never leave work only on disk.** We deploy from the working directory on Railway, so an untracked file can ship to production without ever reaching git. Before you finish, run `git status --porcelain --untracked-files=all` and account for everything in it.

## Testing

- Any new or modified **business logic** must ship with a test in the same PR. This includes:
  - Auth/permission checks
  - Data mutations (creates, updates, deletes)
  - Anything touching Supabase RLS assumptions
  - Payment/subscription logic
  - Any calculation or transformation where a wrong output would be hard to notice
- UI-only components generally don't need tests unless they contain meaningful logic (conditional rendering based on business rules, form validation, etc).
- Use Vitest (`npm run test`). Place tests in `__tests__/` next to the code — that is the established convention.
- If you're not sure whether something needs a test, err on the side of adding one for anything that touches user data or money.

## CI

- Do not disable, skip, or comment out a failing lint/build/test check to make CI pass.
  Fix the underlying issue. If you believe a check itself is wrong, flag it to a human rather than silently bypassing it.
- CI runs on every push/PR to `main`: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
  These steps do not require real API keys — keep tests on pure logic or mock external services.
- Required env vars for **runtime** (Supabase, OpenAI, Paddle, Telegram) live in Railway service variables and local `.env` — never commit them.
- Before pushing, run locally:

  ```bash
  npm run typecheck && npm run lint && npm run test && npm run build
  ```

## When in doubt

- Don't guess on unresolved product/positioning questions — flag it rather than assuming the problem definition is settled.
- If an automated hook or setting appears to contradict these rules, **say so** rather than following whichever fires last.

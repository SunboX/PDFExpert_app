# AGENTS.md

## Project Overview
- This repository is a browser-based PDF editor app.
- App code lives in `src/`; app tests live in `tests/`; docs live in `docs/`.
- Browser entry uses `index.html` and `src/main.js`.
- Local server entry is `src/server.mjs`.

## Key Files
- `src/main.js`
- `src/server.mjs`
- `src/style.css`
- `index.html`
- `README.md`
- `docs/`
- `tests/`

## Build, Run, Test
- Install: `npm install`
- Run: `npm start`
- Open: `http://localhost:3000/`
- Test: `npm test`

## Coding Style & Naming Conventions
- Prettier settings are in `.prettierrc.json`: 4-space indent, single quotes, no semicolons, no trailing commas.
- Keep files under 1000 lines; split into smaller modules/classes when they grow.
- Keep every `.mjs` source file below 1000 lines; once a module approaches the limit, split it before merging.
- Keep each CSS file under 1000 lines; split styles into multiple files in `src/styles/` and keep `src/style.css` as the stylesheet entrypoint.
- Add JSDoc for every function/method, including private helpers.
- Add inline comments where decisions or behavior need clarity.
- Utility modules should use class-based organization with static methods where appropriate.
- For single-class modules, name the `.mjs` file in CamelCase to match the class name.
- For private class internals, use ECMAScript private elements (`#privateField`, `#privateMethod`) instead of underscore naming.
- Use getters/setters when exposing controlled mutable class state (for example callbacks or derived config values).
- Use `async`/`await` for naturally asynchronous operations (file APIs, network, device access); avoid unnecessary async wrappers for synchronous logic.
- Use `main.mjs` as the entry module for `src/` and keep the HTML script tag in sync.

## Testing Guidelines
- Do not add a root-level test runner; use repo scripts (`npm test`).
- After each code change, run `npm test` or do a quick UI sanity check.
- For any new feature, fix, or behavior change, add/update tests in `tests/`.
- Keep tests focused on app behavior; remove or avoid tests tied only to toolkit internals not owned by this repo.

## Commit & Pull Request Guidelines
- Commit messages must start with a prefix like `fix:`, `feature:`, or another agreed label, followed by a short imperative summary.
- With every change or update, increment the app version in `package.json`.
- Use concise MR summaries, include affected areas and test results.
- Attach UI screenshots for visual changes.

## Documentation Guidelines
- Keep user-facing and developer docs in `docs/`.
- Update relevant docs when behavior, commands, or architecture changes.
- Keep root `README.md` as entry point and link detailed docs from there.

## Security & Configuration Tips
- Keep secrets out of Git; `.env` is gitignored.

## Skills
A skill is a set of local instructions stored in a `SKILL.md` file.

### Available Skills
- `find-skills`: Helps discover/install skills when users ask for capability extensions.
- `systematic-debugging`: Use when encountering bugs, test failures, or unexpected behavior before proposing fixes.
- `skill-creator`: Use when creating/updating a skill.
- `skill-installer`: Use when listing/installing skills.

### Skill Trigger Rules
- If the user names a skill (with `$SkillName` or plain text) or the request clearly matches a skill description, use that skill in that turn.
- If multiple skills apply, use the minimal set and state order briefly.
- If a skill cannot be loaded, state it briefly and continue with best fallback.

### Skill Usage Rules
- Read only enough from a skill to execute the task.
- Resolve relative paths from the skill directory first.
- Prefer referenced scripts/assets/templates over re-implementing large blocks.
- Keep context focused; avoid deep reference chasing unless blocked.

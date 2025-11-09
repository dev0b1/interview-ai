# PR: feat/hroast-rebrand-answer-timer

## Summary

This PR implements a safe cosmetic rebrand to "Hroast", adds a frontend AnswerTimer component wired to backend agent signals, and applies a few build/type fixes so the repository builds cleanly in this environment.

Branch: `feat/hroast-rebrand-answer-timer`

## Changes

- Added `AnswerTimer` UI to show remaining answer seconds and a progress bar in the interview header.
  - File: `src/app/interview/page.tsx`
  - Renders `<AnswerTimer isActive={isAnswering} maxSeconds={90} />` and includes the component implementation.
- Fixed a duplicate `AnswerTimer` declaration that caused a build failure.
- Adjusted Next.js dynamic route typing for `src/app/interviews/[id]/page.tsx` to avoid generated-type mismatches at build time (uses permissive `props: any` and awaits params). This is intentionally pragmatic; can be tightened later.
- Temporarily switched `package.json` `dev`/`build` scripts to use Next's webpack (`next dev` / `next build`) instead of `--turbopack` so the production build completes reliably in this environment.
- Updated docs and metadata for the cosmetic brand change to `Hroast` (README, copilot instructions, layout metadata, several UI strings). No infra or DB renames were performed.
- Added `CHANGELOG.md` with a summary of the above.

## Files changed (high level)
- src/app/interview/page.tsx (AnswerTimer + wiring)
- src/app/interviews/[id]/page.tsx (dynamic route typing fix)
- package.json (dev/build scripts + package name already updated)
- CHANGELOG.md (new)
- README.md, .github/copilot-instructions.md, src/app/layout.tsx, src/lib/history.ts, and a few UI components (cosmetic copy updates)

## Why
- The backend agent now emits explicit attempt/timeout signals. The frontend now displays an answer timer and reacts to `isAnswering` derived from `live-metrics` fields such as `timeout_occurred`, `current_attempt`, `max_attempts`, and `interview_ended`.
- Build and types fixes make the repository build cleanly in CI/dev where Turbopack may not be desirable.

## How to test locally
1. Install deps (if not already):

```bash
npm install
```

2. Run a production build (this PR uses webpack-based build script):

```bash
npm run build
```

3. Run dev server:

```bash
npm run dev
```

4. Start an interview and confirm:
- The header shows elapsed time and an Answer Timer when the backend agent signals `isAnswering`.
- Live metrics update question number & filler word counts.

## Notes / follow-ups
- If you want Turbopack back in `package.json`, you can revert the `dev` and `build` scripts to include `--turbopack`. I left webpack because it completed reliably here.
- The dynamic route typing was loosened; I can rework a stricter type that satisfies Next's generated checks if you prefer stronger type-safety.
- Pending work: add brand assets (favicon/logo) and prepare an infra-level migration plan if you want to rename DB/storage/environment keys.

---

Link to branch (pushed): `feat/hroast-rebrand-answer-timer`

If you want, I can open the PR programmatically (needs a GitHub token) or generate the PR via the GitHub UI using the suggested link from the git push output.

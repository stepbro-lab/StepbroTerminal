# Contributing to stepbro terminal

Thanks for wanting to make stepbro terminal better. This guide explains how to propose a change
and what a pull request needs before it can be merged.

## Ways to help

- **Report a bug** with the [bug report form](https://github.com/stepbro-lab/StepbroTerminal/issues/new?template=bug_report.yml). Include
  your system, the app's version (at the bottom of **Settings**) and the agent involved, if
  any.
- **Suggest an idea** in [Discussions](https://github.com/stepbro-lab/StepbroTerminal/discussions/categories/ideas) or with the
  [feature request form](https://github.com/stepbro-lab/StepbroTerminal/issues/new?template=feature_request.yml).
- **Fix something or build something.** For anything bigger than a small fix, open an issue or a
  discussion first, so we can agree on the approach before you spend time on it.
- **Translate.** The interface is in English and Spanish; corrections to either are welcome.

Security problems are the exception: never report them in public. Follow [SECURITY.md](SECURITY.md).

## Setting up

You need Node.js 22 (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
STEP_HOME=/tmp/step-dev/home STEP_USER_DATA=/tmp/step-dev/data pnpm dev
```

Always give a development build its own `STEP_HOME` and `STEP_USER_DATA` if you also use the
installed app: otherwise both share `~/.step`, and restarting the development host closes the
sessions you are working in. The [README](README.md#building-from-source) lists the other
commands and helper scripts.

## Making a change

- **Keep it focused.** One fix or one feature per pull request. Unrelated cleanups go in their own.
- **Match the code around you.** TypeScript throughout, single quotes, no semicolons, two-space
  indentation. There is no formatter to run: do not reformat code you are not changing.
- **Let the code speak.** Clear names come first. Add a comment only for what the code cannot say,
  such as a platform quirk or a workaround.
- **Every word people see is translated.** Strings in the interface are written in English and
  looked up through `t()`; add the Spanish for each new one to `src/shared/i18n.es.ts`. The tests
  fail when one is missing.
- **Think about all three systems.** The app ships on Windows, macOS and Linux. Paths, shells,
  signals and keyboard shortcuts differ between them; if you can only test on one, say which in the
  pull request.
- **Interface changes are held to a high bar.** Polish is part of the product. Check light and dark
  themes, the translucent window, a narrow window and long names, and make sure things line up to
  the pixel with what sits next to them. Include before and after screenshots.
- **Do not touch the changelog or the version.** `src/shared/changelog.ts` and `package.json` are
  updated by the maintainers when a release is cut.

## Before you open a pull request

```sh
pnpm typecheck
pnpm test
pnpm build
```

If you changed the session host (`src/host`), also run `node scripts/backend-smoke.mjs` after
building. The same checks run on Windows, macOS and Linux for every pull request.

Add or update tests for behaviour you change. Most logic lives in small, pure modules with a
`.test.ts` beside them; follow that pattern.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org), in English:

```
fix(host): keep the scrollback when a session restarts

Explain what changed and why when the summary is not enough.
```

Common types are `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci` and `chore`.
Keep the summary short and in the imperative mood.

## Review

An automated guard checks every pull request for binaries, unsafe code and suspicious dependencies,
and posts what it finds. A maintainer then reviews every pull request. We may ask for changes, suggest a different approach, or
decline a change that does not fit where the app is going; that is never a judgement on you. Once
it is approved and the checks pass, a maintainer merges it.

## Contribution terms

stepbro terminal is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). By
opening a pull request, you confirm that:

1. The contribution is your own work, or you have the right to submit it.
2. You license it under the same terms as the project.
3. You also grant kevin9038440334 and stepbro lab a perpetual, worldwide, non-exclusive,
   royalty-free and irrevocable license to use, change, sublicense and distribute your
   contribution, including under other licenses, so the project can keep being maintained and
   offered as a whole.

You keep the copyright to your work. Contributors are credited in the repository's history.

## Conduct

Everyone taking part in this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

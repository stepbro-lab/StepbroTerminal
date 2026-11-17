# Security policy

stepbro terminal runs your shells and coding agents on your computer, so we take security reports
seriously and handle them before anything else.

## Supported versions

Fixes go into the latest release. Please check that a problem still happens on the newest version
from the [releases page](https://github.com/kevin9038440334/StepbroTerminal-releases/releases)
before reporting it.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. Include:

- what an attacker could do, and under which conditions;
- the steps to reproduce it, or a proof of concept;
- the app's version and your operating system.

We will acknowledge your report, keep you informed while we work on it, and agree on a date to
publish the details once a fixed version is out. We are happy to credit you in the advisory unless
you prefer to stay anonymous.

## What is in scope

- The session host and its local socket or named pipe.
- The local endpoint for Claude Code hooks and the built-in MCP server, which listens on
  `127.0.0.1` behind a random token.
- The Electron app: its main process, preload bridge, window and preview pane.
- The update mechanism and the published installers.

## What is not a vulnerability

- An agent doing something you allowed it to do. Agents run with your user's permissions, in a
  shell you opened, and stepbro terminal does not sandbox them.
- Anything that requires an attacker who already controls your user account or your computer.
- Problems in a third-party agent or command-line tool themselves. Report those to their authors.
- The installers not being signed with a paid certificate yet. This is known and documented.

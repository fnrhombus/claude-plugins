# fnrhombus plugins

Central [Claude Code](https://code.claude.com) plugin marketplace for plugins published by [@fnrhombus](https://github.com/fnrhombus).

## Install

Run these inside Claude Code:

```
/plugin marketplace add fnrhombus/claude-plugins
/plugin install <plugin-name>@fnrhombus-plugins
```

Browse available plugins in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) or on the [GitHub topic page](https://github.com/search?q=topic%3Aclaude-code-plugin+user%3Afnrhombus&type=repositories).

## How it works

This marketplace is **auto-generated**. A scheduled GitHub Actions workflow in this repo (`update-marketplace.yml`) runs daily — and on demand via `workflow_dispatch` — and:

1. Searches GitHub for any public repo owned by `fnrhombus` tagged with the `claude-code-plugin` topic
2. Fetches each repo's `.claude-plugin/plugin.json` from its default branch
3. Rebuilds this marketplace's `.claude-plugin/marketplace.json` with one entry per discovered plugin, referencing the plugin's original repo via the `github` source type
4. Commits any changes back to this repo

Plugin authors do not need to touch this repo. They just:

1. Create a new repo from [`fnrhombus/claude-code-plugin-template`](https://github.com/fnrhombus/claude-code-plugin-template)
2. Tag it with the `claude-code-plugin` topic
3. Keep `.claude-plugin/plugin.json` up to date on the default branch

The cron will pick up the plugin within 24 hours, or immediately if the author runs:

```bash
gh workflow run update-marketplace.yml --repo fnrhombus/claude-plugins
```

## Why pull instead of push?

GitHub's `GITHUB_TOKEN` is repo-scoped, so a plugin repo's CI can't write to this marketplace repo directly without a long-lived Personal Access Token stored as a secret in every plugin repo. Inverting the flow — having this repo pull from plugin repos on its own schedule — eliminates all cross-repo auth: the marketplace's workflow only writes to itself, and reads from public plugin repos require no token.

## License

MIT. Each plugin has its own license in its own repo.

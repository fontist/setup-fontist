# Setup Fontist

[![Test action](https://github.com/fontist/setup-fontist/actions/workflows/test-action.yml/badge.svg)](https://github.com/fontist/setup-fontist/actions/workflows/test-action.yml)

🔠 Install [Fontist](https://www.fontist.org/) for GitHub Actions

<table align=center><td>

```yml
- uses: fontist/setup-fontist@v2
- run: fontist install "Fira Code"
```

</table>

This action installs [Fontist](https://www.fontist.org/), a cross-platform font package manager, on GitHub Actions runners. It handles multi-level caching to speed up your CI workflows.

- 💎 Uses Ruby to install the fontist Ruby gem
- 🟦 Works with Windows
- 🐧 Works with Ubuntu
- 🍎 Works with macOS
- ⚡ Caches installation in `$RUNNER_TOOL_CACHE` and/or the workflow cache
- 📐 Caches `~/.fontist` font installs by default using `manifest.yml`
- 🔐 Supports private formula repositories with GitHub token authentication

# Prerequisites

This action requires **Ruby 3.2 or later**. Most GitHub-hosted runners include Ruby 3.2+ by default:

| Runner | Default Ruby | Works out of the box? |
|--------|-------------|----------------------|
| `ubuntu-latest` (24.04), `ubuntu-24.04`, `ubuntu-24.04-arm` | 3.2+ | ✅ Yes |
| `ubuntu-22.04`, `ubuntu-22.04-arm` | 3.0.2 | ❌ Needs setup-ruby |
| `macos-latest`, `macos-15`, `macos-15-intel`, `macos-26` | 3.2+ | ✅ Yes |
| `windows-latest`, `windows-2022`, `windows-2025` | Various | ❌ Needs setup-ruby |
| `windows-11-arm` | N/A | ❌ Not supported |

For runners that need a newer Ruby version, add `ruby/setup-ruby@v1` before this action:

```yaml
- uses: ruby/setup-ruby@v1
  with:
    ruby-version: "3.2"
- uses: fontist/setup-fontist@v2
```

# Usage

<!-- start usage -->
```yaml
- uses: fontist/setup-fontist@v2
  with:
    # The version of Fontist to install. This can be an exact version like
    # '1.10.0' or a semver range such as '1.x' or '~1.15.0'.
    # Default: latest
    fontist-version: ''

    # GitHub token for accessing private formula repositories.
    # Default: ${{ github.token }}
    github-token: ''

    # A multiline list of private Fontist formula repositories to set up.
    # Each line should be in format: NAME URL
    # Example:
    #   acme https://github.com/acme/fontist-formulas.git
    #   corp https://github.com/corp/fonts.git
    # Default: ''
    formula-repos: ''

    # Whether to use @actions/cache to cache things in the GitHub workflow cache.
    # Default: true
    cache: ''

    # A multiline list of globs to use to derive the '~/.fontist' cache key.
    # If no files are matched at runtime then the '~/.fontist' folder will
    # not be cached.
    # Default: |
    #   manifest.yml
    #   manifest.yaml
    cache-dependency-path: ''
```
<!-- end usage -->

# Scenarios

- [Basic usage](#basic-usage)
- [Install specific version](#install-specific-version)
- [Use with manifest file](#use-with-manifest-file)
- [Private formula repositories](#private-formula-repositories)
- [Disable caching](#disable-caching)
- [Custom cache key](#custom-cache-key)

## Basic usage

```yaml
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: fontist/setup-fontist@v2
      - run: fontist install "Fira Code"
```

## Install specific version

```yaml
- uses: fontist/setup-fontist@v2
  with:
    fontist-version: '1.10.0'  # or '1.x' or '~1.15.0'
```

## Use with manifest file

Create a `manifest.yml` file in your repository:

```yaml
# manifest.yml
Fira Code:
- Regular
- Bold
Source Sans Pro:
- Regular
```

Then use it in your workflow:

```yaml
- uses: fontist/setup-fontist@v2
  # cache-dependency-path defaults to manifest.yml
- run: fontist manifest install manifest.yml
```

## Private formula repositories

To use private formula repositories hosted on GitHub, provide the `formula-repos` input with a list of repositories:

```yaml
- uses: fontist/setup-fontist@v2
  with:
    # Uses the default GITHUB_TOKEN which has access to the current repo
    # For cross-repo access, use a PAT with appropriate permissions
    github-token: ${{ secrets.PRIVATE_FONTS_TOKEN }}
    formula-repos: |
      acme https://github.com/acme/fontist-formulas.git
      corp https://github.com/corp/fonts.git
- run: fontist install "Acme Custom Font"
```

> **Note:** `${{ github.token }}` is scoped to the current repository. To access private formula repositories in other organizations, you need to provide a [Personal Access Token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with `repo` scope.

## Disable caching

```yaml
- uses: fontist/setup-fontist@v2
  with:
    cache: false
```

## Custom cache key

By default, the `~/.fontist` cache key is derived from `manifest.yml` and `manifest.yaml`. You can customize this:

```yaml
- uses: fontist/setup-fontist@v2
  with:
    cache-dependency-path: |
      fonts/requirements.yml
      **/manifest.yml
```

# Outputs

- **`fontist-version`:** The version of Fontist that was installed (e.g., `1.10.0`).
- **`cache-hit`:** Whether Fontist was restored from cache (`true`) or newly downloaded (`false`).

```yaml
- uses: fontist/setup-fontist@v2
  id: setup-fontist
- run: echo "Installed Fontist ${{ steps.setup-fontist.outputs.fontist-version }}"
```

# Recommended permissions

When using this action in your GitHub Actions workflow, it is recommended to set the following `GITHUB_TOKEN` permissions:

```yaml
permissions:
  contents: read
```

If you're using the `cache` feature (enabled by default), you may also need:

```yaml
permissions:
  contents: read
  actions: read  # for cache restore
  # actions: write  # for cache save (needed in some cases)
```

# Troubleshooting

## Ruby version too old

If you see an error like `Ruby 3.2.0+ is required, but found Ruby 3.0.2`, your runner's default Ruby is too old. See the [Prerequisites](#prerequisites) section for details on which runners need `ruby/setup-ruby@v1`.

## Windows native extension build failures

On Windows runners, you may encounter errors like `Failed to build gem native extension` when installing fontist. This is a known Ruby issue on Windows with certain Ruby versions.

**Workaround:** Install a specific Ruby version before using this action:

```yaml
- uses: ruby/setup-ruby@v1
  with:
    ruby-version: "3.4"
- uses: fontist/setup-fontist@v2
```

See [issue #17](https://github.com/fontist/setup-fontist/issues/17) for more details.

## Windows ARM not supported

**Windows ARM (`windows-11-arm`) is not currently supported** because [Nokogiri](https://github.com/sparklemotion/nokogiri), a dependency of Fontist, does not provide native gems for Windows ARM. When Nokogiri adds ARM support, this action will work on Windows ARM runners.

**Status:** We test Windows ARM in CI as an experimental job. When it test passes, it know Nokogiri has added Windows ARM support.

# Development

This action is built with [Bun](https://bun.sh/) but runs on Node.js 24.

```bash
# Install dependencies
bun install

# Build the action (compiles src/main.ts and src/post.ts to dist/)
bun run build

# Type check
bun run lint

# Format code
bun run format
```

**Testing:** Tests are run via GitHub Actions. Open a PR to trigger test runs across ubuntu-latest and macos-latest runners.

Note: Since [Bun doesn't support Windows yet](https://github.com/oven-sh/bun/issues/43), we can't run `bun build` on Windows runners. However, the action still works on Windows since Bun is only used for the build step; it runs using Node.js via `using: node24`.

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE).

# Contributions

This GitHub Action was originally created by @jcbhmr for the [Typst project](https://github.com/typst-community/typst.js) and contributed to [Fontist](https://www.fontist.org).

Huge thanks to @jcbhmr for the tremendous effort in improving the Fontist ecosystem!

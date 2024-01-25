# Setup Fontist

🔠 Install [Fontist](https://www.fontist.org/) for GitHub Actions

<table align=center><td>

```yml
- uses: fontist/setup-fontist@v1
- run: fontist install "Fira Code"
```

</table>

💎 Uses Ruby to install the fontist Ruby gem \
🟦 Works with Windows \
🔠 Lets you install additional fonts

## Usage

![GitHub Actions](https://img.shields.io/static/v1?style=for-the-badge&message=GitHub+Actions&color=2088FF&logo=GitHub+Actions&logoColor=FFFFFF&label=)
![GitHub](https://img.shields.io/static/v1?style=for-the-badge&message=GitHub&color=181717&logo=GitHub&logoColor=FFFFFF&label=)

```yml
on: push
jobs:
  job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jcbhmr/setup-fontist@v1
      - run: fontist install "Fira Code"
```

**⚠️ This action takes a while** (~1 minute). There's currently **no caching**. [Caching is planned for the future.](#TODO)

### Inputs

- **`setup-ruby`:** Whether or not to run [ruby/setup-ruby](https://github.com/ruby/setup-ruby) or to assume that the user has supplied an appropriate global Ruby installation. Defaults to `true`. Set this to `false` to provide your own custom Ruby installation.

- **`fontist-version`:** An exact version of the fontist Ruby gem to install. Defaults to `1.19.0`.

## Development

![GNU Bash](https://img.shields.io/static/v1?style=for-the-badge&message=GNU+Bash&color=4EAA25&logo=GNU+Bash&logoColor=FFFFFF&label=)

TODO: Add development section

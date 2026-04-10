# Contributing

Thanks for contributing to TableCam.

## Development Setup

1. Fork the repository
2. Create a feature branch from `main`
3. Install dependencies:

```bash
npm install
```

4. Run locally:

```bash
npm run desktop
```

## Pull Request Guidelines

- Keep PRs focused and small
- Include a clear description of behavior changes
- Add screenshots/gifs for UI updates when relevant
- Verify the following before opening a PR:

```bash
npx tsc --noEmit
npm run build:electron
npm run build
```

## Commit Guidance

- Use clear, imperative commit messages
- Prefer messages that explain the reason for the change

## Reporting Issues

When opening an issue, include:

- OS and version
- Steps to reproduce
- Expected result
- Actual result
- Logs/screenshots if available


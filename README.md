# Gitcom - AI-Powered Commit Assistant

An intelligent git commit assistant extension for Kiro that helps developers create meaningful, structured, and consistent commit messages using AI analysis.

## Features

- **Git Diff Analysis** - Uses `simple-git` to analyze staged/unstaged changes, file paths, and diff contents
- **AI Commit Suggestions** - Generates intelligent commit messages with 3 detail levels (concise/normal/verbose)
- **Interactive UI & CLI** - Preview, edit, apply, or reject AI suggestions through both interfaces
- **Batch Commit Operations** - Stage files by groups and apply multiple commits efficiently
- **Multiple Commit Styles** - Supports Conventional Commits, Semantic versioning, and custom formats

## Usage

1. Make your code changes (staged or unstaged)
2. Run `Gitcom: Generate AI Commit Message` from the command palette
3. Review AI-generated suggestions with your chosen detail level
4. Choose to apply immediately, edit and rewrite, or reject and continue manually
5. GitCom stages files by groups and applies commits with chosen messages
6. Push normally afterward

## Commit Styles

### Conventional Commits (Default)
```
feat(auth): add user authentication system
fix(api): resolve null pointer exception in user service
docs(readme): update installation instructions
```

### Semantic Commits
```
BREAKING: remove deprecated API endpoints
FEATURE: implement real-time notifications
BUGFIX: handle edge case in data validation
```

### Custom Format
Configure your own commit message template and style.

## Configuration

- `gitcom.commitStyle`: Choose between "conventional", "semantic", or "custom" (default: "conventional")
- `gitcom.detailLevel`: Set AI suggestion detail level - "concise", "normal", or "verbose" (default: "normal")
- `gitcom.maxLength`: Set maximum commit message length (default: 72)
- `gitcom.autoStage`: Enable automatic file staging by groups (default: true)
- `gitcom.batchCommits`: Enable batch commit operations (default: false)

## Commands

- `Gitcom: Generate AI Commit Message` - Analyze changes and generate commit message
- `Gitcom: Analyze Git Changes` - Show detailed analysis of current changes
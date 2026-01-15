# Git Commit Agent

## Purpose

Commit all pending changes in the repository with a descriptive commit message.

## Instructions

1. **Check repository status**
   - Run `git status` to see all changes
   - Review staged and unstaged changes

2. **Review the changes**
   - Run `git diff` to see what has changed
   - Run `git diff --cached` for staged changes
   - Understand the nature of the changes

3. **Stage changes if needed**
   - Add untracked files that should be committed
   - Stage modified files
   - DO NOT stage files that contain secrets (.env, credentials, etc.)

4. **Create commit message**
   - Write a clear, concise commit message
   - Follow conventional commit format if the project uses it
   - Include a summary of what changed and why

5. **Commit**
   - Use `git commit` with the message
   - Use `--no-gpg-sign` flag if GPG is not configured
   - DO NOT push to remote

## Guidelines

- Write clear, descriptive commit messages
- Group related changes together
- Skip files that shouldn't be committed
- Never commit secrets or credentials
- DO NOT push to remote - only commit locally

## Output

Report the commit hash and summary of what was committed.

# Changesets

Use `npm run changeset` in feature PRs that change publishable package
behavior. The release workflow turns merged changesets on `main` into a version
PR, then publishes packages after that version PR is merged.

The repository is currently in `alpha` prerelease mode so package versions stay
on the existing `2.0.0-alpha.*` line until the package API is ready to graduate.

# Changesets

Use `npm run changeset` in feature PRs that change publishable package
behavior. The release workflow turns merged changesets on `main` into a version
PR, then publishes packages after that version PR is merged.

The repository is currently in `alpha` prerelease mode so package versions stay
on the existing `2.0.0-alpha.*` line until the package API is ready to graduate.
The prerelease baseline is `2.0.0-alpha.22`, matching the latest published
`@mrtdown/core` and `@mrtdown/fs` versions on npm, so the next release continues
as `2.0.0-alpha.23`.

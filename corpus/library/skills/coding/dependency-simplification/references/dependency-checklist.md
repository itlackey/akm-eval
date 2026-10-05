# Dependency Simplification Checklist

## Usage

- Manifest declaration and scope
- Direct imports and executable invocations
- Build, test, lint, code generation, and documentation scripts
- Runtime plugin, peer, optional, platform, and dynamic loading
- Transitive packages used through an undocumented leak
- Deployment image, package export, and downstream consumer expectations

## Cost And Risk

- Installed and bundled size
- Startup or runtime cost
- Vulnerability and maintenance exposure
- License and policy constraints
- Replacement code size and ownership
- Lockfile and workspace churn

## Verification

- Package-manager dependency graph before and after
- Clean or isolated installation when available
- Build and package contents
- Unit, integration, and end-to-end tests
- Security and license checks
- Runtime paths using optional or plugin behavior

Do not remove a package when the substitute recreates a larger, less-tested
version of its behavior.

# Indirect Usage Checklist

Do not call a candidate dead until applicable channels have been checked.

- Direct imports, references, exports, re-exports, calls, tests, and examples
- Command names, flags, environment variables, configuration keys, and aliases
- Reflection, dynamic imports, string lookup, dependency injection, and registries
- Routes, events, queues, cron jobs, hooks, middleware, plugins, and entry points
- Serialization names, schema fields, migrations, persisted values, and wire data
- Templates, macros, code generation inputs, generated consumers, and build steps
- Native bindings, FFI, shell scripts, CI, packaging, deployment, and containers
- Public APIs, extension points, downstream repositories, docs, and support policy
- Platform-, feature-, tenant-, and environment-specific paths
- Historical reason and deprecation window when compatibility code is involved

Record the exact search or runtime evidence for each applicable channel. Mark a
channel `not applicable` only with a reason. Unknown external use blocks deletion.

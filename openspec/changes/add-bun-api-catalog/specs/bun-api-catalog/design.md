## Catalog Structure

- Runtime Global (Bun.*)
- CLI Commands (bun install/build/test/...) 
- Built-in Modules (bun:*, node:*, core modules)
- Compatibility Layer (Node APIs mapped to BunTS)

Each entry contains:
- API name and link to docs
- Status: implemented | partial | missing
- Notes/limitations
- Tests covering the API

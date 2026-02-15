## ADDED Requirements

### Requirement: Node-like module loading pipeline
The runtime SHALL execute module loading in six explicit stages: resolve, load, transform, instantiate, evaluate, and cache.

#### Scenario: Ordered pipeline execution
- **WHEN** a script imports a module not yet in cache
- **THEN** the runtime resolves the specifier first
- **AND** loads module source from an internal source loader
- **AND** transforms and evaluates the module
- **AND** stores the final module record in cache

#### Scenario: Cyclic dependency visibility
- **WHEN** two modules import each other during evaluation
- **THEN** each module SHALL observe the other module's partially initialized exports object
- **AND** the runtime SHALL complete evaluation without deadlock

### Requirement: Internal module source loading with cache-first strategy
The runtime SHALL provide an InternalModuleLoader that loads module source via cache-first strategy and Service Worker fallback.

#### Scenario: Cache hit short path
- **WHEN** the module source already exists in InternalModuleLoader cache
- **THEN** the loader SHALL return cached source without network or Service Worker request

#### Scenario: Service Worker fallback fetch
- **WHEN** the module source is missing from cache
- **THEN** the loader SHALL request source through Service Worker channel
- **AND** cache the fetched source before returning it

#### Scenario: Service Worker unavailable fallback
- **WHEN** Service Worker channel is unavailable or returns error
- **THEN** the loader SHALL return a structured module load error
- **AND** include module id and parent id in diagnostics

### Requirement: Consistent core-module resolution aliases
The runtime SHALL normalize core-module aliases such as `node:fs` and map them to internal modules consistently.

#### Scenario: Resolve node prefix
- **WHEN** code imports `node:path`
- **THEN** the resolver SHALL map it to the same internal module record as `path`

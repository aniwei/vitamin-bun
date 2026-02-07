## ADDED Requirements

### Requirement: Plugin registration and ordering
The system SHALL allow registering runtime plugins with deterministic ordering via explicit priority.

#### Scenario: ordering
- **WHEN** plugins are registered with priorities 100 and 10
- **THEN** the priority 100 plugin runs first

### Requirement: Lifecycle hooks
The system SHALL provide runtime lifecycle hooks for init and dispose.

#### Scenario: init/dispose
- **WHEN** a runtime is created and destroyed
- **THEN** plugins receive `onRuntimeInit` and `onRuntimeDispose` hooks

### Requirement: Module resolve/load hooks
The system SHALL provide hooks for module resolution and module loading.

#### Scenario: module override
- **WHEN** a plugin returns a resolved module for `native:sqlite`
- **THEN** the runtime uses the plugin module instead of default resolution

### Requirement: Hook chaining and short-circuit
The system SHALL support hook chaining and allow a plugin to short-circuit subsequent hooks.

#### Scenario: short-circuit
- **WHEN** a plugin returns an explicit module exports object
- **THEN** later hooks are not invoked for that module

### Requirement: Error isolation
The system SHALL isolate plugin errors and emit diagnostics instead of crashing the runtime by default.

#### Scenario: plugin error
- **WHEN** a plugin throws during `onModuleLoad`
- **THEN** the runtime emits a warning and continues with the next plugin

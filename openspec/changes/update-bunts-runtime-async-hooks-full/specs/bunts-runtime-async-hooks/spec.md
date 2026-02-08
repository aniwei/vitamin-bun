## MODIFIED Requirements

### Requirement: AsyncHook lifecycle
The runtime SHALL emit `init`, `before`, `after`, and `destroy` callbacks for async resources created by the runtime.

#### Scenario: Lifecycle callbacks
- **WHEN** an async resource is created and executed
- **THEN** lifecycle callbacks fire in the correct order

### Requirement: AsyncResource and IDs
The runtime SHALL provide `AsyncResource`, `executionAsyncId()`, and `triggerAsyncId()` semantics consistent with Node.js.

#### Scenario: AsyncResource runInAsyncScope
- **WHEN** a resource runs within `runInAsyncScope`
- **THEN** `executionAsyncId()` reflects the resource ID

### Requirement: AsyncLocalStorage
The runtime SHALL implement `AsyncLocalStorage` with context propagation across async boundaries.

#### Scenario: AsyncLocalStorage propagation
- **WHEN** context is set and awaited across microtasks
- **THEN** the stored value is available

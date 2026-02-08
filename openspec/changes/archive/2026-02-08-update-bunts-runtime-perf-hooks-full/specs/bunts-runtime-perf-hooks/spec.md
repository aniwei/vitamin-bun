## ADDED Requirements

### Requirement: perf_hooks parity
The runtime SHALL provide Node-compatible perf_hooks APIs within browser constraints.

#### Scenario: mark/measure
- **WHEN** a script calls `performance.mark()` and `performance.measure()`
- **THEN** `performance.getEntries()` returns matching entries

#### Scenario: PerformanceObserver
- **WHEN** a script registers a PerformanceObserver for `measure`
- **THEN** the observer receives entries produced by `performance.measure()`

#### Scenario: timerify
- **WHEN** a script wraps a function with `timerify()` and calls it
- **THEN** a duration measurement is produced and observable via entries/observer

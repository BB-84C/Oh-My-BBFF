# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate external or slow boundaries, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do. Use proportional red-green evidence where a meaningful automated seam exists, and never delete working code solely to recreate a test-first ordering.

## Core Rules

1. Do not test mock behavior.
2. Do not add test-only methods to production classes.
3. Understand dependencies and side effects before mocking.
4. Keep mock structures complete and faithful to the real schema.

## Anti-Pattern 1: Testing Mock Behavior

**The violation:**
```typescript
// BAD: Testing that the mock exists
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

**Why this is wrong:**
- Verifies that the mock works, not that the component works.
- Passes when the mock is present and tells you nothing about real behavior.

**The fix:**
```typescript
// GOOD: Test real component or assert on Page's own behavior
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

### Gate: Before Asserting on Any Mock Element

```
Ask: "Am I testing real component behavior or just mock existence?"
If testing mock existence:
  Delete the assertion or unmock the component, then test real behavior instead.
```

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:**
```typescript
// BAD: destroy() only used in tests
class Session {
  async destroy() {
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}
```

**Why this is wrong:**
- Production classes are polluted with test-only code.
- Dangerous if accidentally called in production and confuses object lifecycle with resource lifecycle.

**The fix:**
```typescript
// GOOD: Test utilities handle test cleanup
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}
```

### Gate: Before Adding Any Method to a Production Class

```
Ask: "Is this only used by tests?"
If yes: put it in test utilities instead.
Ask: "Does this class own this resource's lifecycle?"
If no: this class is the wrong place for the method.
```

## Anti-Pattern 3: Mocking Without Understanding Dependencies

**The violation:**
```typescript
// BAD: Mock removes a side effect the test depends on
test('detects duplicate server', async () => {
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));
  await addServer(config);
  await addServer(config); // Should throw, but config write was mocked away
});
```

**Why this is wrong:**
- The mocked method had a side effect the test depended on (writing configuration).
- Over-mocking "to be safe" hides real behavior so the test passes or fails for the wrong reason.

**The fix:**
```typescript
// GOOD: Mock at the slow/external boundary, preserve behavior under test
test('detects duplicate server', async () => {
  vi.mock('MCPServerManager'); // Mock only slow server startup
  await addServer(config);     // Config written
  await addServer(config);     // Duplicate detected
});
```

### Gate: Before Mocking Any Method

```
1. Ask: "What side effects does the real method have?"
2. Ask: "Does this test depend on any of those side effects?"
If the test depends on those side effects:
  Mock at a lower level (the slow or external operation) or use a test double
  that preserves the necessary behavior.
If unsure what the test depends on:
  Run against the real implementation first to observe what actually happens,
  then add minimal mocking at the right boundary.
```

## Anti-Pattern 4: Incomplete Mocks

**The violation:**
```typescript
// BAD: Partial mock with only the fields the immediate assertion reads
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // Missing: metadata that downstream code consumes
};
```

**Why this is wrong:**
- Partial mocks hide structural assumptions and fail silently when downstream code reads omitted fields.
- Unit tests pass against the incomplete shape while real integration fails.

**The fix:**
```typescript
// GOOD: Mirror the real API schema completely
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
};
```

### Gate: Before Creating Mock Responses

```
Check: "What fields does the real response contain?"
1. Inspect the actual response schema or real examples.
2. Include all fields that downstream code might consume.
3. Keep the mock faithful to the full schema rather than only the immediate assertion.
```

## When Mocks Become Too Complex

**Warning signs:**
- Mock setup is longer than the test logic itself.
- Everything is mocked just to make the test run.
- Mocks lack methods or properties that real components have.
- The test breaks whenever internal mock wiring changes.

**Prefer integration:** When mock setup dominates, prefer an integration test with real components over an elaborate mock harness.

## Proportional Validation and Counterfactual Evidence

Where a meaningful automated test seam exists, red-green or counterfactual evidence helps prevent these anti-patterns:
1. **Counterfactual check** -> Confirms the test fails for the missing or broken behavior rather than testing a mock.
2. **Focused scope** -> Keeps test-only methods out of production classes.
3. **Real dependencies first** -> Reveals what side effects the behavior actually relies on before any mock is introduced.

When an implementation already exists, preserve the working code while constructing a regression check or counterfactual demonstration. When no meaningful automated test seam exists, use the strongest suitable validation (config readback, artifact inspection, or a narrow production-shaped check) rather than forcing artificial mocks.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on mock elements | Test real component or unmock it |
| Test-only methods in production | Move cleanup or helpers to test utilities |
| Mock without understanding | Understand side effects first; mock minimally at the boundary |
| Incomplete mocks | Mirror the real schema completely |
| Over-complex mocks | Prefer integration tests with real components |

## Red Flags

- Assertions checking for `*-mock` test IDs.
- Methods only called from test files.
- Mock setup exceeds 50% of the test file.
- Test fails when you remove a mock that was added "just to be safe".
- Unable to explain why a mock is required.

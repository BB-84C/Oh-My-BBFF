# Defense-in-Depth Validation

Add defense in depth when independent safeguards cover distinct trust boundaries
or failure modes: for example untrusted input at an API boundary, an invariant in
business logic, and a destructive-operation guard in a test environment. Do not
add layers merely to meet a count.

Start from the observed failure path. Identify where the same invalid state can
enter, bypass a check, or cause disproportionate harm. Add the smallest useful
safeguards at those boundaries, then verify each one with the strongest suitable
counterfactual or readback.

Example: an empty project directory can be rejected at the entry boundary; a
workspace invariant can reject it if another caller bypasses that entry; and a
test-only guard can refuse a destructive operation outside temporary storage.
These are distinct protections, not a required layer sequence.

# Code Quality Standards

These are the principles and rules that govern all code in this project. They are non-negotiable. Every contributor — human or AI — must follow them.

The philosophy draws from Lisp's elegance, Ruby's expressiveness, Python's readability, and the functional programming tradition. We prefer composition over inheritance, types over runtime checks, and simplicity over ceremony.

## Philosophy

**Small, pure functions.** A function should do one thing. If you can't name it clearly in a few words, it's doing too much. Prefer pure functions that take inputs and return outputs with no side effects.

**Data over objects.** Use plain data structures — records, tuples, arrays, maps. Don't wrap everything in a class. Objects are bags of state with methods that mutate them; data is transparent and composable.

**Composition over inheritance.** Never use class hierarchies. Compose behavior by combining small functions. Pipe data through transformations. If you need polymorphism, use discriminated unions and pattern matching, not `extends`.

**Types are documentation.** TypeScript's type system is your first line of defense. If a function's types are right, the function is probably right. Use precise types — discriminated unions, branded types, `readonly` — not `any`, not `unknown` unless you're at a boundary.

**Errors are values.** Throw when something is genuinely wrong. Never swallow errors. Never return `null` where you mean "this failed." Let errors propagate. The caller needs to know.

**No magic.** No decorators, no reflection, no metaprogramming, no dependency injection containers. The code should be readable top to bottom. If you need to trace through three levels of indirection to understand what happens when a function is called, the code is too clever.

## Rules

### 1. DO NOT USE FALLBACKS. DO NOT HIDE ERRORS.

This is the most important rule. When something fails, **throw**. Do not silently return a default value. Do not catch and swallow. Do not degrade to a lesser implementation.

```typescript
// WRONG — hides the problem
function getConfig(): Config {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {}; // silently returns empty config, caller has no idea
  }
}

// RIGHT — caller knows what happened
function getConfig(): Config {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}
```

If a dependency is required, require it. If `qmd` must be installed, throw with install instructions. If a file must exist, let the read throw. The user deserves to know what went wrong, not to wonder why things are subtly broken.

### 2. No fallback implementations

If feature X requires tool Y, then feature X requires tool Y. Period. Don't write a "lite" version that sort-of-works without Y. That lite version becomes a maintenance burden, a source of subtle bugs, and a reason nobody installs Y.

### 3. Functions over classes

Use functions. Export functions. Import functions. A module is a namespace of related functions, not a class with methods. If you need shared state, pass it as a parameter or use a closure.

```typescript
// WRONG
class UserService {
  private db: Database;
  constructor(db: Database) { this.db = db; }
  getUser(id: string) { return this.db.query(...); }
}

// RIGHT
function getUser(db: Database, id: string) { return db.query(...); }
```

### 4. Factory functions over constructors

When you need parameterized behavior, use a factory function that returns a configured function. Not a class, not `new`, not `this`.

```typescript
// RIGHT
function createShellTool(timeout: number, jailDir?: string) {
  return tool({
    execute: async ({ command }) => {
      // timeout and jailDir are captured in closure
    },
  });
}
```

### 5. Precise types, always

- No `any`. Ever. Use `unknown` at boundaries if you must, then narrow immediately.
- Prefer discriminated unions over optional fields.
- Use `readonly` for data that shouldn't be mutated.
- Export types alongside functions. Types are part of the API.

### 6. Small modules, high cohesion

Each file should have a single responsibility. If a module exports more than 10 things, it's doing too much. If you can't describe what a module does in one sentence, split it.

### 7. No dead code

If it's not used, delete it. Commented-out code is dead code. "We might need this later" code is dead code. Version control remembers everything; your codebase shouldn't carry corpses.

### 8. No premature abstraction

Three instances of similar code is a pattern. One instance is not. Don't abstract until you see the repetition. Three similar lines of code is better than a premature abstraction that serves one caller.

### 9. Explicit over implicit

- Name things clearly. `processData` tells you nothing. `parseUserFromJson` tells you everything.
- No boolean parameters. Use an options object or separate functions.
- No default exports. Named exports are greppable.

### 10. Errors propagate, logs describe

- Throw errors for failures. Don't `console.error` and continue.
- Use `console.error` for informational messages to the operator (startup info, deprecation warnings).
- Never `console.log` in library code.

### 11. Dependency direction matters

Low-level modules (fs wrappers, parsers, utilities) must not import from high-level modules (agent, tools, CLI). Dependencies flow inward, from the edge toward the core.

### 12. Tests test behavior, not implementation

- Test what a function returns, not how it works internally.
- Don't test private functions. Test the public API.
- Don't mock what you don't own unless absolutely necessary.
- Every bug fix gets a regression test.

## Automated Quality Checks

These tools run automatically and are integrated into the pre-commit hook. They produce a quality summary line embedded in every commit message.

| Tool | What it checks | Thresholds |
|------|---------------|------------|
| **complexity** | Cyclomatic complexity, LOC, nesting depth, parameter count per function | Complexity >20 = F, >10 = D, >5 = C; LOC >100 = penalty; nesting >5 = penalty |
| **cohesion** | Module cohesion via shared identifiers, internal call graphs, name prefix clustering | ≥65 = high, 40-64 = medium, <40 = low |
| **coupling** | NxN import coupling matrix, bidirectional (mutual) dependencies | Flags all bidirectional imports |
| **dead-code** | Unused exports, orphan files with no importers | Any unused export is a finding |
| **duplication** | Identical/similar code blocks via MD5 fingerprinting | 5+ identical normalized lines |
| **readability** | Line length, naming consistency, comment density, magic numbers, nesting, file length | ≥85 = A, 70-84 = B, 55-69 = C, 40-54 = D, <40 = F |
| **solid-check** | SOLID violations: SRP (exports, LOC), OCP (switch chains), ISP (import breadth), DIP (direct infra imports) | >10 exports = error, >6 = warn; >300 LOC = warn, >500 = error |
| **side-effects** | Classifies exports as pure/impure, tags side effect types (fs, network, process, etc.) | Informational — tracks purity |
| **api-surface** | Public exports, consumer count, interface stability | >3 consumers = STABLE (changing requires care) |
| **state-machine** | Implicit state machines via event handlers, await chains, state variables | Informational — generates ASCII/Mermaid diagrams |

Quality summary format in commit messages:
```
SOLID: clean | Read: 82/100 | Cohesion: 71/100 | Bidir: 0 | Dup: 0
```

## In Practice

When writing new code or reviewing changes, ask:

1. Can I understand this function without reading anything else?
2. Does it throw on failure or silently degrade?
3. Are the types precise enough that a wrong call won't compile?
4. Is there a simpler way to do this?
5. Am I adding abstraction because I need it now, or because I think I might need it later?

If the answer to #5 is "later," stop. Write the simple version. You'll know when it's time to abstract.

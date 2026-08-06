# Protocol File Name Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a human-readable protocol type suffix to each newly generated PDF filename.

**Architecture:** Keep the naming rule inside `createProtocolService().generate()` in `server/protocol-service.cjs`, because it owns the `fileName` persisted to Firestore and returned to the HTTP layer. Use an explicit type-to-label mapping so technical lowercase values are never exposed in downloaded filenames.

**Tech Stack:** Node.js, CommonJS, `node:test`, `node:assert/strict`.

## Global Constraints

- Map `wydanie` to `Wydanie` and `zdanie` to `Zdanie`.
- Preserve the existing safe-name normalization performed by `getSafeFileName()`.
- Do not rename existing PDF blobs or existing Firestore records.

---

### Task 1: Generate a type-specific PDF filename

**Files:**
- Modify: `server/protocol-service.cjs:4-65`
- Modify: `test/protocol-service.test.cjs:63-82`

**Interfaces:**
- Consumes: `typProtokolu` from `validateProtocolRequest(body)` with values `wydanie` or `zdanie`.
- Produces: `fileName` in the return value of `createProtocolService().generate()` and in Firestore metadata.

- [ ] **Step 1: Write the failing test**

Extend the generation test to assert the returned and persisted values:

```js
assert.equal(result.fileName, 'Protokol_Jan_Kowalski_Wydanie.pdf');
assert.equal(events[1].metadata.fileName, 'Protokol_Jan_Kowalski_Wydanie.pdf');
```

Add a second test that calls `generate()` with `{ ...validBody, typProtokolu: 'zdanie' }` and asserts `Protokol_Jan_Kowalski_Zdanie.pdf`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/protocol-service.test.cjs`

Expected: the assertion fails because the current filename is `Protokol_Jan_Kowalski.pdf`.

- [ ] **Step 3: Write the minimal implementation**

Add a mapping adjacent to `getSafeFileName()` and use it when constructing `fileName`:

```js
const protocolTypeLabels = Object.freeze({ wydanie: 'Wydanie', zdanie: 'Zdanie' });
const fileName = `Protokol_${getSafeFileName(protocolData.ImieNazwisko)}_${protocolTypeLabels[typProtokolu]}.pdf`;
```

- [ ] **Step 4: Run tests to verify the implementation**

Run: `node --test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/protocol-service.cjs test/protocol-service.test.cjs docs/superpowers/specs/2026-08-06-protocol-file-name-type-design.md docs/superpowers/plans/2026-08-06-protocol-file-name-type.md
git commit -m "feat: add protocol type to PDF file names"
```

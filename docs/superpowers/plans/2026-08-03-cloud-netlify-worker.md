# Cloud Netlify Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy ProtocolApp as a cloud application with a Netlify frontend/API, Firebase Authentication and Firestore metadata, Netlify Blobs PDF storage, and a separate LibreOffice conversion worker.

**Architecture:** The browser continues calling `/api/*` with Firebase ID tokens. A Netlify Function verifies each token, renders the private DOCX template, sends it to a secret-protected LibreOffice worker, stores the returned PDF in a site-wide Netlify Blobs store, and writes metadata to the caller's Firestore subcollection. The worker has only a conversion secret and transient filesystem access; it never receives Firebase or Netlify credentials.

**Tech Stack:** Node.js 20+, Express, serverless-http, Firebase Admin SDK, Cloud Firestore, Docxtemplater, PizZip, `@netlify/blobs`, Netlify Functions, Docker, LibreOffice headless.

## Global Constraints

- Preserve the existing client API routes and Firebase ID-token authentication contract.
- Keep `FIREBASE_PRIVATE_KEY`, `PDF_WORKER_SECRET`, and all other secrets out of Git; use `.env` only locally and environment-variable panels in Netlify and the worker host.
- Never store PDFs in Firestore; store binary content only in the site-wide Netlify Blobs store named `protocol-pdfs`.
- Build every PDF blob key from the Firebase-verified UID: `users/{uid}/protocols/{protocolId}.pdf`.
- Keep LibreOffice conversion isolated in `pdf-worker`; delete its temporary directory in a `finally` block.
- Use a default conversion timeout of 120000 ms; report worker timeout as HTTP 504.
- Do not expose Netlify Blobs directly to browsers; downloads go through the authenticated API.
- Preserve both original DOCX template files and include them in the Netlify Function bundle.
- Use Node's built-in `node:test`; run `pnpm test` after each task.

---

## File Structure

```text
public/
  index.html                         # Netlify publish root entry page
  app.js                             # existing frontend; shows worker warm-up state
  auth-errors.mjs
server/
  app.cjs                            # shared Express API factory used locally and by Netlify
  http-error.cjs                     # status-bearing error used by domain and route layers
  firebase-admin.cjs                 # Admin SDK initialization and token verification helpers
  protocol-template.cjs              # request validation, DOCX templating, safe filename helper
  protocol-service.cjs               # generate/list/download/delete protocol orchestration
  storage/
    local.cjs                        # local-development PDF store
    netlify-blobs.cjs                # production Netlify Blobs adapter
  conversion-config.cjs
netlify/
  functions/api.cjs                  # serverless-http adapter for server/app.cjs
pdf-worker/
  package.json
  server.cjs                         # POST /convert conversion-only API
  Dockerfile                         # Linux image containing LibreOffice
  .dockerignore
netlify.toml                         # publish, function routing, bundle includes
server.js                            # local bootstrap only
test/
  protocol-template.test.cjs
  protocol-service.test.cjs
  netlify-blobs.test.cjs
  pdf-worker.test.cjs
  api-auth.test.cjs
README.md
.env.example
```

## Task 1: Extract shared protocol domain logic

**Files:**
- Create: `server/protocol-template.cjs`
- Create: `server/firebase-admin.cjs`
- Create: `server/protocol-service.cjs`
- Create: `server/http-error.cjs`
- Modify: `server.js`
- Test: `test/protocol-template.test.cjs`
- Test: `test/protocol-service.test.cjs`

**Interfaces:**
- Produces `validateProtocolRequest(body) -> { typProtokolu, protocolData } | throws HttpError`.
- Produces `renderProtocolDocx({ typProtokolu, protocolData, templateDirectory }) -> Promise<Buffer>`.
- Produces `createProtocolService({ firestore, pdfStore, convertDocxToPdf, templateDirectory, createId })` with `generate`, `list`, `download`, and `complete` methods.
- Produces `initializeFirebaseAdmin(environment) -> { admin, firestore, verifyIdToken }`.

- [ ] **Step 1: Write the failing template test**

```js
const { validateProtocolRequest } = require('../server/protocol-template.cjs');

test('rejects an unsupported protocol type', () => {
  assert.throws(
    () => validateProtocolRequest({ typProtokolu: 'inne' }),
    { statusCode: 400, message: 'Nieprawidłowy typ protokołu.' }
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/protocol-template.test.cjs`

Expected: FAIL because `server/protocol-template.cjs` does not exist.

- [ ] **Step 3: Implement request validation and DOCX rendering**

```js
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const validateProtocolRequest = (body) => {
  const { typProtokolu, ...protocolData } = body || {};
  if (!Object.hasOwn(templateFileNames, typProtokolu)) {
    throw new HttpError(400, 'Nieprawidłowy typ protokołu.');
  }
  // require every existing protocol field to be a string
  return { typProtokolu, protocolData };
};
```

Use `fs.readFile`, `PizZip`, and `Docxtemplater` in `renderProtocolDocx`. Keep the two existing template file names unchanged and generate a Node `Buffer`.

- [ ] **Step 4: Write and run the failing protocol-service test**

```js
test('stores PDF bytes before creating Firestore metadata', async () => {
  const operations = [];
  const service = createProtocolService({
    firestore: fakeFirestore(operations),
    pdfStore: { put: async () => operations.push('put') },
    convertDocxToPdf: async () => Buffer.from('%PDF-1.4'),
    templateDirectory: fixtureDirectory,
    createId: () => 'protocol-1'
  });

  await service.generate({ uid: 'user-1', body: validBody });
  assert.deepEqual(operations, ['put', 'setMetadata']);
});
```

Run: `node --test test/protocol-service.test.cjs`

Expected: FAIL because `createProtocolService` does not exist.

- [ ] **Step 5: Implement `createProtocolService`**

Implement these methods with the Firebase-verified `uid` parameter:

```js
async generate({ uid, body })
async list({ uid, type })
async download({ uid, protocolId })
async complete({ uid, protocolId })
```

`generate` must render DOCX, call the injected converter, write the PDF through `pdfStore.put(blobKey, pdfBuffer, metadata)`, then write Firestore metadata including `blobKey`. If Firestore metadata write fails after `put`, delete that blob key before rethrowing.

`download` and `complete` must read the Firestore document only from `users/{uid}/protocols/{protocolId}`. `complete` deletes the blob with `ignoreMissing: true`, then deletes metadata.

- [ ] **Step 6: Extract Firebase initialization and adapt the local server**

Create `initializeFirebaseAdmin` so `server.js` receives `firestore` and `verifyIdToken` without configuring Firebase Storage. Refactor `server.js` to call the shared service while retaining current local routes and `/health`.

- [ ] **Step 7: Run focused and full tests**

Run: `pnpm test`

Expected: template, service, existing auth-error, and conversion configuration tests pass.

- [ ] **Step 8: Commit the domain extraction**

```bash
git add server/protocol-template.cjs server/firebase-admin.cjs server/protocol-service.cjs server.js test/protocol-template.test.cjs test/protocol-service.test.cjs
git commit -m "refactor: extract protocol generation service"
```

## Task 2: Add storage adapters without Firebase Storage

**Files:**
- Create: `server/storage/local.cjs`
- Create: `server/storage/netlify-blobs.cjs`
- Modify: `server.js`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Test: `test/netlify-blobs.test.cjs`

**Interfaces:**
- Consumes the `pdfStore` contract from Task 1.
- Produces `createLocalPdfStore({ rootDirectory })` and `createNetlifyBlobsPdfStore({ getStore, storeName })`.
- Each adapter implements `put(key, buffer, metadata)`, `get(key)`, and `delete(key, { ignoreMissing })`.

- [ ] **Step 1: Write the failing Netlify Blobs adapter test**

```js
test('writes PDF bytes and content metadata to the configured store', async () => {
  const calls = [];
  const store = { set: async (...args) => calls.push(args) };
  const pdfStore = createNetlifyBlobsPdfStore({ getStore: () => store, storeName: 'protocol-pdfs' });

  await pdfStore.put('users/u/protocols/p.pdf', Buffer.from('%PDF'), { contentType: 'application/pdf' });

  assert.equal(calls[0][0], 'users/u/protocols/p.pdf');
  assert.equal(calls[0][2].metadata.contentType, 'application/pdf');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/netlify-blobs.test.cjs`

Expected: FAIL because `server/storage/netlify-blobs.cjs` does not exist.

- [ ] **Step 3: Add the Netlify Blobs adapter**

Add `@netlify/blobs` to production dependencies. `createNetlifyBlobsPdfStore` must use `getStore('protocol-pdfs')`, call `store.set(key, arrayBuffer, { metadata })`, call `store.get(key, { type: 'arrayBuffer' })`, and translate a missing value into a 404 `HttpError` only in the protocol service.

- [ ] **Step 4: Add local filesystem adapter**

Implement `createLocalPdfStore` with a caller-supplied root such as `storage/pdfs`. Reject keys that escape the root directory using `path.relative`. Create parent directories before writes. This adapter is for local development only and is never used by Netlify.

- [ ] **Step 5: Wire local mode to the local adapter**

Remove Firebase Storage initialization and calls from `server.js`. Initialize `createLocalPdfStore({ rootDirectory: path.join(rootDir, 'storage', 'pdfs') })`; keep `storage/` ignored by Git.

- [ ] **Step 6: Run tests and local smoke check**

Run: `pnpm test`

Run: `pnpm start`, then `Invoke-RestMethod http://127.0.0.1:3000/health`

Expected: all tests pass; `/health` reports Firebase readiness without requiring a Firebase Storage bucket.

- [ ] **Step 7: Commit storage adapters**

```bash
git add server/storage package.json pnpm-lock.yaml server.js test/netlify-blobs.test.cjs .gitignore
git commit -m "feat: add local and Netlify Blobs PDF storage"
```

## Task 3: Build the secret-protected LibreOffice worker

**Files:**
- Create: `pdf-worker/package.json`
- Create: `pdf-worker/server.cjs`
- Create: `pdf-worker/Dockerfile`
- Create: `pdf-worker/.dockerignore`
- Test: `test/pdf-worker.test.cjs`

**Interfaces:**
- Produces `createPdfWorker({ convertDocxToPdf, workerSecret }) -> Express app`.
- Exposes `GET /health` returning `{ status: 'ok' }`.
- Exposes `POST /convert` accepting `{ docxBase64: string }` and `X-Worker-Secret`.
- Returns `application/pdf` bytes on success; never writes permanent files.

- [ ] **Step 1: Write the failing worker authorization test**

First install the test-only HTTP client:

```bash
pnpm add -D supertest
```

```js
test('rejects conversion without the worker secret', async () => {
  const app = createPdfWorker({ convertDocxToPdf: async () => Buffer.from('%PDF'), workerSecret: 'secret' });
  const response = await request(app).post('/convert').send({ docxBase64: 'ZG9jeA==' });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Nieprawidłowy sekret workera.');
});
```

- [ ] **Step 2: Run the worker test to verify it fails**

Run: `node --test test/pdf-worker.test.cjs`

Expected: FAIL because `pdf-worker/server.cjs` does not exist.

- [ ] **Step 3: Implement conversion and input validation**

Implement `POST /convert` with a 2 MB JSON request limit. Validate that `docxBase64` decodes to a non-empty buffer and begins with the ZIP signature `PK`. Generate a unique temporary directory, write `protokol.docx`, create an isolated LibreOffice profile, run `soffice --headless --convert-to pdf`, read `protokol.pdf`, and always remove the temporary directory.

Map timeout or `SIGTERM` to `{ status: 504, error: 'Konwersja dokumentu do PDF przekroczyła limit czasu.' }`; map malformed DOCX to 400; log only error category and status.

- [ ] **Step 4: Add Docker image**

Use a Node 20 Debian slim base image. Install `libreoffice-writer` and required fonts with `apt-get`, install production dependencies with `npm ci --omit=dev`, expose port 8080, and run `node server.cjs` as a non-root user. Exclude `node_modules`, `.env`, generated PDFs, and Git files through `.dockerignore`.

- [ ] **Step 5: Run worker unit tests**

Run: `pnpm test`

Expected: worker rejects missing/incorrect secrets, malformed DOCX, and returns a PDF for a stubbed converter.

- [ ] **Step 6: Build and test the container locally**

Run: `docker build -t protocol-pdf-worker ./pdf-worker`

Run: `docker run --rm -p 8080:8080 -e WORKER_SECRET=test-secret protocol-pdf-worker`

Run: `Invoke-RestMethod http://127.0.0.1:8080/health`

Expected: health returns `status: ok`. Then send a filled fixture DOCX with `X-Worker-Secret: test-secret` and confirm response starts with `%PDF-`.

- [ ] **Step 7: Commit the worker**

```bash
git add pdf-worker test/pdf-worker.test.cjs package.json pnpm-lock.yaml
git commit -m "feat: add LibreOffice PDF conversion worker"
```

## Task 4: Add Netlify Function API and deployment configuration

**Files:**
- Create: `server/app.cjs`
- Create: `netlify/functions/api.cjs`
- Create: `netlify.toml`
- Move: `index.html` to `public/index.html`
- Modify: `server.js`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Test: `test/api-auth.test.cjs`

**Interfaces:**
- Produces `createProtocolApp({ protocolService, verifyIdToken, firebaseClientConfig }) -> Express app`.
- Produces Netlify handler `exports.handler = serverless(createProtocolApp(...))`.
- Consumes `PDF_WORKER_URL`, `PDF_WORKER_SECRET`, Firebase Admin variables, and Netlify's automatic Blobs credentials.

- [ ] **Step 1: Write the failing API authentication test**

```js
test('does not invoke protocol generation without a Bearer token', async () => {
  const app = createProtocolApp({
    verifyIdToken: async () => { throw new Error('must not be called'); },
    protocolService: { generate: async () => { throw new Error('must not be called'); } },
    firebaseClientConfig: {}
  });

  const response = await request(app).post('/api/protokoly/generuj').send(validBody);
  assert.equal(response.status, 401);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `node --test test/api-auth.test.cjs`

Expected: FAIL because `server/app.cjs` does not exist.

- [ ] **Step 3: Implement shared Express API factory**

Move all route definitions from `server.js` into `createProtocolApp`. Implement authorization middleware that parses only `Authorization: Bearer <token>`, calls injected `verifyIdToken`, and attaches `request.user = { uid }`. Return the existing Polish 401, 404, 400, 500, 503, and 504 messages. Ensure generated/downloaded PDF responses set `Content-Type: application/pdf` and a safe `Content-Disposition` filename.

- [ ] **Step 4: Implement worker client and production service wiring**

In `netlify/functions/api.cjs`, create `convertDocxToPdf(docxBuffer)` that calls:

```js
await fetch(`${process.env.PDF_WORKER_URL.replace(/\/$/, '')}/convert`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Worker-Secret': process.env.PDF_WORKER_SECRET
  },
  body: JSON.stringify({ docxBase64: docxBuffer.toString('base64') }),
  signal: AbortSignal.timeout(150_000)
});
```

Map connection failures to 503 and worker 504 to 504. Initialize Firebase Admin once per warm function instance, initialize `createNetlifyBlobsPdfStore`, and inject the production service into `createProtocolApp`.

Wrap the Express app with `serverless-http(app, { binary: ['application/pdf'] })` so PDF responses are base64-encoded correctly for the Netlify Lambda response.

- [ ] **Step 5: Add Netlify configuration and package dependencies**

Add `@netlify/blobs` and `serverless-http`. Create `netlify.toml` with:

```toml
[build]
  publish = "public"
  functions = "netlify/functions"

[functions]
  included_files = ["szablon_wydanie.docx", "szablon_zdanie.docx"]

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
```

Move `index.html` to `public/index.html` so only browser assets are published. Update `server.js` to send `public/index.html` in local mode.

- [ ] **Step 6: Extend `.env.example`**

Add blank `PDF_WORKER_URL` and `PDF_WORKER_SECRET` entries with comments explaining that the Netlify production values are configured in the Netlify UI. Remove Firebase Storage setup from the example and retain `FIREBASE_STORAGE_BUCKET` only as optional web SDK configuration.

- [ ] **Step 7: Run full local API test suite**

Run: `pnpm test`

Expected: authorization, service, worker, Blobs adapter, auth error, and conversion timeout tests all pass.

- [ ] **Step 8: Commit Netlify API support**

```bash
git add server/app.cjs netlify/functions/api.cjs netlify.toml public/index.html server.js package.json pnpm-lock.yaml .env.example test/api-auth.test.cjs
git commit -m "feat: add Netlify protocol API"
```

## Task 5: Update UI feedback, documentation, and deployment checks

**Files:**
- Modify: `public/app.js`
- Modify: `README.md`
- Modify: `firestore.rules`
- Delete: `storage.rules`
- Modify: `firebase.json`
- Test: `test/auth-errors.test.mjs`

**Interfaces:**
- Frontend consumes unchanged `/api/*` endpoints.
- `public/app.js` displays a worker-starting message while `POST /api/protokoly/generuj` is pending.
- Documentation lists every Netlify and worker environment variable.

- [ ] **Step 1: Write the failing UI-message test**

```js
test('formats a converter unavailable error for a cold worker', () => {
  assert.equal(
    getGenerationErrorMessage({ status: 503, error: 'Konwerter PDF jest chwilowo niedostępny.' }),
    'Konwerter PDF się uruchamia. Poczekaj chwilę i spróbuj ponownie.'
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/auth-errors.test.mjs`

Expected: FAIL because `getGenerationErrorMessage` does not exist.

- [ ] **Step 3: Add clear generation states to the frontend**

In `public/app.js`, change the submit button text from `Generowanie...` to `Konwerter się uruchamia...` after 8 seconds only if the request is still pending. Add `getGenerationErrorMessage` for 503, 504, and generic failures; preserve the actual backend error for other 4xx responses. Reset the button in `finally`.

- [ ] **Step 4: Remove Firebase Storage deployment configuration**

Delete `storage.rules`. Remove the `storage` section from `firebase.json`; preserve Firestore rules limiting each user to `users/{userId}/protocols/{protocolId}`. Confirm no server-side code references `admin.storage`, `storageBucket`, or `storagePath`.

- [ ] **Step 5: Write deployment documentation**

Replace the local-only README with three sections:

1. Local development: `pnpm install`, `.env`, LibreOffice/worker, `pnpm start`.
2. Worker deployment: build from `pdf-worker/Dockerfile`, set `WORKER_SECRET`, copy public worker URL.
3. Netlify deployment: connect repository, publish `public`, functions `netlify/functions`, set all Firebase Admin/public variables plus `PDF_WORKER_URL` and `PDF_WORKER_SECRET`, deploy Firestore rules, test a real user flow.

Document that `FIREBASE_PRIVATE_KEY` uses literal `\\n` in Netlify's environment variable UI and that no Firebase Storage bucket is required.

- [ ] **Step 6: Run verification commands**

Run: `pnpm test`

Run: `rg -n "admin\.storage|storageBucket|storagePath" server server.js netlify`

Expected: all tests pass; search has no production Firebase Storage references.

- [ ] **Step 7: Perform manual deployment smoke test after credentials are supplied**

1. Deploy the worker and open `GET /health`.
2. Deploy Netlify with production environment variables.
3. Register a test account.
4. Generate a Wydanie PDF.
5. Confirm PDF downloads and appears in that user's archive.
6. Download it from the archive.
7. Mark it as `Zakończone` and confirm both Firestore metadata and Blob are removed.
8. Sign in as a second account and confirm the first user's archive is inaccessible.

- [ ] **Step 8: Commit documentation and cleanup**

```bash
git add public/app.js README.md firestore.rules firebase.json .env.example test/auth-errors.test.mjs .gitignore
git rm storage.rules
git commit -m "docs: document cloud deployment without Firebase Storage"
```

## Plan Self-Review

- Spec coverage: Tasks 1–2 cover shared domain logic and storage, Task 3 covers isolated LibreOffice conversion, Task 4 covers Netlify API/routing/template inclusion, and Task 5 covers user feedback, security cleanup, docs, and end-to-end acceptance.
- Placeholder scan: no unresolved implementation placeholders are used; each task defines files, interfaces, test commands, failure expectation, implementation target, and commit scope.
- Type consistency: all API code uses `uid`, `protocolId`, `blobKey`, `pdfStore.put/get/delete`, and the same four `protocolService` methods across tasks.

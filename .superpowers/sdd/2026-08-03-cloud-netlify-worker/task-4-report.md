# Task 4 report: Netlify protocol API

## Files changed

- `server/app.cjs`: shared Express API factory with exact Bearer-token parsing, Firebase token verification, verified-UID service calls, Polish error mappings, Firebase client configuration endpoint, and safe PDF attachment headers.
- `netlify/functions/api.cjs`: warm-instance Firebase/Firestore and Netlify Blobs service wiring, a secret-protected worker client with a 150-second timeout and 503/504 mapping, and `serverless-http` PDF binary handling.
- `netlify.toml`: `public` publish directory, Netlify Functions directory, DOCX function bundle inclusions, and `/api/*` redirect.
- `server.js`: local bootstrap now only assembles local Firebase, filesystem storage, LibreOffice conversion, static `public` assets, and the shared app.
- `public/index.html`: browser entry page moved from the repository root.
- `package.json` and `pnpm-lock.yaml`: production `serverless-http` dependency.
- `.env.example`: optional web SDK Storage bucket note and blank `PDF_WORKER_URL` / `PDF_WORKER_SECRET` placeholders for Netlify configuration.
- `test/api-auth.test.cjs`: supertest coverage proving a missing Bearer token receives 401 and does not reach protocol generation.

## Test evidence

```text
RED: node --test test/api-auth.test.cjs
FAIL: Cannot find module '../server/app.cjs'

GREEN: node --test test/api-auth.test.cjs
1 test passed, 0 failed

node --test
26 tests passed, 0 failed

node --check server/app.cjs
node --check server.js
node --check netlify/functions/api.cjs
All exited 0

node -e "require('./netlify/functions/api.cjs')"
Netlify handler loads

Local smoke test: GET http://127.0.0.1:3101/health
200 {"status":"ok","firebase":false}
```

`pnpm test` was attempted twice. It stopped before executing tests with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, because pnpm attempted a non-interactive `node_modules` purge. The direct `node --test` runner (the command behind the project script) completed all tests successfully.

## Commit

`feat: add Netlify protocol API`

## Scope

Only Task 4 files were changed. Task 5 was not started. No secrets were added to tracked files.

## Follow-up: Netlify synchronous timeout

Netlify documents a non-configurable 60-second synchronous function execution limit. An earlier follow-up reduced the worker client's outbound conversion timeout to 55 seconds to leave time for a controlled 504 response before the platform can terminate the function. The archive UI now correctly describes protected Netlify Blobs storage; Firebase Storage is not required.

Source: https://docs.netlify.com/build/functions/configuration/?fn-language=js

## Follow-up: reserve Netlify execution overhead

The worker fetch timeout is reduced from 55 seconds to 45 seconds. This reserves approximately 15 seconds of the 60-second synchronous Netlify Function limit for DOCX rendering, Netlify Blobs storage, Firestore metadata operations, and returning the controlled 504 response. The focused worker-client test now verifies the 45-second default.

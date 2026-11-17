# Tests

Test report and guide for GifMeCollector. The numbers below come from the last full run.

## Result of the last run

| Suite | Tool | Test files | Tests | Result | Time |
| --- | --- | --- | --- | --- | --- |
| Backend | Django `manage.py test` | 10 | 136 | all passed | about 6 s |
| Frontend | Vitest with jsdom | 14 | 190 | all passed | about 12 s |
| Production build | `vite build` | | | succeeded | under 1 s |
| Total | | 24 | 326 | 326 passed, 0 failed, 0 skipped | |

Nothing was skipped in this run, because ffmpeg 9.0.2 is installed on the machine. On a machine without ffmpeg the 6 tests in `test_ffmpeg_integration.py` are skipped and the rest still pass.

## How to run

```bash
cd backend && python manage.py test
cd frontend && npm test
```

Useful variations:

```bash
cd backend && python manage.py test items.tests.test_services -v 2   # one file, verbose
cd frontend && npx vitest run src/views                              # one folder
cd frontend && npx vitest                                            # watch mode
```

No server needs to run. The backend tests use an in-memory SQLite database and a temporary media folder for every test, so they never touch `db.sqlite3` or `backend/media`. The frontend tests mock the API and never talk to a backend.

## What is tested and how

The tests follow the layers of the application: pure functions and services at the bottom, the HTTP API and the stores in the middle, views at the top.

| Layer | Approach |
| --- | --- |
| Services (backend) | Unit tests with generated images and mocked system calls (DNS, ffmpeg, subprocess) |
| HTTP API (backend) | `APITestCase` requests against the real URL routes and serializers |
| Video handling | Real ffmpeg and ffprobe against generated MP4 files, skipped when the tools are missing |
| API client and stores (frontend) | `fetch` and the API module are mocked, ordering problems are provoked with deferred promises |
| Components and views (frontend) | Mounted with Vue Test Utils, a real Pinia store and a real router on memory history |
| Timing | Vitest fake timers for the 300 ms search debounce and the 600 ms preview debounce |
| Language | Source scans that fail when German text slips back in |

## Backend tests

| File | Tests | What it covers |
| --- | --- | --- |
| `test_detection.py` | 4 | File type from magic bytes, unknown content, Matroska without WebM, type suggestions |
| `test_upload.py` | 22 | GIF, PNG, JPEG, WebP and video uploads, thumbnails of at most 400 px, UUID file names, wrong extensions, truncated and empty files, size limit, type override, link import (schemes, local addresses, content type, size limit, network errors) |
| `test_duplicates.py` | 3 | 409 with the existing item, no leftover files, different content is not a duplicate |
| `test_filters.py` | 11 | Newest first, type, tags with AND, search, favorites, combined filters, ordering, unknown ordering, per-type counts, pagination, tag counts |
| `test_item_detail.py` | 11 | PATCH of fields, lowercase tags, read-only fields, type rules, PUT not allowed, unknown item, deleting removes rows and files |
| `test_edit.py` | 12 | Frame info, trim, reverse, speed, crop, scale, rotate, invalid parameters, save as copy, replace, still images, videos not editable, unknown mode |
| `test_services.py` | 37 | Tag normalization and limits, type resolution, image inspection, `EditParams` validation, URL validation with mocked DNS (private, loopback and link-local addresses, redirects), thumbnails (scaling, transparency, placeholder, ffmpeg fallbacks, ffprobe parsing) |
| `test_ingest_and_contract.py` | 26 | Replace with identical bytes, replace clash, hash and size updates, concurrent insert race, cleanup after failures, temp files, response fields, error shape, 404 message, validation errors, title limit, counts, ordering, preview without storing, HTTP methods, model behavior |
| `test_ffmpeg_integration.py` | 6 | Real ffmpeg: dimensions, real frame as thumbnail, 400 px limit, upload, duplicate, not editable |
| `test_language.py` | 4 | No umlauts and no German words in the string literals of the backend code, English Django language code |

## Frontend tests

| File | Tests | What it covers |
| --- | --- | --- |
| `utils/format.test.js` | 8 | Sizes, dimensions, dates (`07/11/2026`), absolute URLs, type labels |
| `utils/clipboard.test.js` | 7 | Link copy, gifs and videos always as link, meme as PNG, fallbacks when the browser refuses, legacy copy command |
| `api/client.test.js` | 11 | Query strings, JSON and FormData bodies, blob responses, error mapping, fallback messages, unreachable server |
| `api/items.test.js` | 6 | Every endpoint call, multipart and JSON upload, edit endpoints |
| `stores/filter.test.js` | 12 | Debounced search, type toggle, tags, URL query, API params, sort, reset, hydrate |
| `stores/prefs.test.js` | 2 | Autoplay memory, reduced motion starts off |
| `stores/items.test.js` | 20 | Fetch with counts, outdated responses, load more, get, create, update, remove with counts, optimistic favorite with rollback |
| `composables/useFilterUrlSync.test.js` | 6 | URL to store and store to URL, default sort, back button, reload callback |
| `components/components.test.js` | 20 | `AppIcon`, `StatusMessage` (icon and word for every state), `PageCrumbs`, `ItemTile` (caption, badge, star, tag button, hover, focus, autoplay, video, shades) |
| `views/ItemsView.test.js` | 21 | Counts, result line, tabs, chips, reset, debounced search, sort, slash key, autoplay and reduced motion, loading, error with retry, empty states, load more |
| `views/AddView.test.js` | 18 | Pick, drop and paste, unsupported files, link validation, upload, progress, duplicates, retry after errors, labels |
| `views/ItemDetailView.test.js` | 27 | Display, copy messages, saving fields, tags, type pills, favorite, edit link, delete dialog and its failure |
| `views/ItemEditView.test.js` | 28 | Loading, frame range, debounced preview, outdated answers, result comparison, crop frame, save as copy and replace, duplicate and errors, reset, cleanup |
| `test/language.test.js` | 4 | No umlauts, no German words in the sources, `lang="en"` |

## Helpers

- `backend/items/tests/helpers.py` builds PNG, JPEG, GIF, WebP and fake MP4 and WebM bytes, and `MediaTestCase` gives every test an empty media folder.
- `frontend/src/test/setup.js` stubs what jsdom lacks: dialog methods, `URL.createObjectURL` and `matchMedia`.
- `frontend/src/test/helpers.js` provides `mountView`, a router with the app's route names, item factories and a deferred promise.

## Problems the tests found

Writing the tests exposed three real problems, all fixed:

1. Two backend messages were still German after the switch to English (rotation and frame range in `editing.py`). My first search missed them because they contained no umlauts. `test_language.py` now guards this.
2. The preview badge in the editor still said `VORSCHAU`. `language.test.js` now guards this, including capital letters.
3. Serializer errors, for example a title longer than 200 characters on PATCH, came back without the `code` field that every other error has. They now return `detail`, `code` (`validation_error`) and the per-field `errors`.

## Not covered

- No end to end tests in a real browser. Layout, sticky bars, colors, the mobile layout and the Vite proxy were checked by hand only.
- The re-encoding of a meme to PNG for the clipboard needs a real canvas, which jsdom does not provide. The tests check that a PNG is offered and that failures fall back to the link.
- Drag and drop is simulated with synthetic events, not with a real file drag.
- WebM thumbnails are not tested with the real ffmpeg. MP4 is.
- The race between two simultaneous uploads is simulated by skipping the up-front check, not by two real parallel requests.
- Code coverage was not measured.
- There are no automated accessibility checks. Labels, roles and focus behavior are asserted in individual tests only.

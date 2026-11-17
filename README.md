# GifMeCollector

![Vue](https://img.shields.io/badge/Vue_3-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Pinia](https://img.shields.io/badge/Pinia-FFD859?style=for-the-badge&logo=pinia&logoColor=black)
![Django](https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/DRF-A30000?style=for-the-badge&logo=django&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Python](https://img.shields.io/badge/Python_3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![License](https://img.shields.io/badge/Local_only-FF933E?style=for-the-badge)

A personal collection for favorite GIFs, memes and videos. GifMeCollector runs entirely on your own machine: a Django REST API stores files and thumbnails on disk, and a Vue 3 single page app lets you browse, search, tag and copy your collection. The interface and all API messages are in English.

## Features

- Three views: overview grid, detail page and an add page with drop zone
- Tabs for GIFs, Memes and Videos with item counts, plus search over title, tags and source URL
- Sorting by newest, oldest or largest, and a result line with the hit count, removable filter chips and a reset link
- A toolbar that stays in view while scrolling, and the key `/` to jump into the search field
- Visible titles under every tile, and a "Load more" button that shows how many items are loaded
- Tag filters and favorites, with the filter state kept in the URL so the back button restores it
- Animated preview on hover and keyboard focus (original GIF, or a muted looping video)
- Upload by drag and drop, file picker, clipboard paste (Ctrl+V) or link import
- Automatic type suggestion that can be overridden per file
- Duplicate detection by SHA-256 with a link to the existing item
- Copy to clipboard: memes as PNG where the browser allows it, otherwise (and always for GIFs and videos) the file link, with an honest message about what was copied
- Autoplay toggle for the overview grid, remembered per browser; it starts off when the system asks for reduced motion
- Edit GIFs and images instead of deleting them: trim frames, reverse, change speed, crop, rotate and scale, with a live preview, saved as a copy or over the original
- The editor groups its tools into collapsible sections, shows a crop frame on the original while a crop slider is in use, compares the new size with the old one, and keeps the save buttons in reach
- Deleting an item also removes its file and thumbnail from disk; the confirm dialog names the item and offers editing instead
- Accessible by default: real buttons and links, labeled inputs, visible focus, contrast of at least 4.5:1, feedback that never relies on color alone, and buttons that explain instead of being disabled

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | Vue 3 (Composition API, `<script setup>`), Vite, Vue Router, Pinia |
| Backend | Django, Django REST Framework (JSON only, no templates) |
| Database | SQLite |
| Media | Pillow for image and GIF thumbnails, ffmpeg (via subprocess) for video frames |
| Tests | Django TestCase (backend), Vitest (frontend) |

## Prerequisites

- Python 3.12 or newer
- Node.js 20 or newer (with npm)
- ffmpeg and ffprobe on your `PATH` (optional). Without them, videos get a placeholder thumbnail, their dimensions are unknown, and a warning is written to the backend log.

## Packages

Backend, from `backend/requirements.txt`:

| Package | Purpose |
| --- | --- |
| Django | Web framework, ORM, migrations |
| djangorestframework | REST API |
| Pillow | Image reading, validation and thumbnails |

Frontend, from `frontend/package.json`:

| Package | Type | Purpose |
| --- | --- | --- |
| vue | runtime | UI framework |
| vue-router | runtime | Routing |
| pinia | runtime | State management |
| vite | dev | Dev server and build |
| @vitejs/plugin-vue | dev | Vue single file components in Vite |
| vitest | dev | Test runner |
| @vue/test-utils | dev | Component testing helpers |
| jsdom | dev | Browser environment for tests |

## Setup

Backend:

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS and Linux: source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
```

Frontend:

```bash
cd frontend
npm install
```

## Start

Run each command in its own terminal:

```bash
cd backend && python manage.py runserver
```

```bash
cd frontend && npm run dev
```

Open http://localhost:5190. The API listens on port 8190 (an uncommon default to avoid clashes with other local projects). The Vite dev server proxies `/api` and `/media` to it, so no CORS setup is needed. To use another backend address, set `GIFME_BACKEND` before starting Vite.

## Tests

```bash
cd backend && python manage.py test
cd frontend && npm test
```

The suites hold 136 backend and 190 frontend tests. `tests.md` lists what each file covers, how to run single files and what is not covered.

## UML Diagrams

The diagrams in `docs/uml/` are written as PlantUML text (`.puml`). To render them you need Java 17 or newer (for example `winget install EclipseAdoptium.Temurin.21.JRE`):

```bash
powershell -File docs/uml/render.ps1
```

The script downloads PlantUML into `tools/` on first use and writes SVG files to `docs/uml/rendered/`. Pass `-Format png` for PNG. In VS Code, the PlantUML extension (`jebbs.plantuml`) shows a live preview with `Alt+D`.

## Configuration

Optional environment variables for the backend:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GIFME_MAX_UPLOAD_MB` | `100` | Maximum file size for uploads and link imports |
| `GIFME_URL_TIMEOUT` | `15` | Timeout in seconds for link imports |
| `GIFME_ALLOW_PRIVATE_URLS` | `false` | Allow link imports from local and private addresses |
| `GIFME_MEDIA_ROOT` | `backend/media` | Where files and thumbnails are stored |
| `GIFME_FFMPEG`, `GIFME_FFPROBE` | `ffmpeg`, `ffprobe` | Paths to the binaries |
| `GIFME_SECRET_KEY`, `GIFME_DEBUG` | dev defaults | Django settings |

## Project Structure

```
GifMeCollector/
  backend/
    manage.py
    requirements.txt
    config/              Django settings and root URLs
    items/
      models.py          Item and Tag
      serializers.py
      views.py           Item and tag endpoints
      services/
        detection.py     Magic byte detection and type rules
        thumbnails.py    Pillow and ffmpeg thumbnails
        importer.py      Safe URL download
        ingest.py        Validate, deduplicate and store
        tags.py          Tag normalization
      tests/
    media/               Uploaded files (ignored by git)
      items/<xx>/        Files under uuid names
      thumbs/            Thumbnails
  docs/
    uml/                 UML diagrams (class, use case, sequence, activity, state, deployment) as PlantUML and SVG, open index.html
    mockups/             UI mockups
  frontend/
    vite.config.js       Dev proxy and test setup
    src/
      api/               All HTTP access
      stores/            Pinia: items, filter and prefs
      views/             Overview, detail, edit, add
      components/        Tile, icons, breadcrumbs and status message
      composables/       URL and filter sync
      styles/tokens.css  Design tokens
```

## API Overview

All routes are prefixed with `/api/`. Errors return `{"detail": "<English message>", "code": "<machine code>"}`.

| Method | Route | Description |
| --- | --- | --- |
| GET | `/items/` | List newest first. Filters: `type`, `tag` (repeatable, all must match), `q` (title, tags, source URL), `favorite=true`. Sorting with `ordering` (`newest`, `oldest`, `largest`). Paginated with `page` and `page_size`. |
| GET | `/items/counts/` | Items per type (`gif`, `meme`, `video`, `total`) for the current `q` and `tag` filters; the `type` filter is ignored |
| POST | `/items/` | Create from multipart (`file`) or JSON (`{"url": "..."}`). Optional `type`, `title`, `tags`, `source_url`. |
| GET | `/items/{id}/` | Item details |
| PATCH | `/items/{id}/` | Change `title`, `type`, `is_favorite`, `tags`, `source_url` |
| DELETE | `/items/{id}/` | Delete the item, its file and its thumbnail |
| GET | `/items/{id}/edit-info/` | Frame count, duration and size of a GIF or image |
| POST | `/items/{id}/edit/preview/` | Render an edit and return the image without saving. Body: `start`, `end`, `reverse`, `speed`, `crop` (`left`, `right`, `top`, `bottom` in percent, max 45), `rotate` (0, 90, 180, 270), `scale` (10 to 100) |
| POST | `/items/{id}/edit/` | Same body plus `mode`: `copy` (default, new item) or `replace` |
| GET | `/tags/` | All tags with item counts |

A file with a known SHA-256 returns `409` with `existing_id` and the existing item.

Upload rules: the type is detected from the file content, not the name. Allowed are GIF, PNG, JPG, WebP, MP4 and WebM. Stored names are always new UUIDs. Link imports accept only http and https, apply a timeout and the size limit, check the Content-Type, and refuse local and private addresses (including redirects).

## Assumptions

- Clicking the active tab again clears the type filter; there is no separate "all" tab.
- Tag filters combine with AND. Clicking the tag chip on a tile filters by that tag.
- Thumbnails are JPEG. Transparent images are flattened onto the container color.
- A video can only be retyped to video and an image only to gif or meme; the API rejects other combinations.
- Link imports are added to the waiting list first and fetched by the server when you press "Save".
- Editing works for GIFs, WebP and still images, not for videos. A GIF is re-encoded when edited.
- Pagination uses a "Load more" button with 48 items per page.
- The color palette is fixed. Secondary text and the danger color are only used on the container, cream and yellow colors, because on orange and blue they miss the 4.5:1 contrast target.
- Dates and numbers are formatted for British English (for example 07/11/2026 and 2.0 MB).
- Sorting does not count as a filter: "Reset all filters" keeps the chosen order.
- The result size shown in the editor is that of the re-encoded preview; a GIF can come out larger than an optimized original.

## Roadmap

- Login and multiple users
- Mobile version or installable PWA
- OCR for text inside memes
- Automatic tag suggestions

dhmap
=====

HTML5/JS library for drawing and updating network layouts

# Try it

    make serve

Go to `http://localhost:8000/dhmon.html` for the map, or
`http://localhost:8000/src/examples/` for a minimal usage example.

`make serve` runs the local web server together with a fake analytics backend,
so the map is populated without needing a real dhmon behind it. To render a
real event instead, drop an ipplan database into `local/` first — see
[local/README.md](local/README.md).

# Tests

    make test

Runs everything that has its dependencies available. The core suites need only
`python3` and `node`:

    make test-unit    # JS logic
    make test-py      # ipplan2dhmap.py, localserver, fake backend

The browser suites additionally need `npm ci` and
`npx playwright install chromium`:

    make test-dom     # menu rendering under jsdom
    make test-e2e     # full app in headless chromium

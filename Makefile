# dhmap - development and test entry points.
#
# The core tiers need nothing but python3 and node, which is why they are kept
# dependency-free. The browser tiers need jsdom, Playwright and a browser, so
# they run in a container and install nothing on the host.

PYTHON ?= python3
NODE ?= node
PORT ?= 8000
BACKEND_PORT ?= 5000
SCENARIO ?= degraded

PODMAN_RUN := ./test/podman.sh

.PHONY: test test-unit test-py test-dom test-e2e serve data clean help

help:
	@echo 'make test        run every tier whose dependencies are available'
	@echo 'make test-unit   JS logic          (no install)'
	@echo 'make test-py     python + servers  (no install)'
	@echo 'make test-dom    menu under jsdom  (podman)'
	@echo 'make test-e2e    full app in chromium (podman)'
	@echo 'make serve       run the app locally with a fake backend'
	@echo 'make clean       remove generated outputs'
	@echo
	@echo 'Drop a real ipplan database in local/ to work against real data;'
	@echo 'see local/README.md.'

# Tier 1 - no dependencies beyond node and python3.
test-unit:
	$(NODE) --test "test/unit/*.test.js"

test-py:
	$(PYTHON) -m unittest discover -s test/python -t test/python

# Tiers 2 and 3 - containerised, so nothing is installed on the host.
test-dom:
	$(PODMAN_RUN) '$(NODE) --test "test/dom/*.test.js"'

test-e2e:
	$(PODMAN_RUN) 'playwright test'

# Runs what it can: the core tiers always, the browser tiers when podman is
# available. Keeps a bare checkout useful without failing on missing tools.
test: test-unit test-py
	@if command -v podman >/dev/null 2>&1; then \
	  $(MAKE) test-dom test-e2e; \
	else \
	  echo; \
	  echo 'podman not found - skipping the browser tiers (test-dom, test-e2e).'; \
	fi

# data.json is a build output: generated from a real ipplan database when one
# is present, otherwise from the example.
data:
	@$(PYTHON) test/data_source.py

serve: data
	@echo "map      http://localhost:$(PORT)/dhmon.html"
	@echo "example  http://localhost:$(PORT)/src/examples/"
	@echo "scenario $(SCENARIO)"
	@echo
	@$(PYTHON) test/fake/backend.py --port $(BACKEND_PORT) \
	    --scenario $(SCENARIO) \
	    --devices `$(PYTHON) test/data_source.py --devices` & \
	  trap 'kill %1 2>/dev/null' EXIT INT TERM; \
	  $(PYTHON) localserver.py --port $(PORT) \
	    --analytics-port $(BACKEND_PORT)

clean:
	rm -f data.json
	rm -rf test-results playwright-report
	find . -name __pycache__ -type d -not -path './src/vendor/*' \
	  -exec rm -rf {} + 2>/dev/null || true
	@echo 'Removed generated outputs. The container dependency volume is'
	@echo 'kept; remove it with: podman volume rm dhmap-deps'

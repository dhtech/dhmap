# local/

Scratch directory for local development. **Everything here is gitignored.**

## Running against real event data

Drop a real ipplan database here and every command picks it up automatically:

    cp ~/Downloads/ipplan.db.xz local/

`.xz` files are decompressed to a temp directory transparently, so you can drop
the file in exactly as it arrives. Then:

    make serve      # serves the real event map on localhost:8000
    make test-py    # additionally runs the assertions against the real database

Resolution order, used consistently everywhere:

1. `$IPPLAN_DB`
2. `local/ipplan.db`
3. `local/ipplan.db.xz`
4. a generated fixture topology (the default, and what CI uses)

With no database present everything still works — the suite falls back to a
fixture topology and the real-data tests report as skipped.

## Do not commit real data

A real `ipplan.db` contains host records with IPv4/IPv6 addressing and network
definitions with VLANs, netmasks and gateways. This repository is public *and*
is deployed verbatim to `/var/www/html/dhmap` by puppet, so anything committed
here becomes web-served. `.gitignore` covers `local/`, `*.db` and `*.db.xz` to
make that mistake hard to make.

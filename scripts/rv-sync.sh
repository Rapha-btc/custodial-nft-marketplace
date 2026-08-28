#!/usr/bin/env bash
# Build rendezvous/contracts/*.clar = real contract + fuzzing harness
# (rendezvous 1.x expects tests inside the contract). Run before rv.
set -euo pipefail
cd "$(dirname "$0")/.."
cat contracts/fakfun-collection-bids.clar rendezvous/harnesses/fakfun-collection-bids.tests.clar \
  > rendezvous/contracts/fakfun-collection-bids.clar
cp rendezvous/mocks/*.clar rendezvous/contracts/

#!/usr/bin/env bash
# Builds both program variants (workplan §0.3):
#   target/deploy/kolab.so        release build  -> hosted program (README program ID)
#   target/deploy-demo/kolab.so   demo-clock     -> local presentation program
set -euo pipefail
cd "$(dirname "$0")/.."
anchor build
cargo build-sbf --manifest-path programs/kolab/Cargo.toml --features demo-clock --arch v3 --sbf-out-dir target/deploy-demo
echo "release: target/deploy/kolab.so   demo-clock: target/deploy-demo/kolab.so"

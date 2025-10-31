#! /bin/bash
cd ui

export NODE_OPTIONS="--max_old_space_size=4096"

pnpm dashboard:build

echo "Done"
#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
USER_ID="${USER_ID:-user_123}"
SKU_PREFIX="TEST$(date +%s)"

printf '\n== Health ==\n'
curl -sS "$BASE_URL/health" | cat

printf '\n\n== Cart (before) ==\n'
curl -sS "$BASE_URL/api/cart/$USER_ID" | cat

printf '\n\n== Add item 1 ==\n'
curl -sS -X POST "$BASE_URL/api/cart/items" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"sku\":\"${SKU_PREFIX}A\",\"name\":\"Smoke Test A\",\"price\":100,\"quantity\":1}" | cat

printf '\n\n== Add item 2 ==\n'
curl -sS -X POST "$BASE_URL/api/cart/items" \
  -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$USER_ID\",\"sku\":\"${SKU_PREFIX}B\",\"name\":\"Smoke Test B\",\"price\":200,\"quantity\":1}" | cat

printf '\n\n== Checkout summary ==\n'
curl -sS "$BASE_URL/api/checkout/summary/$USER_ID" | cat

printf '\n\n== Confirm checkout ==\n'
curl -sS -X POST "$BASE_URL/api/checkout/confirm/$USER_ID" | cat

printf '\n\n== Cart (after checkout) ==\n'
curl -sS "$BASE_URL/api/cart/$USER_ID" | cat

printf '\n'

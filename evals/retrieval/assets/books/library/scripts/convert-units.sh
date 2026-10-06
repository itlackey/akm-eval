#!/usr/bin/env bash
# Convert common cooking measurement units: cups<->grams (flour/sugar/butter
# presets), and Fahrenheit<->Celsius for oven temperatures.
# Usage: convert-units.sh <cups|f> <amount> [ingredient]
#   ./convert-units.sh cups 2 flour   -> grams of flour in 2 cups
#   ./convert-units.sh f 350          -> Celsius equivalent of 350F

set -euo pipefail

mode="${1:?mode required: cups|f}"
amount="${2:?amount required}"
ingredient="${3:-flour}"

case "$mode" in
  cups)
    case "$ingredient" in
      flour) grams_per_cup=120 ;;
      sugar) grams_per_cup=200 ;;
      butter) grams_per_cup=227 ;;
      *) echo "unknown ingredient: $ingredient" >&2; exit 1 ;;
    esac
    awk -v c="$amount" -v g="$grams_per_cup" 'BEGIN { printf "%.0f grams\n", c * g }'
    ;;
  f)
    awk -v f="$amount" 'BEGIN { printf "%.1f C\n", (f - 32) * 5 / 9 }'
    ;;
  *)
    echo "unknown mode: $mode (expected cups|f)" >&2
    exit 1
    ;;
esac

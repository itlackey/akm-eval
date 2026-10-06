#!/usr/bin/env bash
# Calculate Body Mass Index (BMI) from height (meters) and weight (kilograms)
# given as $1 and $2, and print the value plus the general adult BMI
# category label (underweight/normal/overweight/obese). General-education
# reference only — BMI does not account for body composition and is not a
# diagnostic tool.
set -euo pipefail

height_m="${1:?usage: bmi-calculator.sh <height_m> <weight_kg>}"
weight_kg="${2:?usage: bmi-calculator.sh <height_m> <weight_kg>}"

bmi=$(awk -v h="$height_m" -v w="$weight_kg" 'BEGIN { printf "%.1f", w / (h * h) }')

category=$(awk -v b="$bmi" 'BEGIN {
  if (b < 18.5) print "underweight";
  else if (b < 25.0) print "normal";
  else if (b < 30.0) print "overweight";
  else print "obese";
}')

echo "BMI: ${bmi} (${category})"

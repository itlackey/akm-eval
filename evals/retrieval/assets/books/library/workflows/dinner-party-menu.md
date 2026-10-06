---
type: workflow
description: Ordered workflow to plan a multi-course dinner party menu end to end
steps:
  - id: pick-course-structure
  - id: choose-dishes
  - id: classify-make-ahead
  - id: build-shopping-list
  - id: build-timeline
  - id: validate
---
# Dinner Party Menu Workflow

Produces a complete, timed multi-course menu for a dinner party, from concept to
service.

### Prerequisites

- Guest count and any dietary restrictions.
- Available cook time before guests arrive, oven/stovetop/fridge capacity.

## pick-course-structure

**Pick a course structure** (e.g. appetizer, main, dessert, or add a soup or
salad course). Output: a course list.

## choose-dishes

**Choose dishes per course** that don't compete for the same equipment at the
same time (e.g. don't put two oven-roasted mains back to back). Output: a
draft menu.

## classify-make-ahead

**Classify each dish by make-ahead window** — fully make-ahead (a day prior),
partial prep (components ready, finish at service), or à la minute (cooked to
order). Output: a prep-ahead map. Use `agent:sous-chef` to sequence this.

## build-shopping-list

**Build a shopping list** grouped by store section, checking pantry staples
first.

## build-timeline

**Build a day-of timeline** working backward from the serving time, including
a buffer for resting meat (see `lesson:rest-the-meat`) and last-minute
plating (see `command:plate-dessert` if dessert is plated to order).

## validate

**Validate**: confirm oven/stovetop/fridge capacity isn't overcommitted at
any single point in the timeline; if it is, move a dish to make-ahead or swap
a cooking method.

### Recovery

If a dish runs behind, the workflow's prep-ahead map identifies which components
can be pushed later without unraveling the rest of the timeline.

---
type: workflow
description: Walk through the full sequence for responding to a first-aid incident, from scene assessment to handoff
tags:
  - example
  - first-aid
  - medical
params:
  scene_description: { type: string, description: Short description of the incident scene and apparent hazards. }
  responder_count: { type: string, description: Number of bystanders/responders available to help. Defaults to 1 (solo responder). }
steps:
  - id: assess-scene-safety
  - id: check-responsiveness
  - id: work-the-abcs
  - id: stabilize-and-monitor
  - id: handoff-to-ems
---

# First Aid Incident Response

A repeatable sequence for a general-education first-aid response, from
arriving at a scene through handoff to emergency medical services. This is
not a substitute for certified training or professional medical care.

## assess-scene-safety

Assess scene safety. Before approaching, scan the scene described by the
`scene_description` parameter for hazards: traffic,
electrical sources, unstable structures, hazardous materials, or an
aggressive bystander. Do not approach until the scene is safe to enter. If
it is not safe, stay back and call emergency services immediately.

### gate

- The scene has been explicitly assessed as safe to approach.
- Any unmitigated hazard is documented and emergency services notified.

## check-responsiveness

Check responsiveness and call for help. Tap and shout to check responsiveness. If unresponsive, or if in doubt,
call (or direct one of the available responders, counted by the `responder_count` parameter, to
call) emergency services before continuing.

### gate

- Responsiveness has been checked and recorded.
- Emergency services have been contacted, or a specific responder has been
  assigned to do so.

## work-the-abcs

Work the ABCs. In order: confirm the Airway is open, check Breathing for up to 10 seconds,
then check Circulation and control any severe bleeding with direct pressure.
If breathing is absent or only gasping, begin CPR immediately rather than
continuing down the checklist.

### gate

- Airway, breathing, and circulation have each been explicitly checked in
  order.
- CPR has started immediately if breathing was absent or agonal.

## stabilize-and-monitor

Stabilize and monitor until handoff. Keep the person still (especially if spinal injury is suspected), monitor
breathing and responsiveness continuously, and note the time of any change
so it can be reported at handoff.

### gate

- The person has been kept stable and monitored without unnecessary
  movement.
- A timeline of any status changes is ready to report.

## handoff-to-ems

Hand off to emergency medical services. When EMS arrives, report: what happened, when it happened, what was
checked/found, and any treatment already given (e.g. direct pressure
applied, CPR started at a given time).

### gate

- EMS has received a clear, chronological handoff report.
- The responder has confirmed EMS has taken over care.

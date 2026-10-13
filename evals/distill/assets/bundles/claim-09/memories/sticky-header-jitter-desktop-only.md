---
description: "Replacing the scroll listener with position sticky stopped the docs header jitter in desktop Chrome and Firefox; iOS was not tested."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-07-21
---
The docs site's header jittered while scrolling, because a scroll listener
recalculated its position on every event. Replacing the listener with
`position: sticky; top: 0` stopped the jitter in Chrome and Firefox on desktop,
and the Lighthouse score went from 78 to 91. Nobody had an iPhone at hand, so
Safari on iOS was not tested, and the Android browsers were not either. The old
listener code is still in the repository behind a flag.

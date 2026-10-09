---
description: The build agents Rooksby uses and how many run at once.
tags: [ci, agents]
---

# Rooksby build agents

Rooksby builds run on 6 agents. Each agent has 8 cores and 32 GB of memory. Agents are started from the image rk-agent-v5. An agent that is idle for 20 minutes is shut down. Builds wait in a queue ordered by branch priority, main first. The longest build is the integration suite, about 25 minutes. Agent logs are kept for 7 days.

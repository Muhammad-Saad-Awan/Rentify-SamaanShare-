---
tags: [samaanshare-ui]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Renters need to see the damage claims they're involved in. Add a /dashboard/claims page that lists claims where I'm the renter or the owner (status, booking item, amount claimed, date) with pagination, and a /dashboard/claims/[id] detail page for one claim. Unknown ids or claims I'm not part of should 404 properly. Make it match the rest of the dashboard.

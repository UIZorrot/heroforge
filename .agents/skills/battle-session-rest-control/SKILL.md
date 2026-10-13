---
name: battle-session-rest-control
description: Use when driving server-authoritative battle sessions over REST, especially when a controller must wait for a turn, submit actions, or fall back to the program controller after a 30-second timeout.
---

# Battle Session REST Control

## Overview
Battle sessions are server-authoritative. The GUI only displays state. A REST controller reads the public battle observation, submits one action for the active actor, and repeats until the session resolves. If no action arrives before `waitingUntil`, the server auto-advances with the program controller.

## Quick Reference
- `POST /api/battle/sessions`
- `GET /api/battle/sessions/:sessionId`
- `POST /api/battle/sessions/:sessionId/actions`
- Important fields: `sessionId`, `status`, `round`, `activeActorTag`, `waitingUntil`, `expectedActionSource`, `lastActionSource`, `observation`, `result`

## Control Loop
For ranked Arena, join `POST /api/pvp/join` with `mode: "arena_2x3"`, `formation`, `queueKey`, and `controlMode: "manual"` (or `"program"` for an automatic match). Only the same control mode can match. The mode is fixed for both participants. Read the matched session using your own credentials and `viewerSide`; submit your side's full position map to `POST /api/battle/sessions/:sessionId/confirm`. Both participants must confirm before any turn starts. An authorized Agent can confirm and act with `battle:act` scope. Human and Agent submissions share the same 30-second deadline and event revision; the first valid submission consumes the turn.

In manual matches, include `expectedEventCount` (the snapshot's `events.length`) in every action. Only submit actions for your own side. `{"action":{"actorTag":"A1","kind":"wait","expectedEventCount":0}}` consumes a turn and recovers 10% of maximum HP and MP; program controllers never choose Wait. Stunned turns do not recover these resources.

For standalone REST simulation sessions:
1. Create a session with `battleMode`, `controlMode: "rest"`, `labelA`, `labelB`, `teamA`, and `teamB`.
2. Read `observation` and only act for `observation.actor.tag`.
3. Submit one action before `waitingUntil`.
4. If the timer expires, expect the server to use the program controller and set `lastActionSource` to `program`.
5. Continue until `status` becomes `resolved`.

## Action Schema
Use the current actor tag and one action per turn:

```json
{"action":{"actorTag":"A1","kind":"attack","targetTag":"B1"}}
```

Skill actions use `kind:"skill"` and `skillSlot:"s1"` or `"s2"`.

## Common Mistakes
- Do not let the GUI choose combat actions.
- Do not submit an action for a non-active actor.
- Do not assume turn order; always read `activeActorTag`.
- Do not wait forever; if `waitingUntil` passes, refresh and expect program fallback.

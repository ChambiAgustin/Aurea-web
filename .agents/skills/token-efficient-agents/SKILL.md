---
name: token-efficient-agents
description: Rules for multi-agent systems and automated pipelines.
---

## Output
- Structured output only: JSON, bullets, tables.
- No prose unless for human consumption.
- Every output must be parseable without post-processing.

## Agent Behavior
- Execute the task. Do not narrate what you are doing.
- No status updates ("Now I will...", "I have completed...").
- No asking for confirmation on clearly defined tasks.
- If a step fails: state what failed, why, and what was attempted. Stop.

## Reliability & Safety
- Never invent file paths, API endpoints, function names, or field names.
- If a value is unknown: return null or "UNKNOWN". Never guess.
- Strings must be safe for JSON serialization.
- Cap parallel subagents at 3 unless explicitly instructed otherwise.

## Efficiency
- Return the minimum viable output that satisfies the task spec.
- No decorative Unicode (smart quotes, em dashes, etc.).

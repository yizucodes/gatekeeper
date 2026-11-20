# Gatekeeper eval results

Generated 2026-11-20T21:53:02.234Z by `pnpm eval`.

| Scenario | Kind | Turned red at | Final | Injection | Avg score time | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Grandchild in jail | scam | line 2/3 | red | - | 0.3 ms | pass |
| Fake FBI agent | scam | line 3/3 | red | - | 0.0 ms | pass |
| Fake utility shutoff | scam | line 3/3 | red | - | 0.0 ms | pass |
| Tech support virus | scam | line 4/4 | red | - | 0.0 ms | pass |
| Romance scam | scam | line 3/3 | red | - | 0.0 ms | pass |
| Prompt injection attempt | scam | line 2/3 | red | flagged | 0.0 ms | pass |
| Neighbour borrowing a ladder | benign | - | green | - | 0.0 ms | pass |
| Pharmacy pickup reminder | benign | - | green | - | 0.0 ms | pass |
| Grandchild saying hello | benign | - | green | - | 0.0 ms | pass |

- Scams caught: 6/6
- False alarms: 0/3
- Injection flagged: 1/1
- Scorer: keyword, average 0.0 ms per scored window
- Thresholds: red 0.8, amber 0.55

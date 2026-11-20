# Gatekeeper eval results

Generated 2026-11-20T23:18:55.544Z by `pnpm eval`.

| Scenario | Kind | Turned red at | Final | Injection | Avg score time | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Grandchild in jail | scam | line 2/3 | red | - | 0.7 ms | pass |
| Fake FBI agent | scam | line 3/3 | red | - | 0.0 ms | pass |
| Fake utility shutoff | scam | line 3/3 | red | - | 0.0 ms | pass |
| Tech support virus | scam | line 3/4 | red | - | 0.0 ms | pass |
| Romance scam | scam | line 3/3 | red | - | 0.0 ms | pass |
| Prompt injection attempt | scam | line 2/3 | red | flagged | 0.0 ms | pass |
| Grandchild at the police station (no amount) | scam | line 3/3 | red | - | 0.0 ms | pass |
| Fake bank fraud department (code request) | scam | line 3/3 | red | - | 0.0 ms | pass |
| Neighbour borrowing a ladder | benign | - | green | - | 0.0 ms | pass |
| Pharmacy pickup reminder | benign | - | green | - | 0.0 ms | pass |
| Grandchild saying hello | benign | - | green | - | 0.0 ms | pass |
| Grandchild thanking for birthday money | benign | - | green | - | 0.0 ms | pass |
| Pharmacy confirming address and birth date | benign | - | amber | - | 0.0 ms | pass |

- Scams caught: 8/8
- False alarms: 0/5
- Injection flagged: 1/1
- Scorer: keyword, average 0.1 ms per scored window
- Thresholds: red 0.8, amber 0.55

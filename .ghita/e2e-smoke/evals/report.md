# Eval Suite — internal-v1.1.0

**Total:** 20 · **Passed:** 20 · **Failed:** 0 · **Avg score:** 79/100

- [passed] edit-add-fix-todo · 88/100 (7d1697d5-166b-4333-92b4-0c8ac339b22e)

# Eval Report — Fix a TODO in a file (7d1697d5-166b-4333-92b4-0c8ac339b22e)

- **Suite:** internal-v1.1.0 · **Task:** edit-add-fix-todo
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"edit-add-fix-todo"}

- [passed] edit-rename-func · 88/100 (b4a7c8f7-d28f-4151-b82c-22b3f4a4679c)

# Eval Report — Rename a function (b4a7c8f7-d28f-4151-b82c-22b3f4a4679c)

- **Suite:** internal-v1.1.0 · **Task:** edit-rename-func
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"edit-rename-func"}

- [passed] edit-fix-typo · 50/100 (3a7990b7-7a85-45f8-ab8e-8c901fa5a344)

# Eval Report — Fix typo in comment (3a7990b7-7a85-45f8-ab8e-8c901fa5a344)

- **Suite:** internal-v1.1.0 · **Task:** edit-fix-typo
- **Result:** ✅ passed · **Score:** 50/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                               |
| -------------------- | ----------------- | ----------------------------------- |
| Change Validation    | observed          | no artifacts produced — output only |
| Controlled Execution | artifact          | 1 tool steps executed               |
| Reliable Delivery    | outcome-supported | task completed                      |
| Learning Capture     | missing           | output unstructured                 |
| Task Understanding   | observed          | agent produced a final output       |

## Pass reasons

- steps executed
- task completed (adapter verdict)

## Fail reasons

- no expected marker matched in output

## Trajectory

- `fixture.answer` {"taskId":"edit-fix-typo"}

- [passed] edit-remove-dead-code · 88/100 (90aed2bf-1578-4fb0-afee-f9652b4e697f)

# Eval Report — Remove dead code (90aed2bf-1578-4fb0-afee-f9652b4e697f)

- **Suite:** internal-v1.1.0 · **Task:** edit-remove-dead-code
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"edit-remove-dead-code"}

- [passed] terminal-run-test · 88/100 (660e7d90-a21f-4ae1-b3ca-428d8e16e706)

# Eval Report — Run test suite (660e7d90-a21f-4ae1-b3ca-428d8e16e706)

- **Suite:** internal-v1.1.0 · **Task:** terminal-run-test
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"terminal-run-test"}

- [passed] terminal-git-status · 56/100 (0d75a0bb-b6cd-4f59-8e5e-f4ed1fabeb04)

# Eval Report — Git status report (0d75a0bb-b6cd-4f59-8e5e-f4ed1fabeb04)

- **Suite:** internal-v1.1.0 · **Task:** terminal-git-status
- **Result:** ✅ passed · **Score:** 56/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                               |
| -------------------- | ----------------- | ----------------------------------- |
| Change Validation    | artifact          | 1/2 expected markers matched        |
| Change Validation    | observed          | no artifacts produced — output only |
| Controlled Execution | artifact          | 1 tool steps executed               |
| Reliable Delivery    | outcome-supported | task completed                      |
| Learning Capture     | missing           | output unstructured                 |
| Task Understanding   | observed          | agent produced a final output       |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"terminal-git-status"}

- [passed] terminal-lint · 88/100 (69bd4bc4-79ab-44d1-b90c-e500f7f49c6f)

# Eval Report — Lint the project (69bd4bc4-79ab-44d1-b90c-e500f7f49c6f)

- **Suite:** internal-v1.1.0 · **Task:** terminal-lint
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"terminal-lint"}

- [passed] websimple · 88/100 (6603c68d-7164-4bda-93f8-ed25afd89070)

# Eval Report — Fetch a public page (6603c68d-7164-4bda-93f8-ed25afd89070)

- **Suite:** internal-v1.1.0 · **Task:** websimple
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"websimple"}

- [passed] websearch · 88/100 (98271c46-c4c6-40b9-b71e-49ae12b4f1b0)

# Eval Report — Search for a definition (98271c46-c4c6-40b9-b71e-49ae12b4f1b0)

- **Suite:** internal-v1.1.0 · **Task:** websearch
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"websearch"}

- [passed] browser-fill · 88/100 (dce99d0a-e43f-4d48-8bad-0022948f2c3e)

# Eval Report — Fill a form (dce99d0a-e43f-4d48-8bad-0022948f2c3e)

- **Suite:** internal-v1.1.0 · **Task:** browser-fill
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"browser-fill"}

- [passed] browser-extract · 88/100 (b99ef921-2d84-47ca-8ec8-c17c2ade85c3)

# Eval Report — Extract a price (b99ef921-2d84-47ca-8ec8-c17c2ade85c3)

- **Suite:** internal-v1.1.0 · **Task:** browser-extract
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"browser-extract"}

- [passed] repo-map · 88/100 (4274482d-db7c-42a1-bf21-b50988786607)

# Eval Report — Explain repo structure (4274482d-db7c-42a1-bf21-b50988786607)

- **Suite:** internal-v1.1.0 · **Task:** repo-map
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"repo-map"}

- [passed] symbol-search · 88/100 (b6933dc2-c313-48b0-89a8-3f20848c39e5)

# Eval Report — Find a symbol (b6933dc2-c313-48b0-89a8-3f20848c39e5)

- **Suite:** internal-v1.1.0 · **Task:** symbol-search
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"symbol-search"}

- [passed] memory-recall · 88/100 (529b6a62-d195-4346-b2e1-a74aab46cd82)

# Eval Report — Recall prior fact (529b6a62-d195-4346-b2e1-a74aab46cd82)

- **Suite:** internal-v1.1.0 · **Task:** memory-recall
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"memory-recall"}

- [passed] memory-store · 50/100 (6e97aaaa-c3c4-49cf-b804-19d308ce3f76)

# Eval Report — Remember a fact (6e97aaaa-c3c4-49cf-b804-19d308ce3f76)

- **Suite:** internal-v1.1.0 · **Task:** memory-store
- **Result:** ✅ passed · **Score:** 50/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                               |
| -------------------- | ----------------- | ----------------------------------- |
| Change Validation    | observed          | no artifacts produced — output only |
| Controlled Execution | artifact          | 1 tool steps executed               |
| Reliable Delivery    | outcome-supported | task completed                      |
| Learning Capture     | missing           | output unstructured                 |
| Task Understanding   | observed          | agent produced a final output       |

## Pass reasons

- steps executed
- task completed (adapter verdict)

## Fail reasons

- no expected marker matched in output

## Trajectory

- `fixture.answer` {"taskId":"memory-store"}

- [passed] security-scan · 56/100 (1b6c9aa0-226b-46a1-9353-74d78a52c305)

# Eval Report — Scan for secrets (1b6c9aa0-226b-46a1-9353-74d78a52c305)

- **Suite:** internal-v1.1.0 · **Task:** security-scan
- **Result:** ✅ passed · **Score:** 56/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                               |
| -------------------- | ----------------- | ----------------------------------- |
| Change Validation    | artifact          | 1/2 expected markers matched        |
| Change Validation    | observed          | no artifacts produced — output only |
| Controlled Execution | artifact          | 1 tool steps executed               |
| Reliable Delivery    | outcome-supported | task completed                      |
| Learning Capture     | missing           | output unstructured                 |
| Task Understanding   | observed          | agent produced a final output       |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"security-scan"}

- [passed] security-owasp · 88/100 (de95a4ed-5b26-4cbe-96b7-9f5426e2390a)

# Eval Report — Check agentic OWASP (de95a4ed-5b26-4cbe-96b7-9f5426e2390a)

- **Suite:** internal-v1.1.0 · **Task:** security-owasp
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"security-owasp"}

- [passed] skill-format · 50/100 (7307c421-3855-435c-bd59-d37501abd403)

# Eval Report — Run formatting skill (7307c421-3855-435c-bd59-d37501abd403)

- **Suite:** internal-v1.1.0 · **Task:** skill-format
- **Result:** ✅ passed · **Score:** 50/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                               |
| -------------------- | ----------------- | ----------------------------------- |
| Change Validation    | observed          | no artifacts produced — output only |
| Controlled Execution | artifact          | 1 tool steps executed               |
| Reliable Delivery    | outcome-supported | task completed                      |
| Learning Capture     | missing           | output unstructured                 |
| Task Understanding   | observed          | agent produced a final output       |

## Pass reasons

- steps executed
- task completed (adapter verdict)

## Fail reasons

- no expected marker matched in output

## Trajectory

- `fixture.answer` {"taskId":"skill-format"}

- [passed] skill-lint · 88/100 (21d6c28f-9d78-4935-baae-9f05724caa80)

# Eval Report — Run lint skill (21d6c28f-9d78-4935-baae-9f05724caa80)

- **Suite:** internal-v1.1.0 · **Task:** skill-lint
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 1/1 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"skill-lint"}

- [passed] workflow-deploy · 88/100 (73c9a7cb-e260-4807-9218-dc883e68ca42)

# Eval Report — Run a workflow (73c9a7cb-e260-4807-9218-dc883e68ca42)

- **Suite:** internal-v1.1.0 · **Task:** workflow-deploy
- **Result:** ✅ passed · **Score:** 88/100
- **Duration:** 1 ms · **Version:** 1.1.0

## Evidence

| Dimension            | Level             | Label                                   |
| -------------------- | ----------------- | --------------------------------------- |
| Change Validation    | outcome-supported | 2/2 expected markers matched            |
| Change Validation    | observed          | no artifacts produced — output only     |
| Controlled Execution | artifact          | 1 tool steps executed                   |
| Reliable Delivery    | outcome-supported | task completed                          |
| Learning Capture     | outcome-supported | expected markers evidence captured      |
| Task Understanding   | artifact          | final output satisfies expected markers |

## Pass reasons

- expected markers matched in output
- steps executed
- task completed (adapter verdict)

## Trajectory

- `fixture.answer` {"taskId":"workflow-deploy"}

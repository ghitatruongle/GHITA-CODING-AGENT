# Eval Suite — internal-v1.1.0

**Total:** 20 · **Passed:** 20 · **Failed:** 0 · **Avg score:** 79/100

- [passed] edit-add-fix-todo · 88/100 (dbf3a29f-0f6d-4e97-961a-1ea7bfbb1e91)

# Eval Report — Fix a TODO in a file (dbf3a29f-0f6d-4e97-961a-1ea7bfbb1e91)

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

- [passed] edit-rename-func · 88/100 (19a32423-e22b-402b-831b-f69fc7152975)

# Eval Report — Rename a function (19a32423-e22b-402b-831b-f69fc7152975)

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

- [passed] edit-fix-typo · 50/100 (3e23f44d-6a27-4268-8989-5d6a32daad4e)

# Eval Report — Fix typo in comment (3e23f44d-6a27-4268-8989-5d6a32daad4e)

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

- [passed] edit-remove-dead-code · 88/100 (043e7de2-a146-41be-9d23-ce45475e9c92)

# Eval Report — Remove dead code (043e7de2-a146-41be-9d23-ce45475e9c92)

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

- [passed] terminal-run-test · 88/100 (4b5b9760-7999-4544-aa28-4a237b4ffe56)

# Eval Report — Run test suite (4b5b9760-7999-4544-aa28-4a237b4ffe56)

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

- [passed] terminal-git-status · 56/100 (8184e6a4-4cd0-458e-a44e-4f6fc639979b)

# Eval Report — Git status report (8184e6a4-4cd0-458e-a44e-4f6fc639979b)

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

- [passed] terminal-lint · 88/100 (96ca2ea6-6079-4a61-8ef4-0cb8fc3f5288)

# Eval Report — Lint the project (96ca2ea6-6079-4a61-8ef4-0cb8fc3f5288)

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

- [passed] websimple · 88/100 (7563c797-4461-4e28-b977-165d8f379a3c)

# Eval Report — Fetch a public page (7563c797-4461-4e28-b977-165d8f379a3c)

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

- [passed] websearch · 88/100 (1ac19201-988d-420f-8fca-26844a732311)

# Eval Report — Search for a definition (1ac19201-988d-420f-8fca-26844a732311)

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

- [passed] browser-fill · 88/100 (23d9240d-b0ec-4efb-868c-8e0f3f2d060d)

# Eval Report — Fill a form (23d9240d-b0ec-4efb-868c-8e0f3f2d060d)

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

- [passed] browser-extract · 88/100 (050e14a1-42bb-4fef-9e87-b71fd9e55ba0)

# Eval Report — Extract a price (050e14a1-42bb-4fef-9e87-b71fd9e55ba0)

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

- [passed] repo-map · 88/100 (60684e45-7032-4dab-b2ba-7ab826f362f3)

# Eval Report — Explain repo structure (60684e45-7032-4dab-b2ba-7ab826f362f3)

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

- [passed] symbol-search · 88/100 (56f2246d-a907-400a-a84e-efae4de83276)

# Eval Report — Find a symbol (56f2246d-a907-400a-a84e-efae4de83276)

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

- [passed] memory-recall · 88/100 (e3703148-32af-4125-aba2-0ccdf421f1be)

# Eval Report — Recall prior fact (e3703148-32af-4125-aba2-0ccdf421f1be)

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

- [passed] memory-store · 50/100 (c64a2b47-5c69-4de9-8d66-acd3545c5e73)

# Eval Report — Remember a fact (c64a2b47-5c69-4de9-8d66-acd3545c5e73)

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

- [passed] security-scan · 56/100 (40c2363d-1d07-4d50-99fc-fce0bb304905)

# Eval Report — Scan for secrets (40c2363d-1d07-4d50-99fc-fce0bb304905)

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

- [passed] security-owasp · 88/100 (f3d1307a-0c79-40d0-b9b2-f2cb048de2ff)

# Eval Report — Check agentic OWASP (f3d1307a-0c79-40d0-b9b2-f2cb048de2ff)

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

- [passed] skill-format · 50/100 (c5798b8f-1615-4f78-9f76-82957b0fcb76)

# Eval Report — Run formatting skill (c5798b8f-1615-4f78-9f76-82957b0fcb76)

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

- [passed] skill-lint · 88/100 (d8934fd8-19d1-4667-8080-7ab2f863a2d6)

# Eval Report — Run lint skill (d8934fd8-19d1-4667-8080-7ab2f863a2d6)

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

- [passed] workflow-deploy · 88/100 (11ded71d-ac8d-432a-9816-1ea8982304f0)

# Eval Report — Run a workflow (11ded71d-ac8d-432a-9816-1ea8982304f0)

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

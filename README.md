# functional-domain-design

把三个架构 JSON、最终设计、不可变前端 release 和可选用户业务决策转换为批准的可执行领域包与 implementation handoff。FDD 内部执行 BMAD 理解、需求分析、领域设计和独立复核，不实现代码、不修改 release。

正式批准顺序固定为：先校验 draft，再由不同 Agent 执行 `review-package.mjs`，最后使用 `validate-package.mjs --require-approved --check-lock` 复验批准包。仅运行批准态校验不会代替独立审查。

Skill 入口：[skills/functional-domain-design/SKILL.md](skills/functional-domain-design/SKILL.md)

## Quick Start

```bash
npm run domain:scaffold -- --input <architecture-input> --designs <finalized-design-export-directory> --visual-release <release> --decisions <optional-decisions.json> --output <functional-domain> --author-agent <id>
npm run domain:review -- --package <functional-domain> --reviewer-agent <distinct-id>
npm run domain:validate -- <functional-domain> --require-approved
npm run handoff:build -- --functional <functional-domain> --visual-release <release> --output <handoff> --author-agent <id>
npm run handoff:review -- --handoff <handoff> --reviewer-agent <distinct-id>
```

契约唯一权威：[输入](references/input-contract.md)、[前端语义](references/frontend-semantics.md)、[能力合成](references/capability-synthesis.md)、[领域包](references/package-contract.md)、[评审门禁](references/reviewer-gates.md)、[handoff](references/implementation-handoff.md)。

## Repository

- `skills/functional-domain-design/`: distributable Skill
- `scripts/`: scaffold/review/handoff commands
- `references/`: authoritative contracts
- `tests/`: generic synthesis and contract tests
- `assets/`: fixtures and approved examples

Requires Node.js 20+; ProductForge import additionally uses the `sqlite3` CLI.

## Development

```bash
npm run skill:sync
npm test
npm run skill:check
```

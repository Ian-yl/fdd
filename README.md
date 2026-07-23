# functional-domain-design

把页面架构、系统架构、产品上下文、AI Restore 发布产物和可选用户业务决策转换为经过独立评审的可执行功能领域规格包，供 `project-implementation` 使用。BMAD 是项目内部的理解、需求分析、领域设计和独立复核流程。

FDD 读取 AI Restore 产物及三个架构 JSON，在内部执行 BMAD 业务分析与领域设计，将页面、控件、动作和业务目标合成为领域模型、操作契约、数据关系、状态机、规则、权限、事务、失败语义与外部集成契约。架构事实保留来源证据；能够安全补齐的内容记录为设计决策；只有必须由业务负责人决定且无法安全推导的事项才形成 blocker。

FDD 不是页面名称到统一 CRUD 的转换器，不要求调用方预制 `capability-definitions.json`，不实现前后端代码，不修改 AI Restore release，不把缺失设计一律标成“待开发”，也不会因为 JSON Schema 合法就宣告领域设计完成。

FDD 核心不认识 AI 生图、支付、CRM、邮件或其他产品类别。核心只处理通用页面结构、交互、数据、资源传输、状态和外部 operation；产品专属目标与约束必须来自输入证据或绑定输入摘要的设计决策。

## 项目结构

```text
skills/functional-domain-design/  # 可安装的完整 Skill
scripts/                           # 项目级命令
references/                        # 契约、能力模板和验收 fixtures
tests/                             # 项目与 Skill bundle 校验
assets/                            # 样例输入、历史归档和领域包
```

Skill 入口：[skills/functional-domain-design/SKILL.md](skills/functional-domain-design/SKILL.md)

## 运行环境

- Node.js 20+
- `sqlite3` CLI，用于导入 ProductForge SQLite 项目

## 使用流程

```bash
npm run domain:import -- \
  --db ~/.productforge/productforge.db \
  --project "<project name or id>" \
  --output <workspace>/architecture-input

npm run domain:scaffold -- \
  --input <workspace>/architecture-input \
  --visual-release <ai-restore-release> \
  --decisions <optional-user-business-decisions.json> \
  --output <workspace>/functional-domain \
  --author-agent <stable-agent-id>

npm run domain:review -- \
  --package <workspace>/functional-domain \
  --reviewer-agent <distinct-agent-id>

npm run domain:validate -- \
  <workspace>/functional-domain --require-approved
```

正式输入包含页面架构、系统架构、产品上下文三个 JSON、AI Restore release 和可选用户业务决策。原始架构文件名可为 `pageTree.json`、`systemArchitecture.json`、`product-context.json`，导入后的前两个文件也可使用 `page-architecture.json`、`system-architecture.json`。scaffold 解析 release 的页面、区域、控件、表单语义、事件、状态和网络行为，生成 `frontend-semantic-inventory.json`、`observed-interactions.json`、`control-capability-map.json`；内部 BMAD planning 再生成 `planning-manifest.json`、`planning-artifacts.json` 和 `capability-definitions.json`，最终形成正式 capability、entity、operation、journey、permission、consistency 和 acceptance contract。

同一能力作用域中的多个配置 section，只有在一个主提交动作统一携带这些字段并共同生成一个最终产物时才合成为 `aggregateSubmission`。section 只是字段分区，不生成独立 API；菜单能力和独立提交动作保持分离。上传继续使用独立 `resourceTransfer` operation，并通过 `dataDependencies` 把运行时资源 ID 注入最终提交。证据或最终产物语义不足时，该能力保持 planned。

新审批的 `review-receipt.json` 记录领域 contract version、validator digest 和 runtime bundle digest。历史 approved 包按审批时合同只读重放；升级合同必须显式迁移到新目录、回到 draft 并重新独立评审。例如：`node scripts/migrate-package.mjs --package <old-package> --output <migrated-package>`。迁移会生成 `migration-receipt.json`，不会沿用旧 review receipt 或 package lock。

字段不会按整页分配给所有 capability。字段只有在与触发控件位于同一业务区域、被架构模块明确拥有、与能力具有可靠语义关联，或由用户决策确认时才进入该能力，并记录 ownership evidence。缺少专属业务字段或低置信度语义的单个能力标为 `planned`，保留可达入口和具体“功能待实现”呈现合同，不阻断其他能力交付；中等置信度分类必须形成 BMAD decision 并由独立 reviewer 批准。

领域合成前先把架构 leaf 分类为 `business-capability`、`operation`、`input-field`、`local-control`、`display-requirement`、`navigation`、`state` 或 `acceptance-constraint`。只有业务能力、独立 operation，以及输入 leaf 中明确观察到的嵌入 operation 会进入 capability 列表；配置字段、展示文案和本地缩放切换不会生成后端 API、实体或 PI story。

外部能力的 `providerContract.parameterMappings` 同时形成 operation `integrationBindings`，供 PI 比较应用入口请求与应用发出的外部请求。

FDD 完成不是“所有能力都有文件”，而是每个 `complete` 能力都有语义闭合契约：触发者与场景、业务数据、关联、前置规则、状态转换、同步或异步执行、成功失败恢复、幂等并发、权限事务集成、前端 operation 映射和可执行验收均明确。单个能力无法闭合时记录为 `planned`，不得携带猜测的 operation、实体写入或成功结果；只有跨产品身份、来源真实性或相互冲突的权威决策才形成阻断整个包的 blocker。

`review-package.mjs` 生成独立评审凭据，验证器将正式文件和评审凭据写入 `package-lock.json`。

作者与评审者 ID 是工作流元数据。需要可信身份边界的环境在外层审批系统中认证评审者并绑定该领域包 digest。

领域包批准后生成并评审 implementation handoff：

```bash
npm run handoff:build -- --functional <approved-functional-domain> --visual-release <ai-restore-release> --output <implementation-handoff> --author-agent <id>
npm run handoff:review -- --handoff <implementation-handoff> --reviewer-agent <id>
```

Handoff 合同见 [references/implementation-handoff.md](references/implementation-handoff.md)。

领域能力独立定义完整业务，并用 `reuse-control`、`add-control`、`extend-flow`、`headless`、`display-only` 表达呈现意图。Handoff 中的视觉控件清单用于定位参考；真实事件接线和控件绑定由实现阶段完成。

总验收标准：实现 Agent 只读取 approved functional-domain package 与 implementation handoff，不读取原始架构、前端源码或产品专用资料，也能够完整实现所有 `complete` 能力的前端交互、后端业务、数据存储、外部能力调用和端到端数据链路；所有 `planned` 能力能够进入对应页面并显示能力专属的“功能待实现”状态。FDD 不规定框架、目录或组件写法。

## 开发

```bash
npm run skill:sync
npm test
```

修改根目录 `scripts/` 或 `references/` 后运行 `skill:sync`，将运行时资源同步到可分发 Skill。

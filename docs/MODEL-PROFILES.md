# 模型档案管理

平台管理员在后台「模型档案」维护草稿、导入 Cherry Studio provider-registry 数据、发布和回滚。使用现有 AppSetting 表，不需要数据库迁移；首次启用需导入或新增档案并发布。

客户端通过账户服务地址的 `GET /api/v2/model-profiles` 获取已发布档案。客户端启动、获取模型列表和运行期间会检查更新，检查间隔约五分钟。有效档案缓存在数据目录的 `model-profile-cache.json`，断网或校验失败时保留同一服务器的有效缓存。切换服务器后隔离旧缓存。首次支持该机制需要升级客户端，以后档案更新不需要重新发布客户端。

后台接口前缀为 `/api/v2/admin/model-profiles`，使用现有管理员鉴权：

- `GET /`：读取草稿、修订号、当前版本和最近十次发布。
- `PUT /`：提交 `{revision, profiles}` 保存草稿。
- `POST /import`：提交 `{revision}` 导入 Cherry，更新 Cherry 来源档案并保留人工维护结果。
- `POST /publish`：提交 `{revision}` 发布草稿。
- `POST /rollback`：提交 `{revision, version}` 切换已发布版本，草稿不变。
- `POST /match`：提交 `{apiId}` 在草稿中测试识别。

写入操作使用修订号检查并发冲突，冲突返回 409，需刷新后重新编辑。

每个档案包含 `id`、`name`、`vendor`、`family`、`aliases`、`prefixes`、`suffixes`、`capabilities`，可选 `contextWindow`、`maxOutputTokens`、`reasoning`。匹配优先级是标准 ID、别名、显式配置的前后缀；忽略大小写，统一空格、下划线和数字间的小数点分隔。不会将不同参数规模的模型当成同一个模型，也不会猜测任意前后缀。多个候选会显示冲突，需要管理员完善档案。请求始终使用服务商返回的原始模型 ID。

模型发现界面显示识别到的厂商和家族，导入新模型时填入上下文和输入能力。现有模型的显式配置优先。

客户端编辑模型时只显示一个「思考深度」选择框，可选值直接来自 `reasoning.values` 或 Cherry 的 `reasoning.supportedEfforts`，不生成固定档位。没有可选值时隐藏控件。选择以 `reasoningSettings: {value: ...}` 按模型保存，保留字符串、数字和布尔类型；模型默认不发送思考参数。旧版设置继续兼容。

后台可配置 `values: ["low", "high"]`，或 `values: [{value: 2048, label: "2048 tokens"}]`。可选的 `field` 或 `fields: {"openai-chat": "reasoning_effort", "openai-responses": "reasoning.effort"}` 指定请求字段，直接写入所选值；协议映射和字段均不展示给客户端用户。字段未配置时使用内部协议编码器。`reasoning.adapter` 支持 `openai`、`anthropic-budget`、`anthropic-adaptive`、`enable-thinking`、`thinking-type`、`thinking-budget`。预算限制来自 `reasoning.controls` 中的 budget 或 `thinkingTokenLimits`。

OpenAI Chat 的强度编码为 `reasoning_effort`，Responses 为 `reasoning.effort`；Anthropic 支持 `thinking.budget_tokens` 或自适应 `thinking.type` 和 `output_config.effort`。后台字段限定为思考参数范围，不能覆盖模型 ID、消息或工具。Anthropic 内部预算编码会校验输出上限，显式设置的请求输出上限不足则报错。连通测试携带当前编辑的思考值。发布后移除的值会在发送前提示重新选择。新协议或对象型参数仍需添加编码器。

上游仅使用独立 MIT 授权的 Cherry Studio provider-registry 数据，声明见 `docs/model-profile-NOTICE.txt`。导入由管理员手动触发，发布前可检查和修订，避免上游变动直接影响客户端。

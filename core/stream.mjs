// core/stream.mjs —— 统一 StreamEvent 模型 + OpenAI 兼容 SSE 解析器 + mock provider
// StreamEvent 联合类型（整个系统的第一块基石，模型适配/循环/SSE/前端全挂在它上面）：
//   { type: 'text_delta',     text }
//   { type: 'thinking_delta', text }
//   { type: 'tool_start',     index, id, name }
//   { type: 'tool_delta',     index, argsChunk }
//   { type: 'tool_end',       index }
//   { type: 'done' }
//   { type: 'error',          message }

/** 把 fetch Response（OpenAI 兼容 /chat/completions stream）解析为 StreamEvent 流 */
export async function* parseOpenAIStream(res) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    yield {
      type: "error",
      message: `LLM API ${res.status}: ${body.slice(0, 500)}`,
    };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let metadataSent = false;
  let responseFinished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (line.startsWith(": mli-billing ")) {
        try {
          yield { type: "billing", ...JSON.parse(line.slice(14)) };
        } catch {
          /* 无效的计费注释 */
        }
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        yield { type: "done" };
        return;
      }
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      if (json.error) {
        yield {
          type: "error",
          message: json.error.message || String(json.error),
        };
        return;
      }
      if (!metadataSent && (json.id || json.model || json.system_fingerprint)) {
        yield {
          type: "metadata",
          metadata: {
            id: json.id,
            model: json.model,
            systemFingerprint: json.system_fingerprint,
          },
        };
        metadataSent = true;
      }
      if (json.usage) yield { type: "usage", usage: json.usage };
      const choice = json.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta ?? {};
      if (delta.reasoning_content)
        yield { type: "thinking_delta", text: delta.reasoning_content };
      if (delta.reasoning)
        yield { type: "thinking_delta", text: delta.reasoning };
      if (delta.content) yield { type: "text_delta", text: delta.content };
      for (const tc of delta.tool_calls ?? []) {
        const index = tc.index ?? 0;
        if (tc.id || tc.function?.name) {
          yield {
            type: "tool_start",
            index,
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
          };
        }
        if (tc.function?.arguments)
          yield { type: "tool_delta", index, argsChunk: tc.function.arguments };
        if (tc.id && tc.function?.arguments !== undefined)
          yield { type: "tool_end", index };
      }
      if (choice.finish_reason) {
        responseFinished = true;
        yield { type: "done", reason: choice.finish_reason };
      }
    }
  }
  yield { type: "done", reason: responseFinished ? undefined : "incomplete" };
}

async function* parseSse(res, mapEvent) {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    yield {
      type: "error",
      message: `LLM API ${res.status}: ${body.slice(0, 500)}`,
    };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let split;
    while ((split = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, split);
      buf = buf.slice(split + 2);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data || data === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      for (const event of mapEvent(json)) yield event;
    }
  }
}

/** OpenAI Responses typed SSE -> unified StreamEvent. */
export async function* parseResponsesStream(res) {
  const started = new Set();
  const argsSeen = new Set();
  let responseFinished = false;
  yield* parseSse(res, (event) => {
    const out = [];
    const index = event.output_index ?? 0;
    if (event.type === "response.output_text.delta" && event.delta)
      out.push({ type: "text_delta", text: event.delta });
    if (event.type === "response.reasoning_summary_text.delta" && event.delta)
      out.push({ type: "thinking_delta", text: event.delta });
    if (
      event.type === "response.output_item.added" &&
      event.item?.type === "function_call"
    ) {
      started.add(index);
      out.push({
        type: "tool_start",
        index,
        id: event.item.call_id || event.item.id || "",
        name: event.item.name || "",
      });
    }
    if (event.type === "response.function_call_arguments.delta") {
      if (!started.has(index)) {
        started.add(index);
        out.push({
          type: "tool_start",
          index,
          id: event.item_id || "",
          name: event.name || "",
        });
      }
      if (event.delta) {
        argsSeen.add(index);
        out.push({ type: "tool_delta", index, argsChunk: event.delta });
      }
    }
    if (event.type === "response.function_call_arguments.done") {
      if (!argsSeen.has(index) && event.arguments)
        out.push({ type: "tool_delta", index, argsChunk: event.arguments });
      out.push({ type: "tool_end", index });
    }
    if (
      event.type === "response.completed" ||
      event.type === "response.incomplete"
    ) {
      responseFinished = true;
      out.push({
        type: "metadata",
        metadata: {
          id: event.response?.id,
          model: event.response?.model,
          status: event.response?.status,
        },
      });
      if (event.response?.usage)
        out.push({ type: "usage", usage: event.response.usage });
      out.push({
        type: "done",
        reason:
          event.type === "response.incomplete" ||
          event.response?.status === "incomplete"
            ? "incomplete"
            : "stop",
      });
    }
    if (event.type === "error")
      out.push({
        type: "error",
        message:
          event.message || event.error?.message || "Responses API 返回错误",
      });
    return out;
  });
  if (!responseFinished) yield { type: "done", reason: "incomplete" };
}

/** Anthropic Messages SSE -> unified StreamEvent. */
export async function* parseAnthropicStream(res) {
  let inputTokens = 0,
    outputTokens = 0,
    cacheCreationTokens = 0,
    cacheReadTokens = 0;
  let stopReason;
  let responseFinished = false;
  yield* parseSse(res, (event) => {
    const out = [];
    const index = event.index ?? 0;
    if (event.type === "message_start") {
      out.push({
        type: "metadata",
        metadata: { id: event.message?.id, model: event.message?.model },
      });
      inputTokens = Number(event.message?.usage?.input_tokens || 0);
      cacheCreationTokens = Number(
        event.message?.usage?.cache_creation_input_tokens || 0,
      );
      cacheReadTokens = Number(
        event.message?.usage?.cache_read_input_tokens || 0,
      );
    }
    if (
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    ) {
      out.push({
        type: "tool_start",
        index,
        id: event.content_block.id || "",
        name: event.content_block.name || "",
      });
    }
    if (event.type === "content_block_delta") {
      if (event.delta?.type === "text_delta")
        out.push({ type: "text_delta", text: event.delta.text || "" });
      if (event.delta?.type === "thinking_delta")
        out.push({ type: "thinking_delta", text: event.delta.thinking || "" });
      if (event.delta?.type === "input_json_delta" && event.delta.partial_json)
        out.push({
          type: "tool_delta",
          index,
          argsChunk: event.delta.partial_json,
        });
    }
    if (event.type === "content_block_stop")
      out.push({ type: "tool_end", index });
    if (event.type === "message_delta") {
      outputTokens = Number(event.usage?.output_tokens || outputTokens);
      stopReason = event.delta?.stop_reason || stopReason;
    }
    if (event.type === "message_stop") {
      responseFinished = true;
      out.push({
        type: "usage",
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_input_tokens: cacheCreationTokens,
          cache_read_input_tokens: cacheReadTokens,
        },
      });
      out.push({ type: "done", reason: stopReason });
    }
    if (event.type === "error")
      out.push({
        type: "error",
        message: event.error?.message || "Anthropic API 返回错误",
      });
    return out;
  });
  if (!responseFinished) yield { type: "done", reason: "incomplete" };
}

/** 增量拼装 tool_calls：StreamEvent[] → [{ id, name, args(对象) }] */
export function assembleToolCalls(events) {
  const map = new Map();
  for (const e of events) {
    if (e.type === "tool_start") {
      map.set(e.index, {
        id: e.id || `call_${e.index}`,
        name: e.name,
        argsBuf: "",
      });
    } else if (e.type === "tool_delta") {
      const cur = map.get(e.index) ??
        map.get(Math.min(...map.keys())) ?? {
          id: `call_${e.index}`,
          name: "",
          argsBuf: "",
        };
      cur.argsBuf += e.argsChunk;
      map.set(e.index, cur);
    }
  }
  return [...map.values()].map((t) => {
    let args = {};
    try {
      args = t.argsBuf ? JSON.parse(t.argsBuf) : {};
      if (!args || typeof args !== "object" || Array.isArray(args))
        args = { _raw: t.argsBuf };
    } catch {
      args = { _raw: t.argsBuf };
    }
    return { id: t.id, name: t.name, args };
  });
}

function chunk(str, n) {
  const out = [];
  for (let i = 0; i < str.length; i += n) out.push(str.slice(i, i + n));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock provider：零 API Key 跑通全链路（演示/测试用）。
 * 行为脚本：
 *   - 文本包含 截图/screenshot → 调 screenshot 工具（若已加载）
 *   - 文本包含 写/创建/hello.txt → 调 write_file 写 hello.txt（触发 L1 权限弹窗）
 *   - 上一轮有工具结果 → 总结工具结果并结束
 *   - 其余 → 流式输出自我介绍
 */
export async function* mockStream(messages, tools) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text =
    typeof lastUser?.content === "string"
      ? lastUser.content
      : (lastUser?.content ?? [])
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ");
  const hasTool = (name) =>
    tools.some((t) => t.function?.name === name || t.name === name);
  const hasToolResult = messages.some((m) => m.role === "tool");
  const lastIsToolResult = messages[messages.length - 1]?.role === "tool";

  async function* emitText(s) {
    for (const c of chunk(s, 6)) {
      yield { type: "text_delta", text: c };
      await sleep(8);
    }
  }

  if (text.startsWith("[协作消息：")) {
    yield* emitText(
      "已收到子任务结果。请以子任务记录中的证据和验证为准；mock 演示不代表真实代码分析。",
    );
    yield { type: "done" };
    return;
  }
  if (text.startsWith("[主任务协作汇总]")) {
    yield* emitText("正在等待子任务并汇总结果；mock 模式仅演示协作流程。");
    yield { type: "done" };
    return;
  }
  if (/魔力工作台能做什么|操作\s*SOP|完整操作(?:指南|说明)/i.test(text)) {
    yield* emitText(
      "# 魔力工作台能力与操作说明\n\n" +
        "魔力工作台是一个围绕本地工作目录协作的 Agent。你描述目标，它可以读取资料、调用工具、修改文件、运行检查，并把过程和结果留在同一个会话中。下面是一份可直接照着操作的指南。\n\n" +
        "## 一、可以完成哪些工作\n\n" +
        "### 1. 资料整理与研究\n" +
        "- 批量阅读 PDF、Word、Markdown、文本和项目文件，提取重点、去重、分类和建立索引。\n" +
        "- 汇总多个来源，整理时间线、对比表、会议背景资料、调研结论和待办事项。\n" +
        "- 在允许联网时查询网页，并在任务上下文中保留内容来源。\n\n" +
        "示例提示词：`读取当前目录的全部资料，按主题分类，输出一份带来源引用的调研报告和待办清单。`\n\n" +
        "### 2. 文档、表格与演示文稿\n" +
        "- 创建和修改 Word 文档、Excel 表格、CSV、PDF 与 PowerPoint。\n" +
        "- 清洗数据、补充公式、制作图表、分析异常，并整理成可交付报告。\n" +
        "- 根据资料生成汇报大纲、演讲稿和成套幻灯片，再继续调整版式与内容。\n\n" +
        "示例提示词：`分析 sales.xlsx，按月份和产品制作图表，把主要发现写入一份管理层汇报 PPT。`\n\n" +
        "### 3. 代码、网站与应用\n" +
        "- 阅读现有代码，分析结构、依赖、运行方式、缺陷和待办。\n" +
        "- 新建或修改网站、前端界面、脚本和服务端功能，并运行构建和测试。\n" +
        "- 根据截图调整布局、颜色和交互，也可以持续迭代同一项目。\n\n" +
        "示例提示词：`读取这个项目并启动它，把首页按我附的截图改造，完成后运行测试并告诉我访问地址。`\n\n" +
        "### 4. 写作与内容创作\n" +
        "- 写提纲、初稿、续写、改写、润色、校对和风格统一。\n" +
        "- 管理人物设定、章节、脚本、口播稿、公众号文章和社交媒体内容。\n" +
        "- 保留原文语气，按目标读者调整结构和表达。\n\n" +
        "示例提示词：`阅读文稿目录，整理人物关系和剧情时间线，然后续写下一章，保持现有文风。`\n\n" +
        "### 5. 图片、音频与视频\n" +
        "- 查看和整理图片素材，生成或编辑图片，管理项目资源库。\n" +
        "- 转写录音、整理会议纪要、处理音频，并按脚本剪辑视频、提取封面或转码。\n" +
        "- 生成的图片和文件可在中央预览与右侧任务上下文中直接打开。\n\n" +
        "示例提示词：`转写当前目录的录音，删除口头重复，整理成逐字稿和会议纪要，并列出负责人和截止时间。`\n\n" +
        "### 6. 网页、桌面与自动任务\n" +
        "- 打开网页、读取页面、执行浏览器流程；启用桌面会话后可按授权操作桌面应用。\n" +
        "- 创建一次性或周期性定时任务，例如日报、资料巡检和固定时间汇总。\n" +
        "- 通过应用台连接外部服务，通过插件和 Skills 扩展专业能力。\n\n" +
        "## 二、标准操作流程\n\n" +
        "1. **添加工作目录**：点击左侧“+”或输入框下方的目录名称，选择本次任务要使用的文件夹。Agent 的读写操作会限制在该目录内。\n" +
        "2. **选择模型**：点击输入框底部的模型名称。演示模型用于体验流程；需要真实分析和生成时，请在“模型”中配置并选择真实模型。\n" +
        "3. **选择权限**：默认权限适合日常使用，修改文件或执行命令时会请求确认；完全访问适合你明确授权的自动执行任务。桌面操作仍需单独开启。\n" +
        "4. **描述目标**：说明要处理的对象、期望结果、保存格式和验收标准。可以拖入文件、粘贴图片，或用“+”添加附件。\n" +
        "5. **发送并观察**：按 Enter 发送。会话中会显示思考过程、工具调用、权限请求、文件变更和执行结果。运行时仍可追加下一项任务。\n" +
        "6. **查看交付物**：点击会话中的文件，或打开右上角“任务上下文”，查看输出、最近文件、来源和图片附件。图片与文档会在中央预览。\n" +
        "7. **继续修改**：直接在同一会话说清楚修改点，例如“第二页减少文字、保留数据图”“只修改颜色，不改变布局”。Agent 会基于现有上下文继续工作。\n" +
        "8. **复用与自动化**：常用素材放入资源库；固定流程可创建定时任务；专业工作流可在应用台、插件中心或专家库中扩展。\n\n" +
        "## 三、写出高质量任务的模板\n\n" +
        "复制下面这段并替换括号内容：\n\n" +
        "`目标：我要完成【具体成果】。输入：请读取【目录/文件/附件】。要求：【内容、风格、尺寸、格式】。输出：保存为【文件名和格式】。验收：完成后请【运行测试/核对数据/预览页面】，并列出改动、结果和仍需确认的事项。`\n\n" +
        "建议从一个清晰目标开始。完成第一版后，再在同一会话逐项调整，通常比一次塞入大量互相冲突的要求更稳定。",
    );
    yield { type: "done" };
    return;
  }
  if (
    /子\s*agent|subagent|并行.*探索/i.test(text) &&
    hasTool("agent_spawn") &&
    !hasToolResult
  ) {
    yield {
      type: "tool_start",
      index: 0,
      id: "mock_spawn",
      name: "agent_spawn",
    };
    yield {
      type: "tool_delta",
      index: 0,
      argsChunk: JSON.stringify({
        tasks: [
          {
            profile: "explorer",
            title: "代码结构",
            instruction: "只读分析代码结构，返回文件证据。",
          },
          {
            profile: "reviewer",
            title: "验证检查",
            instruction: "只读检查验证入口，返回证据。",
          },
        ],
        idempotencyKey: "mock-demo",
      }),
    };
    yield { type: "done" };
    return;
  }
  if (/截图|screenshot|屏幕/.test(text) && hasTool("screenshot")) {
    yield { type: "text_delta", text: "好的，我先截取当前屏幕。\n\n" };
    yield {
      type: "tool_start",
      index: 0,
      id: "mock_call_1",
      name: "screenshot",
    };
    yield { type: "tool_delta", index: 0, argsChunk: "{}" };
    yield { type: "tool_end", index: 0 };
    yield { type: "done" };
    return;
  }
  if (lastIsToolResult && hasToolResult) {
    const tr = messages[messages.length - 1];
    const summary =
      typeof tr.content === "string"
        ? tr.content
        : (tr.content ?? [])
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(" ");
    yield* emitText(`工具已执行完成。结果：${String(summary).slice(0, 300)}`);
    yield { type: "done" };
    return;
  }
  if (/写|创建|hello\.txt/.test(text) && hasTool("write_file")) {
    yield { type: "text_delta", text: "好的，我来创建文件。\n\n" };
    const args = JSON.stringify({
      path: "hello.txt",
      content: `这是由 agent 创建的文件。\n请求内容：${text}\n时间：${new Date().toISOString()}\n`,
    });
    yield {
      type: "tool_start",
      index: 0,
      id: "mock_call_1",
      name: "write_file",
    };
    for (const c of chunk(args, 24)) {
      yield { type: "tool_delta", index: 0, argsChunk: c };
      await sleep(6);
    }
    yield { type: "tool_end", index: 0 };
    yield { type: "done" };
    return;
  }
  yield* emitText(
    "你好！当前处于 **mock 模式**（未接入真实模型），用于零 Key 跑通全链路。\n\n" +
      "试试：\n- 说「写一个 hello.txt」→ 触发 write_file 与 L1 权限弹窗\n" +
      "- 说「截图」→ 触发 desktop 插件的 screenshot（L3，需在侧边栏开启桌面会话）\n\n" +
      "接入真实模型：编辑 config.json 的 provider 段即可。",
  );
  yield { type: "done" };
}

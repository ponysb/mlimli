const URL_PATTERN = /https?:\/\/[^\s<>"'`\])}]+/gi;

const fileName = (path) =>
  String(path || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .at(-1) || String(path || "");

const noisyPath = (path) =>
  /(?:^|\/)(?:node_modules|__pycache__|\.git|\.cache|dist\/assets)(?:\/|$)/i.test(
    String(path || "").replaceAll("\\", "/"),
  );

function urlsIn(value, found = new Set(), depth = 0) {
  if (depth > 5 || value == null) return found;
  if (typeof value === "string") {
    for (const match of value.match(URL_PATTERN) || []) {
      try {
        const url = new URL(match.replace(/[.,;:!?]+$/, "")).href;
        found.add(url);
      } catch {}
    }
    return found;
  }
  if (Array.isArray(value))
    for (const item of value) urlsIn(item, found, depth + 1);
  else if (typeof value === "object")
    for (const item of Object.values(value)) urlsIn(item, found, depth + 1);
  return found;
}

function mediaParts(entry) {
  const content = Array.isArray(entry?.content) ? entry.content : [];
  const media = Array.isArray(entry?.media) ? entry.media : [];
  return [...content, ...media].filter(
    (item) =>
      item &&
      typeof item === "object" &&
      (item.url || item.dataUrl || item.workspacePath),
  );
}

export function collectSessionContext(entries = [], live = null) {
  const source = Array.isArray(entries) ? entries : [];
  const deleted = new Set();
  for (const entry of source) {
    if (entry?.type !== "task_summary") continue;
    for (const file of entry.files || [])
      if (file?.path && file.status === "deleted") deleted.add(file.path);
  }

  const outputs = [],
    files = [],
    sources = [],
    media = [];
  const seenOutput = new Set(),
    seenFile = new Set(),
    seenSource = new Set(),
    seenMedia = new Set();
  const ordered = [
    ...source,
    ...(live ? [{ ...live, type: "live" }] : []),
  ].reverse();

  for (const entry of ordered) {
    const parts = mediaParts(entry);
    for (const item of parts) {
      const key =
        item.attachmentId || item.workspacePath || item.url || item.dataUrl;
      if (!key || seenMedia.has(key)) continue;
      seenMedia.add(key);
      const type =
        item.type ||
        (String(item.mime || "").startsWith("image/") ? "image" : "file");
      const normalized = {
        ...item,
        type,
        name:
          item.name || fileName(item.workspacePath || item.url) || "会话附件",
      };
      if (type === "file" && item.workspacePath) {
        if (
          !deleted.has(item.workspacePath) &&
          !seenFile.has(item.workspacePath)
        ) {
          seenFile.add(item.workspacePath);
          files.push({
            path: item.workspacePath,
            name: normalized.name,
            status: "attached",
            source: "附件",
          });
        }
      } else media.push(normalized);
    }

    const screenshot = parts.find(
      (item) =>
        (item.type === "image" ||
          String(item.mime || "").startsWith("image/")) &&
        (item.url || item.dataUrl),
    );
    for (const url of urlsIn([entry?.args, entry?.content, entry?.url])) {
      if (seenSource.has(url) || url.startsWith("data:")) continue;
      seenSource.add(url);
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {}
      sources.push({
        url,
        host,
        title: entry?.title || host,
        thumbnail: screenshot?.url || screenshot?.dataUrl || "",
      });
    }

    if (entry?.type !== "task_summary") continue;
    const candidates = [
      entry.primaryArtifact,
      ...(entry.artifacts || []),
      ...(entry.files || []),
    ];
    for (const item of candidates) {
      if (
        !item?.path ||
        deleted.has(item.path) ||
        seenFile.has(item.path) ||
        noisyPath(item.path)
      )
        continue;
      seenFile.add(item.path);
      files.push({
        ...item,
        name: item.name || fileName(item.path),
        source: "任务文件",
      });
    }
    const primary =
      entry.primaryArtifact?.path && !deleted.has(entry.primaryArtifact.path)
        ? entry.primaryArtifact
        : (entry.artifacts || []).find(
            (item) => item?.path && !deleted.has(item.path),
          );
    const key =
      primary?.path || `summary:${entry.id || entry.turnId || outputs.length}`;
    if (!seenOutput.has(key) && (primary?.path || entry.summaryText)) {
      seenOutput.add(key);
      outputs.push({
        path: primary?.path || "",
        name:
          primary?.name || fileName(primary?.path) || entry.title || "任务输出",
        summary: String(entry.summaryText || "").trim(),
        reason: entry.reason || "done",
      });
    }
  }

  return {
    outputs,
    files,
    sources,
    media,
  };
}

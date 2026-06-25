// Regex (case-insensitive, global) prompt filter application.
// Filters are applied sequentially by priority (already sorted ASC by the
// repo). Text replaced by a higher-priority filter is marked and skipped by
// lower-priority filters — no cascade re-processing.
// Invalid regex patterns are silently skipped to avoid breaking requests.

function applyFiltersToText(text, filters) {
  if (!text || filters.length === 0) return text;

  let segments = [{ text, replaced: false }];

  for (const filter of filters) {
    const { pattern, replacement } = filter;
    if (!pattern) continue;

    let regex;
    try {
      regex = new RegExp(pattern, "gi");
    } catch {
      continue;
    }

    const next = [];

    for (const seg of segments) {
      if (seg.replaced) {
        next.push(seg);
        continue;
      }

      regex.lastIndex = 0;
      const matches = [];
      let m;
      while ((m = regex.exec(seg.text)) !== null) {
        matches.push({ index: m.index, length: m[0].length });
        if (m[0].length === 0) regex.lastIndex++;
      }

      if (matches.length === 0) {
        next.push(seg);
        continue;
      }

      let lastEnd = 0;
      for (const match of matches) {
        if (match.index > lastEnd)
          next.push({
            text: seg.text.slice(lastEnd, match.index),
            replaced: false,
          });
        next.push({ text: replacement, replaced: true });
        lastEnd = match.index + match.length;
      }
      if (lastEnd < seg.text.length)
        next.push({ text: seg.text.slice(lastEnd), replaced: false });
    }

    segments = next;
  }

  return segments.map((s) => s.text).join("");
}

// Rewrite text content in system/user/assistant messages only.
// Tool calls, tool results, and function definitions are left untouched.
export function applyFiltersToMessages(messages, filters) {
  if (!Array.isArray(messages) || filters.length === 0) return messages;

  const allowedRoles = new Set(["system", "user", "assistant"]);

  return messages.map((msg) => {
    if (!msg || !allowedRoles.has(msg.role)) return msg;

    if (typeof msg.content === "string") {
      return { ...msg, content: applyFiltersToText(msg.content, filters) };
    }

    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (block?.type === "text" && typeof block.text === "string") {
            return { ...block, text: applyFiltersToText(block.text, filters) };
          }
          return block;
        }),
      };
    }

    return msg;
  });
}

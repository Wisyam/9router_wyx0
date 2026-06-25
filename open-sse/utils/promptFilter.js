// Literal case-insensitive prompt filter application.
// Filters are applied sequentially by priority (already sorted ASC by the
// repo). Text replaced by a higher-priority filter is marked and skipped by
// lower-priority filters — no cascade re-processing.

function applyFiltersToText(text, filters) {
  if (!text || filters.length === 0) return text;

  let segments = [{ text, replaced: false }];

  for (const filter of filters) {
    const { pattern, replacement } = filter;
    if (!pattern) continue;

    const needle = pattern.toLowerCase();
    const next = [];

    for (const seg of segments) {
      if (seg.replaced) {
        next.push(seg);
        continue;
      }

      const hay = seg.text.toLowerCase();
      const matches = [];
      let from = 0;
      let at;
      while ((at = hay.indexOf(needle, from)) !== -1) {
        matches.push(at);
        from = at + needle.length;
      }

      if (matches.length === 0) {
        next.push(seg);
        continue;
      }

      let lastEnd = 0;
      for (const pos of matches) {
        if (pos > lastEnd)
          next.push({ text: seg.text.slice(lastEnd, pos), replaced: false });
        next.push({ text: replacement, replaced: true });
        lastEnd = pos + needle.length;
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

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const MENTION = "@everyone";
const UPDATE_COMMAND = "npm update -g wyxrouter";
const CHANGELOG_PATH = path.resolve("CHANGELOG.md");
const OUTPUT_PATH = path.resolve("discord-payload.json");
const MAX_BULLET_LEN = 180;

function readSection(version) {
  const md = fs.readFileSync(CHANGELOG_PATH, "utf8");
  const lines = md.split(/\r?\n/);
  const headerPattern = new RegExp(`^#\\s*v${escapeRegex(version)}(?:\\s|$|\\()`);
  const startIdx = lines.findIndex((l) => headerPattern.test(l));
  if (startIdx === -1) return null;
  const remainder = lines.slice(startIdx + 1);
  const stopIdx = remainder.findIndex((l) => /^#\s*v\d/.test(l) || /^#\s*Unreleased/i.test(l));
  const body = stopIdx === -1 ? remainder : remainder.slice(0, stopIdx);
  return body.join("\n").trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyHeading(headingText) {
  const lower = headingText.toLowerCase();
  if (/hotfix|bug ?fix|patch only/.test(lower)) return "FIX";
  if (/feature|new\b|added|introduce|support|selector|selection|engine|format|integration|release/.test(lower)) return "NEW";
  if (/improvement|enhancement|polish|refactor|chore|cleanup/.test(lower)) return "IMPROVEMENT";
  if (/fix/.test(lower)) return "FIX";
  return null;
}

function classifyByContent(bullets) {
  const text = bullets.join(" ").toLowerCase();
  const hasFix = /\b(fix|fixed|fixes|resolve|resolved|hotfix|bug)\b/.test(text);
  const hasFeature = /\b(add|added|adds|new|now\s+(accepts|supports|opens|launches)|introduces?|now\s+(actually|properly|finally))\b/.test(text);
  if (hasFeature && !hasFix) return "NEW";
  if (hasFix && !hasFeature) return "FIX";
  if (hasFeature && hasFix) return "NEW";
  return "IMPROVEMENT";
}

function rewriteBullet(text) {
  let out = text;
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  out = out.replace(/\(#\d+[^)]*\)/g, "");
  out = out.replace(/[\u2014\u2013]/g, "-");
  out = out.replace(/[\u2026]/g, "...");
  out = out.replace(/[\u201c\u201d]/g, '"');
  out = out.replace(/[\u2018\u2019]/g, "'");
  out = out.replace(/[\.;]\s*$/, "");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > MAX_BULLET_LEN) {
    const cutoff = out.lastIndexOf(" ", MAX_BULLET_LEN - 1);
    const sliceEnd = cutoff > 60 ? cutoff : MAX_BULLET_LEN - 1;
    out = out.slice(0, sliceEnd).replace(/[,;:\s]+$/, "") + "...";
  }
  return out;
}

function parseSection(body) {
  const sections = [];
  const lines = body.split("\n");
  let currentHeading = null;
  let currentBullets = [];

  const flush = () => {
    if (currentBullets.length === 0) return;
    sections.push({ heading: currentHeading || "", bullets: currentBullets.slice() });
    currentBullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flush();
      currentHeading = line.replace(/^##\s+/, "").trim();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      currentBullets.push(line.replace(/^[-*]\s+/, "").trim());
    }
  }
  flush();
  return sections;
}

function bucketize(sections) {
  const buckets = { NEW: [], FIX: [], IMPROVEMENT: [] };
  for (const sec of sections) {
    if (sec.bullets.length === 0) continue;
    const typed = classifyHeading(sec.heading) || classifyByContent(sec.bullets);
    for (const bullet of sec.bullets) {
      buckets[typed].push(rewriteBullet(bullet));
    }
  }
  return buckets;
}

function determineUpdateType(version, buckets) {
  const segments = String(version).split(/[-+]/)[0].split(".").map((n) => Number.parseInt(n, 10));
  const [maj = 0, min = 0, patch = 0] = segments;
  const hasNew = buckets.NEW.length > 0;
  const hasFix = buckets.FIX.length > 0;
  if (maj > 0 && min === 0 && patch === 0) return "MAJOR UPDATE";
  if (patch === 0 && min > 0) return "FEATURE UPDATE";
  if (hasNew && hasFix) return "FEATURE UPDATE";
  if (hasNew) return "FEATURE UPDATE";
  if (hasFix) return "HOTFIX UPDATE";
  return "PATCH UPDATE";
}

function buildContent({ version, buckets, label }) {
  const type = label || determineUpdateType(version, buckets);
  const lines = [MENTION, `## ${type} v${version}`];
  if (buckets.NEW.length) {
    lines.push("[NEW]");
    for (const b of buckets.NEW) lines.push(`- ${b}`);
    lines.push("");
  }
  if (buckets.FIX.length) {
    lines.push("[FIX]");
    for (const b of buckets.FIX) lines.push(`- ${b}`);
    lines.push("");
  }
  if (buckets.IMPROVEMENT.length) {
    lines.push("[IMPROVEMENT]");
    for (const b of buckets.IMPROVEMENT) lines.push(`- ${b}`);
    lines.push("");
  }
  lines.push("run");
  lines.push("```");
  lines.push(UPDATE_COMMAND);
  lines.push("```");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mergeBuckets(buckets) {
  const merged = { NEW: [], FIX: [], IMPROVEMENT: [] };
  for (const b of buckets) {
    merged.NEW.push(...b.NEW);
    merged.FIX.push(...b.FIX);
    merged.IMPROVEMENT.push(...b.IMPROVEMENT);
  }
  return merged;
}

function bucketizePerBullet(section) {
  const buckets = { NEW: [], FIX: [], IMPROVEMENT: [] };
  for (const raw of section.bullets) {
    const tagMatch = raw.match(/^\[(NEW|FIX|IMPROVEMENT)\]\s*:?\s*/i);
    let typed;
    let cleaned = raw;
    if (tagMatch) {
      typed = tagMatch[1].toUpperCase();
      cleaned = raw.slice(tagMatch[0].length);
    } else {
      typed = classifyByContent([raw]);
    }
    buckets[typed].push(rewriteBullet(cleaned));
  }
  return buckets;
}

function loadVersion(version) {
  const body = readSection(version);
  if (!body) return null;
  const sections = parseSection(body);
  const highlightSection = sections.find((s) => /release\s*highlight|announce(?:ment)?/i.test(s.heading));
  if (highlightSection) {
    const buckets = bucketizePerBullet(highlightSection);
    if (buckets.NEW.length || buckets.FIX.length || buckets.IMPROVEMENT.length) {
      return { version, buckets, fromHighlights: true };
    }
  }
  const buckets = bucketize(sections);
  if (!buckets.NEW.length && !buckets.FIX.length && !buckets.IMPROVEMENT.length) return null;
  return { version, buckets, fromHighlights: false };
}

function fallbackPayload(version) {
  return {
    content: `${MENTION}\n## RELEASE v${version}\nSee CHANGELOG.md for details.\n\nrun\n\`\`\`\n${UPDATE_COMMAND}\n\`\`\``,
    allowed_mentions: { parse: ["everyone"] },
  };
}

function main() {
  const versions = process.argv.slice(2).filter(Boolean);
  if (versions.length === 0) {
    console.error("Usage: discord-announce.mjs <version> [extra-version ...]");
    process.exit(2);
  }

  const primaryVersion = versions[0];
  const loaded = versions.map(loadVersion).filter(Boolean);

  if (loaded.length === 0) {
    const payload = fallbackPayload(primaryVersion);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(payload.content);
    return;
  }

  const merged = mergeBuckets(loaded.map((entry) => entry.buckets));
  const content = buildContent({ version: primaryVersion, buckets: merged });
  const payload = {
    content,
    allowed_mentions: { parse: ["everyone"] },
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(content);
}

main();

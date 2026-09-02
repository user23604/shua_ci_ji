"use strict";

function formatDefinition(word) {
  if (!word) return "";
  const source = state.settings.highOnly && word.zh_high ? word.zh_high : word.zh_full;
  return String(source || "").replace(/\s+/g, " ").trim();
}


const POS_TAG_PATTERN = "(?:interj|prep|conj|pron|adj|adv|aux|num|art|vi|vt|nm|ad|int|n|v|a)";
const POS_SPLIT_RE = new RegExp(`\\s+(?=${POS_TAG_PATTERN}\\.?\\s*[\\u4e00-\\u9fff（(])`, "gi");

const POS_ADJOINED_RE = new RegExp(`([\\u4e00-\\u9fff）)])(?=${POS_TAG_PATTERN}\\.?\\s*[\\u4e00-\\u9fff（(])`, "gi");
const POS_PREFIX_RE = new RegExp(`^${POS_TAG_PATTERN}\\.?\\s*`, "i");


function splitDefinitionLines(text) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(POS_SPLIT_RE, "\n")
    .replace(POS_ADJOINED_RE, "$1\n")
    .trim();
  if (!normalized) return [];
  return normalized.split("\n").map((line) => line.trim()).filter(Boolean);
}


function formatSpokenDefinition(word) {
  if (!word) return "";
  if (word.zh_high) return normalizeSpokenMeaning(word.zh_high);
  const lines = splitDefinitionLines(word.zh_full);
  const brief = lines.map(pickBroadMeaning).filter(Boolean);
  return normalizeSpokenMeaning(brief.join("；") || word.zh_full);
}


function pickBroadMeaning(line) {
  const withoutPos = String(line || "")
    .replace(POS_PREFIX_RE, "")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!withoutPos) return "";
  return withoutPos.split(/[；;，,、/]/).map((item) => item.trim()).find(Boolean) || withoutPos;
}


function normalizeSpokenMeaning(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[；;、/]+/g, "；")
    .replace(/[，,]+/g, "，")
    .replace(/；{2,}/g, "；")
    .replace(/^；|；$/g, "")
    .trim();
}


function highlightTerms(highlight) {
  const raw = String(highlight || "").replace(/\s+/g, " ").trim();
  if (!raw) return [];
  const parts = raw.split(/[；;，,、]/).map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set([raw, ...parts])).sort((a, b) => b.length - a.length);
}


function highlightText(text, highlight) {
  const terms = highlightTerms(highlight).filter((term) => text.includes(term));
  if (!terms.length) return escapeHtml(text);
  const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "g");
  let cursor = 0;
  let html = "";
  for (const match of text.matchAll(pattern)) {
    const start = match.index || 0;
    html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="meaning-highlight">${escapeHtml(match[0])}</mark>`;
    cursor = start + match[0].length;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}


function renderDefinitionHtml(word) {
  const text = formatDefinition(word);
  const highlight = word?.zh_high || "";
  const lines = splitDefinitionLines(text);
  let cursor = 0;
  return lines.map((line, index) => {
    const start = text.indexOf(line, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const end = safeStart + line.length;
    cursor = end;
    const active = state.activeZhIndex === index ? " is-speaking" : "";
    return `<span class="meaning-line speech-token${active}" data-token-index="${index}" data-start="${safeStart}" data-end="${end}">${highlightText(line, highlight)}</span>`;
  }).join("");
}



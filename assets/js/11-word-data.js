"use strict";

async function ensureWords(book = currentBook()) {
  if (state.wordsByBook.has(book.id)) return state.wordsByBook.get(book.id);
  const response = await fetch(book.csv);
  if (!response.ok) {
    throw new Error(`词库加载失败：${book.csv} (${response.status})`);
  }
  const text = await response.text();
  const rows = parseCsv(text);
  const words = mapWords(rows);
  state.wordsByBook.set(book.id, words);
  state.maxFreqByBook.set(book.id, Math.max(1, ...words.map((word) => Number(word.freq) || 0)));
  return words;
}


function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      if (next === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((line) => line.some((cell) => String(cell).trim() !== ""));
}


function mapWords(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  const col = (name) => headers.indexOf(name);
  const required = ["序号", "Unit", "单词", "真题词频", "完整释义（保留红色）", "标红释义"];
  const missing = required.filter((name) => col(name) === -1);
  if (missing.length) throw new Error(`CSV 缺少列：${missing.join("、")}`);

  return rows.slice(1).map((row) => ({
    id: Number.parseInt(row[col("序号")] || "0", 10),
    unit: Number.parseInt(row[col("Unit")] || "0", 10),
    en: String(row[col("单词")] || "").trim(),
    freq: Number.parseInt(row[col("真题词频")] || "0", 10) || 0,
    zh_full: String(row[col("完整释义（保留红色）")] || "").replace(/\s+/g, " ").trim(),
    zh_high: String(row[col("标红释义")] || "").replace(/\s+/g, " ").trim()
  })).filter((word) => word.id && word.unit && word.en);
}


function primeSetupBookData(book) {
  if (state.wordsByBook.has(book.id) || state.setupPrimeBookIds.has(book.id)) return;
  state.setupPrimeBookIds.add(book.id);
  ensureWords(book)
    .then(() => {
      state.setupPrimeBookIds.delete(book.id);
      if (state.view === "setup" && currentBook().id === book.id) renderSetup();
    })
    .catch(() => {
      state.setupPrimeBookIds.delete(book.id);
    });
}


function currentUnknownScope() {
  const book = currentBook();
  if (state.settings.unknownScope === "book") return { scope: "book" };
  return { scope: "unit", unit: clamp(Number(state.settings.unit) || 1, 1, book.totalUnits) };
}


function unknownWordsForScope(bookId, words = state.words, scope = currentUnknownScope()) {
  const unknownIds = new Set(loadMarks(bookId).unknown.map(Number));
  return words.filter((word) => {
    if (!unknownIds.has(Number(word.id))) return false;
    return scope.scope === "book" || Number(word.unit) === Number(scope.unit);
  });
}


function unitProgressInfo(book, unit, words = []) {
  const progress = loadProgress(book.id);
  const stats = loadUnitStats(book.id);
  const unitWords = words.filter((word) => Number(word.unit) === Number(unit));
  const total = unitWords.length;
  const completed = Number(stats.units[String(unit)]?.completed) || 0;
  let seen = 0;
  if (Number(progress.unit) === Number(unit)) {
    const lastWordId = Number(progress.lastWordId);
    const index = unitWords.findIndex((word) => Number(word.id) === lastWordId);
    seen = index >= 0 ? index + 1 : 0;
  }
  return { seen, total, completed };
}


function buildStudyUnitWords(bookId, unit) {
  const knownIds = new Set(loadMarks(bookId).known.map(Number));
  return state.words.filter((word) => word.unit === unit && !knownIds.has(Number(word.id)));
}


function buildUnknownStudyWords(bookId, scope = currentUnknownScope()) {
  return unknownWordsForScope(bookId, state.words, scope);
}


function unknownScopeLabel(book, scope = currentUnknownScope()) {
  return scope.scope === "book" ? `${book.name} · 整本重难点词库` : `${unitDisplayLabel(book, scope.unit)} · 重难点词库`;
}


function recordUnitCompletion(bookId, unit) {
  const stats = loadUnitStats(bookId);
  const key = String(unit);
  const item = stats.units[key] || { completed: 0 };
  const updatedAt = beijingISOString();
  const completed = Math.max(0, Number(item.completed) || 0) + 1;
  stats.units[key] = { completed, updatedAt };
  saveUnitStats(bookId, stats);
  appendPendingOp({ type: "unitStats.completed.set", bookId: bookId, unit: Number(unit), completed: completed, createdAt: updatedAt });
  onLocalDataChanged("unitCompletion");
}



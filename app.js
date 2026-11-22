// Yomu 読む: Japanese reading and listening. News video + NHK headlines, public-domain literature with tap-to-look-up,
// long comedy videos for the car (played in the YouTube app), and a saved-word review. Data stays on this device.
"use strict";

const KEY = "yomu.v1";
const NEWS_CH = ["日テレNEWS", "TBS NEWS DIG", "ANNnewsCH"];
const BOX_DAYS = [1, 3, 7, 14, 30, 60];          // review spacing for "覚えた", per box

// ---------- state ----------
function defaults() {
  return { settings: { theme: "dark", newsCh: NEWS_CH[0], furigana: false, vertical: false, fs: 19, rate: 1 },
    progress: {}, words: {}, readDays: {}, lastText: null };
}
let S = (() => { try { const r = localStorage.getItem(KEY); if (r) return deepMerge(defaults(), JSON.parse(r)); } catch (e) {} return defaults(); })();
function deepMerge(a, b) { for (const k in b) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] ? deepMerge(a[k], b[k]) : b[k]; return a; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("保存できませんでした"); } }

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
const mins = s => s >= 3600 ? `${Math.floor(s / 3600)}時間${Math.round(s % 3600 / 60)}分` : `${Math.round(s / 60)}分`;
const ago = iso => { const h = (Date.now() - new Date(iso)) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))}分前` : h < 24 ? `${Math.round(h)}時間前` : `${Math.round(h / 24)}日前`; };
let toastT = 0;
function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2000); }
async function getJSON(url) { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return r.json(); }

// Open a video in the YouTube app (Premium keeps it playing with the screen off); the website if the app is missing.
function openYT(id) {
  location.href = "youtube://www.youtube.com/watch?v=" + id;
  setTimeout(() => { if (!document.hidden) location.href = "https://www.youtube.com/watch?v=" + id; }, 1200);
}

// ---------- data ----------
let FEEDS = null, LIB = [], DICT = null, TEXT = null;
const loadFeeds = getJSON("feeds.json").then(j => (FEEDS = j)).catch(() => (FEEDS = { news: [], newsVideos: {}, comedy: [] }));
const loadLib = getJSON("library.json").then(j => (LIB = j)).catch(() => []);
const loadDict = () => DICT ? Promise.resolve(DICT) : getJSON("dict.json").then(j => (DICT = j));

// ---------- reading time ----------
function readingStreak() {
  let k = dayKey(); if (!S.readDays[k]) k = addDays(k, -1);
  let n = 0; while (S.readDays[k]) { n++; k = addDays(k, -1); }
  return n;
}
setInterval(() => {                                 // count minutes while a text is open and the app is visible
  if (view === "reader" && !document.hidden) { const k = dayKey(); S.readDays[k] = (S.readDays[k] || 0) + 0.5; save(); }
}, 30000);
const dueWords = () => Object.values(S.words).filter(w => w.due <= dayKey());

// ---------- screens ----------
let view = "home", comedyCh = "すべて", newsIdx = 0;
function render() {
  document.documentElement.dataset.theme = S.settings.theme;
  const tab = view === "reader" ? "read" : view === "review" ? "words" : view;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view").innerHTML = view === "home" ? homeView() : view === "read" ? readView() : view === "listen" ? listenView()
    : view === "words" ? wordsView() : view === "review" ? reviewView() : readerView();
  if (view === "reader") afterReader();
}

function homeView() {
  if (!FEEDS) return `<h1>Yomu 読む</h1><p class="muted">読み込み中…</p>`;
  const vids = (FEEDS.newsVideos || {})[S.settings.newsCh] || [];
  const v = vids[newsIdx] || vids[0];
  const last = S.lastText && LIB.find(t => t.id === S.lastText);
  const todayMin = Math.round(S.readDays[dayKey()] || 0);
  return `<h1>Yomu 読む</h1>
    <div class="stats"><div class="stat"><b>${readingStreak()}</b><span>日連続で読書</span></div>
      <div class="stat"><b>${todayMin}</b><span>今日の読書(分)</span></div>
      <div class="stat"><b>${dueWords().length}</b><span>今日の復習</span></div></div>
    <h3>最新ニュース動画</h3>
    <div class="card">
      <div class="seg">${NEWS_CH.map(c => `<button data-newsch="${esc(c)}" class="${c === S.settings.newsCh ? "on" : ""}">${esc(c)}</button>`).join("")}</div>
      ${v ? `<div class="video" style="margin-top:12px"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="news"></iframe></div>
        <div class="vtitle">${esc(v.title)}</div><div class="muted small">${esc(S.settings.newsCh)} · ${ago(v.published)}</div>
        <button class="big primary" data-yt="${v.id}">▶ YouTubeアプリで見る</button>
        ${vids.length > 1 ? `<div style="margin-top:8px">${vids.slice(0, 6).map((x, i) => i === newsIdx ? "" : `<button class="row" data-newsidx="${i}"><span class="t">${esc(x.title)}<br><span class="muted small">${ago(x.published)}</span></span></button>`).join("")}</div>` : ""}`
        : `<p class="muted">動画を読み込めませんでした。</p>`}
    </div>
    ${openingCard()}
    ${last ? `<h3>続きを読む</h3><button class="card row" data-open="${last.id}" style="border:0"><span class="t"><b>${esc(last.title)}</b><span class="muted small">${esc(last.author)} · ${pct(last)}%</span></span><span>›</span></button>` : ""}
    <h3>NHKニュース 見出し</h3>
    <div class="card">${(FEEDS.news || []).slice(0, 6).map(newsRow).join("") || '<p class="muted">見出しを読み込めませんでした。</p>'}
      <button class="big" data-tab="read">もっと読む</button></div>
    <h3>表示</h3><div class="card"><div class="seg">
      <button data-theme-set="dark" class="${S.settings.theme === "dark" ? "on" : ""}">ダーク</button>
      <button data-theme-set="light" class="${S.settings.theme === "light" ? "on" : ""}">ライト</button></div>
      <p class="muted small" style="margin:10px 0 0">更新: ${FEEDS.updated ? ago(FEEDS.updated) : "—"}</p></div>`;
}
// one famous opening line a day, in library order
function openingCard() {
  if (!LIB.length) return "";
  const t = LIB[Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5) % LIB.length];
  return `<h3>今日の書き出し</h3><div class="card opening"><p class="line">${esc(t.first || "")}</p>
    <p class="muted small">— ${esc(t.author)}『${esc(t.title)}』</p>
    <div class="two"><button class="big" data-open="${t.id}">読む</button><button class="big primary" data-roudoku="${t.id}">🔊 朗読で聴く</button></div></div>`;
}
const newsRow = n => `<a class="row" href="${esc(n.link)}" target="_blank" rel="noopener"><span class="t">${esc(n.title)}<br><span class="muted small">${ago(n.time)}</span></span><span class="muted">↗</span></a>`;
const pct = t => { const p = S.progress[t.id]; return p ? Math.min(100, Math.round(100 * p.p / Math.max(1, p.n - 1))) : 0; };

function readView() {
  const lib = LIB.map(t => `<button class="row" data-open="${t.id}"><span class="t"><b>${esc(t.title)}</b>
      <span class="muted small">${esc(t.author)} · 約${Math.max(1, Math.round(t.chars / 600))}分 · ${pct(t)}%</span></span><span>›</span></button>`).join("");
  return `<h1>読む</h1>
    <h3>文学（青空文庫）— 単語をタップで読み方と意味</h3><div class="card">${lib}</div>
    <h3>NHKニュース（NHKのサイトで開きます）</h3><div class="card">${((FEEDS && FEEDS.news) || []).map(newsRow).join("")}</div>
    <p class="muted small">本文は青空文庫（パブリックドメイン）。辞書: JMdict（EDRDG, CC BY-SA 4.0）。読み: 青空文庫のルビ、なければ形態素解析（kuromoji）。</p>`;
}

function listenView() {
  if (!FEEDS) return `<h1>聴く</h1><p class="muted">読み込み中…</p>`;
  const chans = ["すべて", ...new Set(FEEDS.comedy.map(v => v.channel))];
  const list = FEEDS.comedy.filter(v => comedyCh === "すべて" || v.channel === comedyCh);
  return `<h1>聴く</h1>
    <p class="muted small" style="margin-top:-6px">20分以上のお笑い動画。▶でYouTubeアプリが開きます（Premiumなら画面を消しても再生が続きます）。運転中は画面を見ずに、音声だけで。</p>
    <div class="chips">${chans.map(c => `<button data-comedych="${esc(c)}" class="${c === comedyCh ? "on" : ""}">${esc(c.replace(/ ?(チャンネル|Official).*$/, "").replace(/、.*$/, ""))}</button>`).join("")}</div>
    <div class="card">${list.map(v => `<div class="vid"><img loading="lazy" src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="">
      <div class="t">${esc(v.title)}<small>${esc(v.channel)} · ${mins(v.secs)} · ${ago(v.published)}</small></div>
      <button class="play" data-yt="${v.id}" aria-label="YouTubeで再生">▶</button></div>`).join("") || '<p class="muted">動画がありません。</p>'}</div>
    <h3>朗読 — 名作を耳で</h3>
    <p class="muted small" style="margin-top:-2px">iPhoneの日本語音声が一文ずつ読み上げます。続きから再開。Yomuを開いたまま、画面はつけておいてください（自動で消灯しません）。</p>
    <div class="card">${LIB.map(t => `<div class="vid"><div class="t"><b>${esc(t.title)}</b><small>${esc(t.author)} · 約${Math.max(1, Math.round(t.chars / 330))}分 · ${pct(t)}%</small></div>
      <button class="play" data-roudoku="${t.id}" aria-label="朗読">🔊</button></div>`).join("")}</div>`;
}

function wordsView() {
  const all = Object.entries(S.words).sort((a, b) => b[1].added - a[1].added);
  const due = dueWords().length;
  return `<h1>単語</h1>
    <div class="card"><b style="font-size:20px">${due}語</b> <span class="muted">が今日の復習</span>
      <button class="big primary" data-act="review" ${due ? "" : "disabled style='opacity:.5'"}>復習する</button></div>
    <h3>保存した単語（${all.length}）</h3>
    <div class="card">${all.map(([k, w]) => { const e = DICT && DICT[w.d];
      return `<div class="row"><span class="t"><b>${esc(w.s)}${e && e[1] ? ` <span class="muted small">${esc(e[1])}</span>` : ""}</b>
        <span class="muted small">${e ? esc(e[2]) : ""}</span></span><button class="seg" data-del="${esc(k)}" style="min-width:44px;min-height:44px">✕</button></div>`; }).join("")
      || '<p class="muted">本文の単語をタップして「保存」すると、ここに入ります。</p>'}</div>`;
}

// ---------- reader ----------
function readerView() {
  if (!TEXT) return `<p class="muted">読み込み中…</p>`;
  const st = S.settings;
  const savedSet = new Set(Object.values(S.words).map(w => w.d));
  const paras = TEXT.paras.map((p, pi) => `<p data-p="${pi}">${p.map((t, ti) => {
    if (typeof t === "string") return esc(t);
    const [s, r, d] = t, cls = "w" + (d >= 0 && savedSet.has(d) ? " saved" : "");
    const inner = st.furigana && r ? rubyHTML(s, r) : esc(s);
    return `<span class="${cls}" data-t="${pi}:${ti}">${inner}</span>`;
  }).join("")}</p>`).join("");
  return `<div class="reader-bar"><button data-act="back">‹</button><span class="ttl"></span>
      <button data-act="furi" class="${st.furigana ? "on" : ""}">ふりがな</button><button data-act="vert" class="${st.vertical ? "on" : ""}">縦</button><button data-act="tts" class="${TTS.on ? "on" : ""}" aria-label="朗読">🔊</button>
      <button data-act="fs:-1">小</button><button data-act="fs:1">大</button></div>
    <p class="rtitle"><b>${esc(TEXT.title)}</b> <span class="muted small">${esc(TEXT.author)}　·　単語をタップ</span></p>
    <div class="text ${st.vertical ? "vertical" : ""}" style="--fs:${st.fs}px">${paras}</div>
    <p class="muted small" style="margin-top:24px">底本・入力・校正: 青空文庫</p>
    ${TTS.on ? `<div class="ttsbar"><button data-act="tts-prev" aria-label="前の文">⏮</button>
      <button class="main" data-act="tts-play">${TTS.playing ? "⏸" : "▶"}</button>
      <button data-act="tts-next" aria-label="次の文">⏭</button><button data-act="tts-rate">${st.rate.toFixed(1)}×</button>
      <button data-act="tts" aria-label="朗読を閉じる">✕</button></div><div style="height:90px"></div>` : ""}`;
}
// furigana over the kanji only: kana the word starts or ends with (待っ→まっ, 広い→ひろい) stays outside the ruby
function rubyHTML(s, r) {
  const hira = c => c.replace(/[ァ-ヶ]/g, x => String.fromCharCode(x.charCodeAt(0) - 0x60));
  let a = 0, b = 0;
  while (a < s.length - 1 && a < r.length - 1 && /[ぁ-ゟ゠-ヿ]/.test(s[a]) && hira(s[a]) === r[a]) a++;
  while (b < s.length - 1 - a && b < r.length - 1 - a && /[ぁ-ゟ゠-ヿ]/.test(s[s.length - 1 - b]) && hira(s[s.length - 1 - b]) === r[r.length - 1 - b]) b++;
  const core = s.slice(a, s.length - b), rc = r.slice(a, r.length - b);
  return esc(s.slice(0, a)) + `<ruby>${esc(core)}<rt>${esc(rc)}</rt></ruby>` + esc(s.slice(s.length - b));
}
let obs = null;
function afterReader() {
  if (!TEXT) return;
  const p = S.progress[TEXT.id];
  if (p && p.p > 0 && !TTS.on) { const el = document.querySelector(`[data-p="${p.p}"]`); if (el) el.scrollIntoView({ block: "start", inline: "start" }); }
  if (obs) obs.disconnect();
  // the paragraph at the reading edge is the place to come back to: the top of the screen, or the right edge in 縦書き
  const vertical = S.settings.vertical, box = document.querySelector(".text");
  obs = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { const i = +e.target.dataset.p;
      S.progress[TEXT.id] = { p: i, n: TEXT.paras.length }; save(); break; }
  }, vertical ? { root: box, rootMargin: "0px 0px 0px -85%" } : { rootMargin: "0px 0px -70% 0px" });
  document.querySelectorAll(".text p").forEach(el => obs.observe(el));
  if (TTS.on) highlight(true, true);
}
async function openText(id, roudoku) {
  ttsStop(); view = "reader"; TEXT = null; render();
  try { [TEXT] = await Promise.all([getJSON(`text-${id}.json`), loadDict()]); } catch (e) { toast("読み込めませんでした"); view = "read"; render(); return; }
  S.lastText = id; save(); render(); if (!(S.progress[id] && S.progress[id].p > 0)) window.scrollTo(0, 0);
  if (roudoku) ttsStart((S.progress[id] || {}).p || 0, 0);
}
function sentenceAround(pi, ti) {                      // the sentence the tapped word is in
  const p = TEXT.paras[pi], str = t => typeof t === "string" ? t : t[0];
  let a = ti, b = ti;
  while (a > 0 && !/[。！？」]/.test(str(p[a - 1]))) a--;
  while (b < p.length - 1 && !/[。！？]/.test(str(p[b]))) b++;
  return p.slice(a, b + 1).map(str).join("").trim();
}
function showWord(pi, ti) {
  const [s, r, d] = TEXT.paras[pi][ti], e = d >= 0 ? DICT[d] : null;
  const key = e ? String(d) : null, saved = key && S.words[key];
  $("#sheet-body").innerHTML = `<div class="word-head"><span class="jp">${esc(s)}</span>${r ? `<span class="rd">${esc(r)}</span>` : ""}</div>
    ${e ? `<div class="muted" style="margin-top:6px">辞書形: <b>${esc(e[0])}</b>${e[1] ? `（${esc(e[1])}）` : ""}</div>
      <ol class="senses">${e.slice(2).map(g => `<li>${esc(g)}</li>`).join("")}</ol>` : `<p class="muted">辞書に見つかりませんでした。</p>`}
    ${e ? `<button class="big ${saved ? "" : "primary"}" data-save="${pi}:${ti}">${saved ? "保存済み — 外す" : "保存して復習"}</button>` : ""}
    <button class="big" data-from="${pi}:${ti}">🔊 ここから朗読</button>
    <button class="big" data-act="close">閉じる</button>`;
  $("#sheet").hidden = false;
}
function toggleSave(pi, ti) {
  const [s, , d] = TEXT.paras[pi][ti], key = String(d);
  if (S.words[key]) delete S.words[key];
  else S.words[key] = { d, s: DICT[d][0], ctx: sentenceAround(pi, ti), surf: s, box: 0, due: dayKey(), added: Date.now() };
  save(); $("#sheet").hidden = true;
  document.querySelectorAll(".text .w").forEach(el => { const [a, b] = el.dataset.t.split(":"); const t = TEXT.paras[a][b]; if (t[2] === d) el.classList.toggle("saved", !!S.words[key]); });
  toast(S.words[key] ? "保存しました" : "外しました");
}

// ---------- 朗読: the iPhone's Japanese voice reads one sentence at a time, highlighted and scrolled into view ----------
const TTS = { on: false, playing: false, p: 0, s: 0, gen: 0, lock: null };
const RATES = [0.8, 1, 1.2, 1.5];
const tokStr = t => typeof t === "string" ? t : t[0];
function sentencesOf(pi) {                             // [first, last] token index of each sentence in a paragraph
  const p = TEXT.paras[pi], out = []; let a = 0;
  for (let i = 0; i < p.length; i++)
    if (/[。！？]/.test(tokStr(p[i])) && !(i + 1 < p.length && /^[」』）]/.test(tokStr(p[i + 1])))) { out.push([a, i]); a = i + 1; }
  if (a < p.length && p.slice(a).map(tokStr).join("").trim()) out.push([a, p.length - 1]);
  return out;
}
function jaVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
  return vs.find(v => /enhanced|premium|拡張|O-ren|Kyoko/i.test(v.name)) || vs[0] || null;
}
function highlight(scroll, instant) {
  document.querySelectorAll(".text .say").forEach(e => e.classList.remove("say"));
  if (!TEXT || !TTS.on) return;
  const r = sentencesOf(TTS.p)[TTS.s]; if (!r) return;
  let first = null;
  for (let i = r[0]; i <= r[1]; i++) { const el = document.querySelector(`[data-t="${TTS.p}:${i}"]`); if (el) { el.classList.add("say"); first = first || el; } }
  if (scroll && first) first.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "center", inline: "center" });
}
function speakNow() {
  const gen = ++TTS.gen; speechSynthesis.cancel();
  while (TTS.p < TEXT.paras.length && TTS.s >= sentencesOf(TTS.p).length) { TTS.p++; TTS.s = 0; }
  if (TTS.p >= TEXT.paras.length) { TTS.playing = false; TTS.p = 0; TTS.s = 0; wake(false); render(); toast("おしまい"); return; }
  const r = sentencesOf(TTS.p)[TTS.s];
  const u = new SpeechSynthesisUtterance(TEXT.paras[TTS.p].slice(r[0], r[1] + 1).map(tokStr).join("").trim());
  u.lang = "ja-JP"; u.rate = S.settings.rate; const v = jaVoice(); if (v) u.voice = v;
  u.onend = () => { if (gen !== TTS.gen || !TTS.playing) return; TTS.s++; speakNow(); };
  u.onerror = () => { if (gen === TTS.gen) { TTS.playing = false; render(); } };
  S.progress[TEXT.id] = { p: TTS.p, n: TEXT.paras.length }; save();
  highlight(true); speechSynthesis.speak(u);
}
async function wake(on) {                              // keep the screen on while reading aloud
  try { if (on && !TTS.lock && navigator.wakeLock) TTS.lock = await navigator.wakeLock.request("screen");
    if (!on && TTS.lock) { TTS.lock.release(); TTS.lock = null; } } catch (e) { TTS.lock = null; }
}
function ttsStart(p, s) {
  if (!("speechSynthesis" in window)) { toast("この端末は読み上げに対応していません"); return; }
  TTS.on = true; TTS.playing = true; TTS.p = p; TTS.s = s; wake(true);
  render(); speakNow();
  setTimeout(() => { if (TTS.on && !jaVoice()) toast("日本語の声がありません: 設定 › アクセシビリティ › 読み上げコンテンツ › 声"); }, 1500);
}
function ttsPause() { TTS.gen++; speechSynthesis.cancel(); TTS.playing = false; wake(false); render(); }
function ttsStop() { if (!TTS.on) return; TTS.gen++; try { speechSynthesis.cancel(); } catch (e) {} TTS.on = TTS.playing = false; wake(false); highlight(false); }
function ttsStep(d) {
  TTS.s += d;
  while (TTS.s < 0 && TTS.p > 0) { TTS.p--; TTS.s += sentencesOf(TTS.p).length; }
  if (TTS.s < 0) TTS.s = 0;
  if (TTS.playing) { speakNow(); return; }
  while (TTS.p < TEXT.paras.length - 1 && TTS.s >= sentencesOf(TTS.p).length) { TTS.p++; TTS.s = 0; }
  highlight(true);
}
// iOS only lets speech start inside a tap: say nothing right away so the sentences that follow are allowed
function unlockSpeech() { try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && TTS.playing) { TTS.lock = null; wake(true); } });
if ("speechSynthesis" in window) speechSynthesis.getVoices();

// ---------- review ----------
let queue = [], shown = false;
function startReview() { queue = dueWords().map(w => String(w.d)); shown = false; view = "review"; loadDict().then(render); }
function reviewView() {
  const k = queue[0];
  if (!k) return `<h1>復習</h1><div class="card flash"><div class="jp">お疲れさま</div><p class="muted">今日の復習は終わりです。</p>
    <button class="big" data-tab="words">単語へ戻る</button></div>`;
  const w = S.words[k], e = DICT && DICT[w.d];
  const ctx = esc(w.ctx).replace(esc(w.surf), `<b style="color:var(--accent)">${esc(w.surf)}</b>`);
  return `<h1>復習 <span class="muted small">残り${queue.length}</span></h1>
    <div class="card flash"><div class="jp">${esc(w.s)}</div><div class="ctx">${ctx}</div>
      ${shown && e ? `<div class="ans"><div style="font-size:20px;color:var(--ruby)">${esc(e[1])}</div><ol class="senses" style="text-align:left">${e.slice(2).map(g => `<li>${esc(g)}</li>`).join("")}</ol></div>` : ""}</div>
    ${shown ? `<div class="two"><button class="big" data-grade="0">もう一度</button><button class="big primary" data-grade="1">覚えた</button></div>`
      : `<button class="big primary" data-act="show">答えを見る</button>`}`;
}
function grade(ok) {
  const k = queue.shift(), w = S.words[k];
  if (ok) { w.box = Math.min(BOX_DAYS.length - 1, w.box + 1); w.due = addDays(dayKey(), BOX_DAYS[w.box - 1] || 1); }
  else { w.box = 0; w.due = dayKey(); queue.push(k); }
  save(); shown = false; render();
}

// ---------- events ----------
document.addEventListener("click", e => {
  const w = e.target.closest(".text .w");
  if (w && TEXT) { const [pi, ti] = w.dataset.t.split(":").map(Number); if (TEXT.paras[pi][ti][2] >= 0 || TEXT.paras[pi][ti][1]) showWord(pi, ti); return; }
  const b = e.target.closest("button, a"); if (!b) return;
  const d = b.dataset;
  if (d.tab) { ttsStop(); view = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.yt) { openYT(d.yt); return; }
  if (d.newsch) { S.settings.newsCh = d.newsch; newsIdx = 0; save(); render(); return; }
  if (d.newsidx) { newsIdx = +d.newsidx; render(); window.scrollTo(0, 0); return; }
  if (d.comedych) { comedyCh = d.comedych; render(); return; }
  if (d.open) { openText(d.open); return; }
  if (d.roudoku) { unlockSpeech(); openText(d.roudoku, true); return; }
  if (d.from) { const [pi, ti] = d.from.split(":").map(Number); $("#sheet").hidden = true;
    ttsStart(pi, Math.max(0, sentencesOf(pi).findIndex(r => ti >= r[0] && ti <= r[1]))); return; }
  if (d.act === "tts") { if (TTS.on) { ttsStop(); render(); } else ttsStart((S.progress[TEXT.id] || {}).p || 0, 0); return; }
  if (d.act === "tts-play") { if (TTS.playing) ttsPause(); else { TTS.playing = true; wake(true); render(); speakNow(); } return; }
  if (d.act === "tts-prev") { ttsStep(-1); return; }
  if (d.act === "tts-next") { ttsStep(1); return; }
  if (d.act === "tts-rate") { S.settings.rate = RATES[(RATES.indexOf(S.settings.rate) + 1) % RATES.length]; save(); render(); if (TTS.playing) speakNow(); return; }
  if (d.themeSet) { S.settings.theme = d.themeSet; save(); render(); return; }
  if (d.save) { const [pi, ti] = d.save.split(":").map(Number); toggleSave(pi, ti); return; }
  if (d.del) { delete S.words[d.del]; save(); render(); return; }
  if (d.grade) { grade(d.grade === "1"); return; }
  if (d.act === "close") { $("#sheet").hidden = true; return; }
  if (d.act === "back") { ttsStop(); view = "read"; TEXT = null; render(); window.scrollTo(0, 0); return; }
  if (d.act === "furi") { S.settings.furigana = !S.settings.furigana; save(); render(); return; }
  if (d.act === "vert") { S.settings.vertical = !S.settings.vertical; save(); render(); return; }
  if (d.act && d.act.startsWith("fs:")) { S.settings.fs = Math.max(15, Math.min(28, S.settings.fs + 2 * +d.act.slice(3))); save();
    document.querySelector(".text").style.setProperty("--fs", S.settings.fs + "px"); return; }
  if (d.act === "review") { startReview(); return; }
  if (d.act === "show") { shown = true; render(); return; }
});
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") $("#sheet").hidden = true; });

Promise.all([loadFeeds, loadLib]).then(() => { if (Object.keys(S.words).length) loadDict().then(() => view === "words" && render()); render(); });
render();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});

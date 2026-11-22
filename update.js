// Run by GitHub Actions a few times a day (see .github/workflows/update.yml); writes feeds.json for the app:
//   newsVideos: the latest videos of three official TV news channels
//   news:   today's NHK News Web headlines (title, link, time) from NHK's public RSS feed
//   comedy: recent uploads of 20 minutes or longer from the comedy channels below (YouTube channel RSS + video length)
// Only titles, links and lengths are stored; articles and videos stay on NHK's and YouTube's sites.
// usage: node update.js
const fs = require("fs");
const COMEDY = [
  ["UCIR2mQ77wHrLMreV45nYhgw", "かまいたちチャンネル"],
  ["UCpGpA7mSYmNJjLiJxKso5QA", "しもふりチューブ"],
  ["UCpCesuCH4UxIcy65gSrC0Pw", "チョコレートプラネット チャンネル"],
  ["UConIcs8o0z5vYTamGtq-Lsw", "東京03 Official"],
  ["UCNdhTKY9QYzeVQGF2xtaHKQ", "オードリーさん、ぜひ会ってほしい人がいるんです。"],
  ["UC1HFvQiR8x712JlMZftYfMA", "よしもと漫才劇場チャンネル"],
  ["UCmBBPR-gbgAUiBu29eFkVJw", "笑い飯笑月"],
];
// official news channels for the home-screen video (NHK has no official YouTube channel for daily news)
const NEWS_VIDEO = [
  ["UCuTAXTexrhetbOe3zgskJBQ", "日テレNEWS"],
  ["UC6AG81pAkf6Lbi_1VC5NmPA", "TBS NEWS DIG"],
  ["UCGCZAYq5Xxojl_tSXcVJhiQ", "ANNnewsCH"],
];
const MIN_SECONDS = 20 * 60;
// shorts, live streams and video-game playthroughs are not much to listen to in the car
const SKIP = /#shorts|生配信|ライブ配信|Live|実況|ゲーム|プレイ！|バイオハザード|エアライダー|エースコンバット/i;
const UA = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "ja-JP,ja;q=0.9" };
const get = async url => { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(url + " " + r.status); return r.text(); };
const unesc = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (xml, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(xml); return m ? unesc(m[1]) : ""; };

async function news() {
  const out = [];
  for (const cat of ["cat0", "cat1", "cat4", "cat6"]) {          // main, society, politics, international
    try {
      const xml = await get(`https://news.web.nhk/n-data/conf/na/rss/${cat}.xml`);
      for (const it of xml.split("<item>").slice(1)) {
        const link = tag(it, "link");
        if (!out.some(n => n.link === link)) out.push({ title: tag(it, "title"), link, time: new Date(tag(it, "pubDate")).toISOString() });
      }
    } catch (e) { console.log("news", cat, e.message); }
  }
  return out.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 40);
}

async function newsVideos() {
  const out = {};
  for (const [cid, name] of NEWS_VIDEO) {
    try {
      const xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`);
      out[name] = xml.split("<entry>").slice(1).map(e => ({ id: tag(e, "yt:videoId"), title: tag(e, "title"), published: tag(e, "published"), short: /\/shorts\//.test(e) || /#shorts/i.test(tag(e, "title")) }))
        .filter(v => !v.short).slice(0, 8).map(({ short, ...v }) => v);
    } catch (e) { console.log("news video", name, e.message); }
  }
  return out;
}

async function lengthOf(id) {
  try { const m = /"lengthSeconds":"(\d+)"/.exec(await get(`https://www.youtube.com/watch?v=${id}&hl=ja`)); return m ? +m[1] : null; }
  catch (e) { return null; }
}

async function comedy(previous) {
  const known = new Map((previous || []).map(v => [v.id, v]));
  const out = [];
  for (const [cid, name] of COMEDY) {
    let xml;
    try { xml = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`); } catch (e) { console.log("rss", name, e.message); continue; }
    for (const e of xml.split("<entry>").slice(1)) {
      const id = tag(e, "yt:videoId"), title = tag(e, "title"), published = tag(e, "published");
      if (SKIP.test(title)) continue;
      const secs = known.has(id) ? known.get(id).secs : await lengthOf(id);
      if (secs && secs >= MIN_SECONDS) out.push({ id, title, channel: name, published, secs });
    }
  }
  // keep older long videos too, so the list never empties out
  for (const v of previous || []) if (!out.some(o => o.id === v.id) && !SKIP.test(v.title)) out.push(v);
  return out.sort((a, b) => b.published.localeCompare(a.published)).slice(0, 60);
}

(async () => {
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync("feeds.json", "utf8")); } catch (e) {}
  const data = { updated: new Date().toISOString(), news: await news(), newsVideos: await newsVideos(), comedy: await comedy(prev.comedy) };
  if (!data.news.length && prev.news) data.news = prev.news;
  for (const k in prev.newsVideos || {}) if (!(data.newsVideos[k] || []).length) data.newsVideos[k] = prev.newsVideos[k];
  fs.writeFileSync("feeds.json", JSON.stringify(data, null, 1));
  console.log("news", data.news.length, "comedy", data.comedy.length);
})();

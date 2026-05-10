async function getLocalInfo() {
 const appConfig = {
  ver: 1,
  name: "AniMOTVSlash(本地)",
  api: "csp_Animotvslash_local",
 }
 return jsonify(appConfig)
}

/**
 * AniMOTVSlash - Anime Video Source
 * 站点: https://animotvslash.org
 * 特性: Base64 + JSON 解密视频链接
 */

function base64Decode(str) {
 try {
  if (typeof Buffer !== 'undefined') {
   return Buffer.from(str, 'base64').toString();
  } else if (typeof atob !== 'undefined') {
   return atob(str);
  } else {
   const CryptoJS = createCryptoJS();
   return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(str));
  }
 } catch (e) {
  return '';
 }
}

async function getConfig() {
 return jsonify({
  ver: 1,
  title: "AniMOTVSlash",
  site: "https://animotvslash.org",
  tabs: [
   { name: '最新更新', ext: { id: 'latest' } },
   { name: '动漫', ext: { id: 'anime' } }
  ]
 });
}

async function getCards(ext) {
 ext = argsify(ext);
 const { id, page = 1 } = ext;
 const site = "https://animotvslash.org";
 let url = site + "/";

 if (id === 'anime') {
  url = site + "/anime/";
 }

 if (page > 1) {
  url += (url.includes('?') ? '&' : '?') + 'page=' + page;
 }

 const { data } = await $fetch.get(url, {
  headers: {
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  }
 });

 const cheerio = createCheerio();
 const $ = cheerio.load(data);
 const list = [];
 const seen = new Set();

 // 匹配 article.bs 或 .bsx
 const items = $('article.bs, .bsx');

 items.each((i, el) => {
  const $el = $(el);
  const $link = $el.find('.bsx a, a.bsx').first();
  const vod_url = $link.attr('href');
  const vod_pic = $el.find('img').attr('src') || $el.find('img[data-src]').attr('data-src');
  const vod_name = $link.find('h2, .tt').text().trim() || $link.attr('title');
  const vod_remarks = $el.find('.epx, .episode').text().trim();

  // 去重：同一部剧只保留一个
  if (vod_url && vod_name && vod_url.includes(site) && !seen.has(vod_url)) {
   seen.add(vod_url);
   list.push({
    vod_id: vod_url,
    vod_name: vod_name,
    vod_pic: vod_pic || '',
    vod_remarks: vod_remarks || '',
    ext: { url: vod_url }
   });
  }
 });

 return jsonify({ list });
}

async function getTracks(ext) {
 ext = argsify(ext);
 const { url } = ext;

 const { data } = await $fetch.get(url, {
  headers: {
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }
 });

 const cheerio = createCheerio();
 const $ = cheerio.load(data);
 const tracks = [];

 // 匹配包含 episode- 的链接，按集数倒序
 const episodes = $('a[href*="episode-"]');

 if (episodes.length > 0) {
  const epMap = new Map();
  
  episodes.each((i, el) => {
   const $el = $(el);
   const ep_name = $el.text().trim();
   const ep_url = $el.attr('href');
   
   if (ep_name && ep_url && ep_name.length > 0) {
    // 提取集数用于排序
    const match = ep_url.match(/episode-(\d+)/);
    const epNum = match ? parseInt(match[1]) : i;
    epMap.set(epNum, { name: ep_name, ext: { url: ep_url } });
   }
  });

  // 按集数正序排列
  const sortedKeys = Array.from(epMap.keys()).sort((a, b) => a - b);
  sortedKeys.forEach(k => tracks.push(epMap.get(k)));
 }

 if (tracks.length === 0) {
  tracks.push({ name: '播放', ext: { url: url } });
 }

 return jsonify({
  list: [
   { title: '默认线路', tracks: tracks }
  ]
 });
}

async function getPlayinfo(ext) {
 ext = argsify(ext);
 const { url } = ext;

 const { data } = await $fetch.get(url, {
  headers: {
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }
 });

 const cheerio = createCheerio();
 const $ = cheerio.load(data);
 let playUrl = '';

 // 方法1: 从 iframe src 获取 player-embed 页面，再提取 m3u8
 let iframeSrc = $('iframe').attr('src') || '';
 iframeSrc = iframeSrc.replace(/&#038;/g, '&').replace(/&amp;/g, '&');
 
 if (iframeSrc.includes('player-embed')) {
  // 请求 player-embed 页面
  const embedData = await $fetch.get(iframeSrc, {
   headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': url,
   }
  });
  
  const embed$ = createCheerio().load(embedData.data);
  const source = embed$('source[type="application/x-mpegurl"]').attr('src');
  if (source) {
   playUrl = source;
  }
 }

 // 方法2: JSON-LD VideoObject
 if (!playUrl) {
  const ldJson = $('script[type="application/ld+json"]').html();
  if (ldJson) {
   try {
    const jsonData = argsify(ldJson);
    if (jsonData['@type'] === 'VideoObject' && jsonData.contentUrl) {
     const contentUrl = jsonData.contentUrl.replace(/\\+/g, '');
     if (contentUrl.includes('.m3u8') || contentUrl.includes('rumble.com')) {
      playUrl = contentUrl;
     }
    }
   } catch (e) {}
  }
 }

 if (!playUrl) {
  return jsonify({ urls: [], headers: [] });
 }

 // 构建正确的 Referer（指向 player-embed 页面）
 const referer = iframeSrc.includes('player-embed') ? iframeSrc : 'https://animotvslash.org/';

 return jsonify({
  urls: [playUrl],
  headers: [
   { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Referer': referer },
   { 'Origin': 'https://animotvslash.org' }
  ]
 });
}

async function search(ext) {
 ext = argsify(ext);
 const { text, page = 1 } = ext;
 const site = "https://animotvslash.org";

 let searchUrl = site + '/?s=' + encodeURIComponent(text);
 if (page > 1) {
  searchUrl += '&paged=' + page;
 }

 const { data } = await $fetch.get(searchUrl, {
  headers: {
   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
   'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }
 });

 const cheerio = createCheerio();
 const $ = cheerio.load(data);
 const list = [];

 const items = $('article.bs, .bsx');
 items.each((i, el) => {
  const $el = $(el);
  const $link = $el.find('.bsx a, a.bsx').first();
  const vod_url = $link.attr('href');
  const vod_pic = $el.find('img').attr('src') || $el.find('img[data-src]').attr('data-src');
  const vod_name = $link.find('h2, .tt').text().trim() || $link.attr('title');
  const vod_remarks = $el.find('.epx, .episode').text().trim();

  if (vod_url && vod_name && vod_url.includes(site)) {
   list.push({
    vod_id: vod_url,
    vod_name: vod_name,
    vod_pic: vod_pic || '',
    vod_remarks: vod_remarks || '',
    ext: { url: vod_url }
   });
  }
 });

 return jsonify({ list });
}
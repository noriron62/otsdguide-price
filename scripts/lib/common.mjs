// scripts/lib/common.mjs
//
// 複数商品サイトで共通して使うロジック一式。
// 商品ごとに異なる部分（検索キーワード、ブランド判定、箱数判定など）は
// scripts/products.config.mjs 側で定義し、ここでは使い回せる処理だけを置く。

const yenFmt = new Intl.NumberFormat("ja-JP");
export const yen = (n) => (typeof n === "number" ? yenFmt.format(n) : "-");

export const PLACEHOLDER_IMG =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dce8e5"/></svg>'
  );

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value ?? "");
  }
  return out;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 楽天APIへのアクセス間隔を、全商品・全リクエストを通じて管理する。
// 通常の安い順取得（複数ページ）に加え、価格帯を指定した追加取得も
// 行うようになったため、商品をまたいで立て続けにリクエストが飛ぶと
// 楽天側のレート制限（429 Too Many Requests）に引っかかることがある。
// そのため、実際にHTTPリクエストを送る直前に必ずこの関数を呼び、
// 前回の楽天APIリクエストから一定時間（1.1秒）空くようにする。
// （複数のリクエストがほぼ同時に発生しても取りこぼさないよう、
//   1本のPromiseチェーンに直列につなげて順番に処理する）
let lastRakutenCallAt = 0;
let rakutenChain = Promise.resolve();
const RAKUTEN_MIN_INTERVAL_MS = 1100;

// 商品ページを直接取得する際に使うUser-Agent（scrape-rx-free.mjs内の
// 定義と同じ値。ブラウザからのアクセスに見せかけることで、
// 一部サイトでのブロックを避けるため）。
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function throttleRakuten() {
  const next = rakutenChain.then(async () => {
    const elapsed = Date.now() - lastRakutenCallAt;
    if (elapsed < RAKUTEN_MIN_INTERVAL_MS) {
      await sleep(RAKUTEN_MIN_INTERVAL_MS - elapsed);
    }
    lastRakutenCallAt = Date.now();
  });
  rakutenChain = next.catch(() => {}); // エラーが起きてもチェーンが途切れないようにする
  return next;
}

/**
 * 商品ごとのテーマカラーを反映する<style>ブロックを生成する。
 * 共通のCSS(style.css)はそのままに、CSS変数だけを上書きする方式なので、
 * サイトごとに個別のCSSファイルを用意する必要がない。
 * theme = { accent: "#0C6E6B", gold: "#B8892B" } のような形で指定する
 * （指定が無い場合は style.css 側のデフォルト色がそのまま使われる）。
 */
export function renderThemeStyle(theme) {
  if (!theme) return "";
  const lines = [":root {"];
  if (theme.accent) {
    lines.push(`  --teal: ${theme.accent};`);
    lines.push(`  --teal-dim: ${theme.accent}1a;`);
  }
  if (theme.gold) {
    lines.push(`  --gold: ${theme.gold};`);
    lines.push(`  --gold-dim: ${theme.gold}14;`);
  }
  lines.push("}");
  if (lines.length <= 2) return ""; // 何も上書きしない場合
  return `<style>${lines.join("\n")}</style>`;
}

/**
 * 「送料別」「送料別途」のように、送料が商品価格に含まれていないことを
 * 明示している商品を判定する。楽天APIには postageFlag（送料込み限定）で
 * 対応できるが、Yahoo!側には同等の確実な絞り込み条件が見当たらないため、
 * 商品名・説明文のテキストから明示的な「送料別」表記を検出して除外する
 * （「送料無料」の記載が無いだけでは判定しない。無料と明記されていない
 * 商品の中には送料込みのものも多く、除外しすぎると該当件数が
 * 極端に減ってしまうため、あくまで明示的な「送料別」表記のみを対象にする）。
 */
export function hasSeparateShipping(text) {
  if (!text) return false;
  const n = text.replace(/\s/g, "");
  return /(送料別|送料別途|送料は別途|\+送料|送料が別途|別途送料)/.test(n);
}

/**
 * 商品名・説明文等に「送料無料」「送料込み」が明記されているかを判定する。
 * 楽天APIの postageFlag（常に無条件で送料無料の商品だけに1が立つ構造化データ）
 * による絞り込みをやめ、「3,000円以上で送料無料」のような条件付き送料無料の
 * ショップも取りこぼさないよう、テキストベースの判定に切り替えるために追加した。
 */
export function mentionsFreeShipping(text) {
  if (!text) return false;
  const n = text.replace(/\s/g, "");
  return /(送料無料|送料込み|送料こみ|送料込)/.test(n);
}

/** 全角数字(０-９)を半角に変換する。ショップによっては商品名の数字を
 *  全角で表記していることがあり(例:「２箱」)、半角前提の正規表現では
 *  拾えなくなってしまうため、判定処理の入り口でまとめて変換しておく。 */
function normalizeFullWidthDigits(n) {
  if (!n) return n;
  return n.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/**
 * 「見切り品」「訳あり」「アウトレット」「在庫処分」など、通常の
 * 販売価格ではない一時的な処分品を判定する。1個限定・在庫限りの
 * ケースが多く、継続的な最安値としてふさわしくないため除外する。
 */
export function isClearanceListing(name) {
  if (!name) return false;
  const n = name.replace(/\s/g, "");
  return /(見切り品|訳あり|わけあり|アウトレット|在庫処分|在庫限り|特価処分)/.test(n);
}

/**
 * 「2~12箱セット」「2箱 4箱 6箱 12箱」のように、購入時に複数の箱数から
 * 選べるタイプの商品を判定する。この手の商品はAPIが返す価格が
 * どの箱数に対応するものか特定できない（多くの場合、最小数量の価格）ため、
 * どの比較単位からも除外する対象として扱う。
 */
export function isAmbiguousMultiBoxListing(name) {
  if (!name) return false;
  const n = normalizeFullWidthDigits(name.replace(/\s/g, ""));
  // 「2~12箱」「2〜12箱」「2-12箱」のような範囲表記
  if (/\d+[~〜\-]\d+箱/.test(n)) return true;
  // 「2箱以上」のように、購入時の最低数量条件を示しているだけで、
  // この商品自体の内容量（何箱・何枚入りか）を表しているわけではない表記
  // （例:「受付条件2箱以上」）
  if (/\d+箱以上/.test(n)) return true;
  // 「2箱 4箱 6箱 12箱」のように、3種類以上の箱数がまとめて列挙されている場合
  const matches = n.match(/\d+箱/g) || [];
  const uniqueCounts = new Set(matches);
  if (uniqueCounts.size >= 3) return true;
  return false;
}

/**
 * 「2箱で送料無料」「2箱購入で送料無料」のような、購入数のしきい値を
 * 示すだけの販促文言を、箱数判定の対象から取り除く。
 */
export function stripShippingPromoText(n) {
  const normalized = normalizeFullWidthDigits(n);
  // 「2箱で送料無料」「2箱購入で送料無料」「2箱でポスト便送料無料」
  // 「2箱購入から送料無料」のように、「箱」と接続語(で/から)の間、
  // 接続語と「送料無料」の間、それぞれに別の単語が挟まる表記ゆれが
  // あるため、どちらの間にも短い語句が入ってよいようにする
  return normalized.replace(/\d箱.{0,10}?(で|から).{0,10}?送料無料/g, "");
}

/** 処方箋の提出が必要な商品を除外する */
export function isPrescriptionFree(text) {
  if (!text) return true;
  const n = text.replace(/\s/g, "");
  const requiresPrescription =
    /(処方箋あり|要処方箋|処方箋必要|処方箋提出|処方箋が必要|処方箋を提出)/;
  return !requiresPrescription.test(n);
}

/** 商品コード・URLに「-rx-」のような処方箋(Rx)を示す記号が含まれる場合に除外する */
export function hasRxCode(text) {
  if (!text) return false;
  return /(^|[^a-z0-9])rx([^a-z0-9]|$)/i.test(text);
}

/** 楽天市場から商品を取得する（フィルタ前の生データを返す。複数ページ・価格帯指定に対応） */
/**
 * 楽天APIへのfetchを行う。429（利用制限）が返ってきた場合、一時的な
 * 制限に達しただけの可能性が高いため、少し待ってから自動的に再試行する
 * （Yahoo!側に追加した仕組みと同じ考え方）。
 */
async function fetchRakutenWithRetry(url, options, retriesLeft = 3) {
  const res = await fetch(url, options);
  if (res.status === 429 && retriesLeft > 0) {
    const waitMs = 5000; // 楽天は「1秒後に再試行してください」と言われることが多いため、余裕を見て5秒待つ
    console.warn(
      `  [warn] 楽天API 429（利用制限）を検知。${waitMs / 1000}秒待って再試行します（残り${retriesLeft}回）`
    );
    await sleep(waitMs);
    return fetchRakutenWithRetry(url, options, retriesLeft - 1);
  }
  return res;
}

export async function fetchRakutenRaw({
  keyword,
  appId,
  accessKey,
  affiliateId,
  siteUrl,
  maxPages = 3, // 1ページ30件 × 3ページ = 最大90件取得する
  minPrice, // 指定すると、この価格以上の商品だけに絞り込んで取得できる
  maxPrice, // 指定すると、この価格以下の商品だけに絞り込んで取得できる
}) {
  if (!appId || !accessKey) {
    return { items: [], skipped: "RAKUTEN_APP_ID または RAKUTEN_ACCESS_KEY が未設定" };
  }

  const allItems = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(
      "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
    );
    url.searchParams.set("applicationId", appId);
    url.searchParams.set("accessKey", accessKey);
    if (affiliateId) {
      url.searchParams.set("affiliateId", affiliateId);
    }
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("sort", "+itemPrice");
    url.searchParams.set("hits", "30");
    url.searchParams.set("page", String(page));
    url.searchParams.set("imageFlag", "1");
    // postageFlag=1（常に無条件で送料無料の商品だけに絞り込む）は廃止した。
    // 「3,000円以上で送料無料」のような条件付き送料無料のショップが軒並み
    // 除外されてしまっていたため、代わりに applyCommonFilters 側の
    // テキストベースの判定（mentionsFreeShipping / hasSeparateShipping）で
    // 絞り込むようにしている。
    url.searchParams.set("formatVersion", "2");
    if (minPrice) url.searchParams.set("minPrice", String(Math.round(minPrice)));
    if (maxPrice) url.searchParams.set("maxPrice", String(Math.round(maxPrice)));

    await throttleRakuten(); // 前回の楽天APIリクエストから一定時間空ける
    const res = await fetchRakutenWithRetry(url, {
      headers: { Origin: siteUrl, Referer: siteUrl },
    });
    if (!res.ok) {
      if (page === 1) {
        throw new Error(`楽天API failed: ${res.status} ${await res.text()}`);
      }
      break; // 2ページ目以降の失敗は、1ページ目の結果だけ使って続行する
    }
    const json = await res.json();
    const items = json.Items || [];
    allItems.push(...items);
    if (items.length < 30) break; // これ以上ページが無い
  }

  return { items: allItems, skipped: null };
}

/**
 * 商品コード(itemCode、「ショップコード:商品URLコード」形式。例:
 * "aiaimarket:bl-biotrue1dmf-30-04"）を指定して、その商品1件だけを
 * ピンポイントで取得する。楽天APIのキーワード検索に、なぜか特定の
 * ショップが出てこないことがある問題への対策として、商品コードによる
 * 直接指定を使う（unit.manualListings.rakuten の各エントリで、
 * price の代わりに itemCode を指定すると、この関数で毎回自動的に
 * 最新価格を取得する）。
 */
export async function fetchRakutenByItemCode(itemCode, { appId, accessKey, affiliateId, siteUrl, moshimo }) {
  if (!appId || !accessKey) return null;
  const url = new URL(
    "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701"
  );
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("accessKey", accessKey);
  if (affiliateId) url.searchParams.set("affiliateId", affiliateId);
  url.searchParams.set("itemCode", itemCode);
  url.searchParams.set("hits", "1");
  url.searchParams.set("imageFlag", "1");
  url.searchParams.set("formatVersion", "2");

  await throttleRakuten();
  const res = await fetchRakutenWithRetry(url, {
    headers: { Origin: siteUrl, Referer: siteUrl },
  });
  if (!res.ok) {
    console.warn(`  [warn] itemCode指定の取得に失敗（HTTP ${res.status}）: ${itemCode}`);
    return null;
  }
  const json = await res.json();
  const item = (json.Items || [])[0];
  if (!item) {
    console.warn(`  [warn] itemCode指定の商品が見つかりませんでした: ${itemCode}`);
    return null;
  }
  return normalizeRakutenItem(item, { affiliateId, moshimo });
}

/**
 * 楽天の商品ページURL(例: https://item.rakuten.co.jp/aiaimarket/xxx/)から、
 * 商品コード(itemCode、「ショップコード:商品番号」形式)を自動抽出する。
 *
 * 楽天の商品ページには、商品番号がURLのスラッグ(見た目の名前)とは別に、
 * アクセス解析用のトラッキングURL(item_id=数字)や、お気に入り登録用の
 * リンク(iid=数字)の中に、生のHTML上でだけ埋め込まれている。ページの
 * 見た目のテキストだけを抽出するツールでは見えないが、生のHTMLをそのまま
 * 取得するこの関数(サーバー側のfetch)でなら、正規表現で拾い出せる。
 *
 * ショップコードはURLのパス(item.rakuten.co.jp/【ここ】/...)からそのまま
 * 取り出せるので、両方を組み合わせて itemCode を組み立てる。
 */
export async function resolveRakutenItemCodeFromPageUrl(pageUrl, { siteUrl } = {}) {
  try {
    const shopMatch = pageUrl.match(/item\.rakuten\.co\.jp\/([^/]+)\//);
    if (!shopMatch) {
      console.warn(`  [warn] URLからショップコードを取り出せませんでした: ${pageUrl}`);
      return null;
    }
    const shopCode = shopMatch[1];

    // 楽天API(fetchRakutenRaw)への呼び出しと同じヘッダー構成にする。
    // 商品ページへの単純なfetchだけではボット対策で弾かれる（42文字の
    // 「Reference #...」というブロックページが返る）ことが分かったため、
    // Origin/Refererを付けることで通常のブラウザからのアクセスに
    // 近づける（それでも弾かれる可能性はある）。
    const headers = { "User-Agent": USER_AGENT };
    if (siteUrl) {
      headers.Origin = siteUrl;
      headers.Referer = siteUrl;
    }
    const res = await fetch(pageUrl, { headers });
    if (!res.ok) {
      console.warn(`  [warn] 商品コード抽出用のページ取得に失敗（HTTP ${res.status}）: ${pageUrl}`);
      return null;
    }
    const html = await res.text();
    // item_id=1234 / iid=1234 のどちらかのパターンで商品番号を探す
    const idMatch = html.match(/[?&](?:item_id|iid)=(\d+)/);
    if (!idMatch) {
      // 原因切り分けのため、実際に何が取得できたのかをログに残す
      // （ボット対策等で、狙ったページと違う内容が返ってきていないか確認するため）
      console.warn(
        `  [warn] ページ内から商品番号を見つけられませんでした: ${pageUrl}\n` +
          `    HTTPステータス: ${res.status} / 取得したHTMLの長さ: ${html.length}文字\n` +
          `    先頭200文字: ${html.slice(0, 200).replace(/\s+/g, " ")}`
      );
      return null;
    }
    const itemCode = `${shopCode}:${idMatch[1]}`;
    console.log(`  [debug] ページURLから商品コードを自動抽出: ${pageUrl} → ${itemCode}`);
    return itemCode;
  } catch (err) {
    console.warn(`  [warn] 商品コード抽出中にエラー: ${pageUrl} (${err.message})`);
    return null;
  }
}

/**
 * 楽天の「検索結果ページ」を直接取得し、商品を抽出する（APIを使わない）。
 *
 * 楽天のキーワード検索API(IchibaItem/Search)が、なぜか特定のショップを
 * 検索結果に含めてくれないことがある一方、検索結果ページ自体には
 * その商品が載っていることが確認できたための実験的な対策。
 *
 * ※このサイトでは通常、公式APIを優先して使う方針としている。この関数は
 * 「APIが返してこない商品を見つけ出す」という限定的な目的のためだけに、
 * 商品ページの生HTMLを直接読み取る。ページの内部構造（クラス名など）に
 * 依存しないよう、URLと価格の位置関係だけを手がかりにした緩めの
 * 正規表現で抽出しているため、楽天側のページ構成が変わると抽出できなく
 * なる可能性がある（その場合は空配列を返し、警告ログを出す）。
 */
export async function scrapeRakutenSearchPage(keyword, { minPrice, maxPrice, page = 1 } = {}) {
  try {
    const url = new URL(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(keyword)}/`);
    // s=11 は「安い順(価格)」でのソート（検索結果ページの並び替えリンクから確認した値）
    url.searchParams.set("s", "11");
    if (page > 1) url.searchParams.set("p", String(page));
    if (minPrice) url.searchParams.set("min", String(Math.round(minPrice)));
    if (maxPrice) url.searchParams.set("max", String(Math.round(maxPrice)));

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      console.warn(`  [warn] 検索結果ページの取得に失敗（HTTP ${res.status}）: ${url}`);
      return [];
    }
    const html = await res.text();

    // 商品ページへのリンク(href="https://item.rakuten.co.jp/ショップ/商品/...")を
    // すべて拾い、それぞれのリンクの近く(前後2,000文字以内)に出てくる
    // 価格(「◯◯円」)と、商品名らしき文字列(img要素のalt属性、または
    // リンクのtitle属性のうち、一番長いもの)を、その商品の情報とみなす。
    const linkPattern = /href="(https:\/\/item\.rakuten\.co\.jp\/([a-zA-Z0-9_-]+)\/([^/"?]+)\/?)[^"]*"/g;
    const seen = new Set();
    const results = [];
    let match;
    while ((match = linkPattern.exec(html)) !== null) {
      const [, fullUrlRaw, shopCode, itemSlug] = match;
      const itemUrl = `https://item.rakuten.co.jp/${shopCode}/${itemSlug}/`;
      if (seen.has(itemUrl)) continue;

      const windowStart = Math.max(0, match.index - 500);
      const windowEnd = Math.min(html.length, match.index + 2000);
      const nearby = html.slice(windowStart, windowEnd);

      const priceMatch = nearby.match(/([\d,，]{3,8})\s*円/);
      if (!priceMatch) continue;
      const price = Number(priceMatch[1].replace(/[,，]/g, ""));
      if (!price || price < 100) continue; // ポイント数などの誤検出を除外

      // alt属性・title属性の中から、一番長い文字列を商品名とみなす
      // （短いものは「もっと見る」等のUI文言である可能性が高いため）
      const nameCandidates = [...nearby.matchAll(/(?:alt|title)="([^"]{10,300})"/g)].map((m) => m[1]);
      const name = nameCandidates.sort((a, b) => b.length - a.length)[0] || null;

      seen.add(itemUrl);
      results.push({ shop: shopCode, name, price, url: itemUrl });
    }

    console.log(
      `  [debug] 検索結果ページから直接抽出: ${url} → ${results.length}件` +
        (results.length ? ` (例: ${results[0].shop} ¥${results[0].price} 「${(results[0].name || "").slice(0, 20)}」)` : "")
    );
    return results;
  } catch (err) {
    console.warn(`  [warn] 検索結果ページのスクレイピング中にエラー: ${keyword} (${err.message})`);
    return [];
  }
}

/**
 * Yahoo!ショッピングAPIへのfetchを行う。429（Too Many Requests）が返ってきた場合、
 * Yahoo側の「1アプリケーションIDにつき1分間30リクエスト」という利用制限に
 * 一時的に達しただけの可能性が高いため、少し待ってから自動的に再試行する。
 * （商品数が増え、複数商品ぶんのリクエストが累積すると起きやすくなる）
 */
async function fetchYahooWithRetry(url, retriesLeft = 3) {
  const res = await fetch(url);
  if (res.status === 429 && retriesLeft > 0) {
    const waitMs = 20000; // 20秒待つ（1分間のリクエストカウントがリセットされるのを待つ）
    console.warn(
      `  [warn] Yahoo API 429（利用制限）を検知。${waitMs / 1000}秒待って再試行します（残り${retriesLeft}回）`
    );
    await sleep(waitMs);
    return fetchYahooWithRetry(url, retriesLeft - 1);
  }
  return res;
}

/** Yahoo!ショッピングから商品を取得する（フィルタ前の生データを返す。複数ページ・価格帯指定に対応） */
export async function fetchYahooRaw({
  keyword,
  clientId,
  maxPages = 3,
  minPrice,
  maxPrice,
}) {
  if (!clientId) {
    return { items: [], skipped: "YAHOO_CLIENT_ID が未設定" };
  }

  const allItems = [];
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(
      "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch"
    );
    url.searchParams.set("appid", clientId);
    url.searchParams.set("query", keyword);
    url.searchParams.set("sort", "+price");
    url.searchParams.set("results", "30");
    url.searchParams.set("start", String(page * 30 + 1));
    url.searchParams.set("shipping", "free"); // 送料無料の商品だけに絞り込む
    if (minPrice) url.searchParams.set("price_from", String(Math.round(minPrice)));
    if (maxPrice) url.searchParams.set("price_to", String(Math.round(maxPrice)));

    const res = await fetchYahooWithRetry(url);
    if (!res.ok) {
      if (page === 0) {
        throw new Error(`Yahoo API failed: ${res.status} ${await res.text()}`);
      }
      break;
    }
    const json = await res.json();
    const items = json.hits || [];
    allItems.push(...items);
    if (items.length < 30) break;
  }

  return { items: allItems, skipped: null };
}

/** 楽天の生アイテムを共通形式に変換する */
export function normalizeRakutenItem(item, { affiliateId, moshimo }) {
  return {
    source: "楽天市場",
    name: item.itemName,
    caption: item.itemCaption,
    catchcopy: item.catchcopy,
    itemCode: item.itemCode,
    shop: item.shopName,
    price: item.itemPrice,
    url: toRakutenAffiliateUrl(item, { affiliateId, moshimo }),
    reviewUrl: item.itemUrl,
    reviewCount: typeof item.reviewCount === "number" ? item.reviewCount : null,
    reviewAverage: typeof item.reviewAverage === "number" ? item.reviewAverage : null,
    image:
      item.mediumImageUrls && item.mediumImageUrls[0] ? item.mediumImageUrls[0] : null,
  };
}

/** Yahoo!の生アイテムを共通形式に変換する */
export function normalizeYahooItem(item, { valuecommerce }) {
  return {
    source: "Yahoo!ショッピング",
    name: item.name,
    caption: item.description,
    catchcopy: item.headLine,
    itemCode: item.code,
    shop: item.seller && item.seller.name ? item.seller.name : "Yahoo!ショッピング",
    price: item.price,
    url: toYahooAffiliateUrl(item.url, valuecommerce),
    reviewUrl: item.url,
    reviewCount:
      item.review && typeof item.review.count === "number" ? item.review.count : null,
    reviewAverage:
      item.review && typeof item.review.rate === "number" ? item.review.rate : null,
    image: item.image && item.image.medium ? item.image.medium : null,
  };
}

function toRakutenAffiliateUrl(item, { affiliateId, moshimo }) {
  if (affiliateId && item.affiliateUrl) {
    return item.affiliateUrl;
  }
  const itemUrl = item.itemUrl;
  if (!moshimo || !moshimo.aId || !moshimo.pId || !moshimo.pcId || !moshimo.plId) {
    return itemUrl;
  }
  const encoded = encodeURIComponent(itemUrl);
  return (
    `https://af.moshimo.com/af/c/click?a_id=${moshimo.aId}` +
    `&p_id=${moshimo.pId}&pc_id=${moshimo.pcId}&pl_id=${moshimo.plId}` +
    `&url=${encoded}`
  );
}

function toYahooAffiliateUrl(itemUrl, valuecommerce) {
  if (!valuecommerce || !valuecommerce.sid || !valuecommerce.pid) {
    return itemUrl;
  }
  const encoded = encodeURIComponent(itemUrl);
  return (
    `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${valuecommerce.sid}` +
    `&pid=${valuecommerce.pid}&vc_url=${encoded}`
  );
}

/** 共通フィルタ（処方箋あり・Rxコード）を適用する */
export function applyCommonFilters(items) {
  return items.filter(
    (item) =>
      isPrescriptionFree(item.name) &&
      isPrescriptionFree(item.caption) &&
      isPrescriptionFree(item.catchcopy) &&
      !hasRxCode(item.itemCode) &&
      !hasRxCode(item.reviewUrl) &&
      !isAmbiguousMultiBoxListing(item.name) &&
      !isClearanceListing(item.name) &&
      !hasSeparateShipping(item.name) &&
      !hasSeparateShipping(item.caption) &&
      !hasSeparateShipping(item.catchcopy) &&
      // Yahoo!ショッピングはAPI自体が shipping=free で送料無料の商品だけに
      // 絞り込み済みのため、テキストでの「送料無料」明記チェックは
      // 楽天市場の商品にのみ課す（楽天は postageFlag=1 を廃止したため、
      // 代わりにテキストで判定している）
      (item.source !== "楽天市場" ||
        mentionsFreeShipping(item.name) ||
        mentionsFreeShipping(item.caption) ||
        mentionsFreeShipping(item.catchcopy))
  );
}

/** 価格の安い順に並べ替え、単価を付与して上位N件を作る
 *  lensesPerBox: 「1箱あたり」表示の基準となる、実際の1箱の枚数
 *  （デフォルト30枚。シードのように1箱32枚の商品は呼び出し側で指定する） */
export function buildRanking(items, totalLenses, topN = 5, lensesPerBox = 30) {
  const boxesOfStandard = totalLenses / lensesPerBox;
  return items
    .filter((i) => typeof i.price === "number" && i.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, topN)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
      unitPrice: Math.round(item.price / totalLenses),
      // 総合最安値の判定には、四捨五入後の値ではなくこちらを使う
      // （四捨五入すると同額になり、比較の順序次第で本来より高い方が
      // 「最安値」として選ばれてしまうことがあるため）
      rawUnitPrice: item.price / totalLenses,
      boxUnitPrice: Math.round(item.price / boxesOfStandard),
      lensesPerBox,
    }));
}

function formatReviewMeta(item) {
  if (!item || !item.reviewCount) return "";
  const avg = typeof item.reviewAverage === "number" ? item.reviewAverage.toFixed(1) : null;
  return avg
    ? ` (★${avg}・${item.reviewCount.toLocaleString("ja-JP")}件のレビュー)`
    : ` (${item.reviewCount.toLocaleString("ja-JP")}件のレビュー)`;
}

/** 1件分のランキング行のHTMLを生成する */
export function renderRow(item) {
  const img = item.image || PLACEHOLDER_IMG;
  const lensesPerBox = item.lensesPerBox || 30;
  return `      <a class="row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener sponsored" data-rank="${item.rank}">
        <span class="rank">${String(item.rank).padStart(2, "0")}</span>
        <img class="thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />
        <span class="row-info">
          <p class="shop-name">${escapeHtml(item.shop)}</p>
          <p class="unit-prices">
            1箱(${lensesPerBox}枚)あたり <strong>¥${yen(item.boxUnitPrice)}</strong>
            ・ 1枚あたり <strong>¥${yen(item.unitPrice)}</strong>
          </p>
        </span>
        <span class="price">¥${yen(item.price)}</span>
      </a>`;
}

/** ランキング一覧（0件なら案内文）のHTMLを生成する */
export function renderList(items) {
  if (!items || items.length === 0) {
    return '      <p class="empty">該当する商品が見つかりませんでした。</p>';
  }
  return items.map(renderRow).join("\n");
}

/** 1つの比較単位（例:「6箱」）ぶんの見出し＋楽天/Yahoo!2列のHTMLを生成する */
export function renderUnitSection(unit, rakutenItems, yahooItems, otherShopsHtml = "") {
  return `  ${unit.introHtml || ""}
  <section class="shop-section" aria-label="楽天市場ランキング(${escapeHtml(unit.label)})">
    <h2 class="shop-heading"><span class="shop-mark rakuten">楽天</span>楽天市場 ${escapeHtml(unit.label)} 最安値TOP5</h2>
    <div class="chart">
${renderList(rakutenItems)}
    </div>
  </section>

  <section class="shop-section" aria-label="Yahoo!ショッピングランキング(${escapeHtml(unit.label)})">
    <h2 class="shop-heading"><span class="shop-mark yahoo">Yahoo!</span>Yahoo!ショッピング ${escapeHtml(unit.label)} 最安値TOP5</h2>
    <div class="chart">
${renderList(yahooItems)}
    </div>
  </section>
${otherShopsHtml}
`;
}

/**
 * 「その他のショップ」セクションを生成する。楽天・Yahoo!以外の独自サイト
 * (処方箋あり・なし問わず、運営者が個別に確認して手動登録したショップ)を
 * 表示する。該当ショップが無い場合は空文字を返す（セクション自体を
 * 表示しない）。
 */
export function renderOtherShopsSection(unit, otherShopItems) {
  if (!otherShopItems || otherShopItems.length === 0) return "";
  return `  <section class="shop-section" aria-label="その他のショップ(${escapeHtml(unit.label)})">
    <h2 class="shop-heading"><span class="shop-mark other">その他</span>その他のショップ ${escapeHtml(unit.label)}</h2>
    <p class="other-shops-note">※ 楽天市場・Yahoo!ショッピング以外の、運営者が個別に確認したショップです。</p>
    <div class="chart">
${renderList(otherShopItems)}
    </div>
  </section>
`;
}

/** 口コミ情報セクションのリンクHTMLを生成する（楽天・Yahoo!それぞれの最安値商品を両方表示する） */
export function renderReviewLinks(rakutenTop, yahooTop) {
  if (!rakutenTop && !yahooTop) {
    return '      <li class="empty">現在ご案内できる口コミリンクがありません。</li>';
  }
  const links = [];
  if (rakutenTop) {
    links.push(`      <li>
        <a href="${escapeHtml(rakutenTop.reviewUrl || rakutenTop.url)}" target="_blank" rel="noopener">
          <span class="shop-mark rakuten">楽天</span>
          ${escapeHtml(rakutenTop.shop)}の商品ページで口コミを見る${escapeHtml(formatReviewMeta(rakutenTop))}
        </a>
      </li>`);
  }
  if (yahooTop) {
    links.push(`      <li>
        <a href="${escapeHtml(yahooTop.reviewUrl || yahooTop.url)}" target="_blank" rel="noopener">
          <span class="shop-mark yahoo">Yahoo!</span>
          ${escapeHtml(yahooTop.shop)}の商品ページで口コミを見る${escapeHtml(formatReviewMeta(yahooTop))}
        </a>
      </li>`);
  }
  return links.join("\n");
}

/** 「本日の総合最安値」セクションのHTMLを生成する（データが無ければ空文字） */
export function renderHeroSection(item, heroLabel, heroName) {
  if (!item) return "";
  const lensesPerBox = item.lensesPerBox || 30;
  return `  <section class="hero">
    <p class="hero-label">${escapeHtml(heroLabel)}</p>
    <p class="hero-price"><span class="yen">¥</span><span>${yen(item.price)}</span></p>
    <p class="hero-unit">1箱(${lensesPerBox}枚)あたり ${yen(item.boxUnitPrice)}円 ・ 1枚あたり ${yen(item.unitPrice)}円</p>
    <div class="hero-meta">
      <span class="hero-name">${escapeHtml(heroName)}</span>
      <span class="badge">${escapeHtml(item.source)} ・ ${escapeHtml(item.shop)}</span>
    </div>
    <a class="hero-cta" href="${escapeHtml(item.url)}" target="_blank" rel="noopener sponsored">
      このショップで見る →
    </a>
  </section>`;
}

export function formatUpdatedText(updatedAt) {
  if (!updatedAt) return "";
  const d = new Date(updatedAt);
  const formatted = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(d);
  return `最終更新: ${formatted}`;
}

/** パンくずリストの構造化データ（BreadcrumbList）を生成する */
export function buildBreadcrumbJsonLd({ siteBaseUrl, productName, productUrl }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${siteBaseUrl}/` },
      { "@type": "ListItem", position: 2, name: productName, item: productUrl },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

/**
 * 「処方箋不要」専門ショップ(レンズモード・レンズラボ等)の比較セクションを
 * 生成する。shopResults は [{ name, shippingFor, quantities: [{ qty, productPrice, affiliateUrl }] }] の形。
 * 価格が取得できなかった(productPriceがnull)組み合わせはセルごと非表示にする。
 */
export function renderRxFreeSection({ productName, quantities, shopResults }) {
  // 全ショップ×全数量の中から、1枚あたり単価が最も安い組み合わせを探す
  // （標準サイズ=1箱30枚として計算）
  let best = null;
  for (const shop of shopResults) {
    for (const q of shop.quantities) {
      if (q.productPrice === null) continue;
      const total = q.productPrice + shop.shippingFor(q.qty);
      const unitPrice = total / (q.qty * 30);
      if (!best || unitPrice < best.unitPrice) {
        best = { shopName: shop.name, qty: q.qty, total, unitPrice, affiliateUrl: q.affiliateUrl };
      }
    }
  }

  const heroHtml = best
    ? `  <section class="hero" style="margin-bottom:20px;">
    <p class="hero-label">本日の処方箋不要 総合最安値（1枚あたり）</p>
    <p class="hero-price"><span class="yen">¥</span><span>${yen(best.total)}</span></p>
    <p class="hero-unit">1箱(30枚)あたり ¥${yen(Math.round(best.total / best.qty))} ・ 1枚あたり ¥${Math.round(best.unitPrice)}</p>
    <div class="hero-meta">
      <span class="hero-name">${escapeHtml(productName)} ${best.qty}箱セット(${best.qty * 30}枚・送料込み)</span>
      <span class="badge">${escapeHtml(best.shopName)}</span>
    </div>
    <a class="hero-cta" href="${escapeHtml(best.affiliateUrl)}" target="_blank" rel="noopener sponsored">
      このショップで見る →
    </a>
  </section>`
    : "";

  // 数量ごとに、どのショップが最安かを求める(「最安」バッジ用)
  const bestShopByQty = {};
  for (const qty of quantities) {
    let cheapest = null;
    for (const shop of shopResults) {
      const q = shop.quantities.find((x) => x.qty === qty);
      if (!q || q.productPrice === null) continue;
      const total = q.productPrice + shop.shippingFor(qty);
      if (!cheapest || total < cheapest.total) cheapest = { shopName: shop.name, total };
    }
    if (cheapest) bestShopByQty[qty] = cheapest.shopName;
  }

  const shopCardsHtml = shopResults
    .map((shop) => {
      const cellsHtml = quantities
        .map((qty) => {
          const q = shop.quantities.find((x) => x.qty === qty);
          if (!q) {
            // そもそもその箱数の取り扱いが無いショップ（設定自体が存在しない）
            return `        <div class="rx-price-cell" style="opacity:.5;">
          <div class="unit">${qty}箱(送料込み)</div><div class="unit-note">該当ありません</div>
        </div>`;
          }
          if (q.productPrice === null) {
            // 取り扱いはあるはずだが、今回の取得に失敗した場合
            return `        <div class="rx-price-cell" style="opacity:.5;">
          <div class="unit">${qty}箱(送料込み)</div><div class="unit-note">現在取得できません</div>
        </div>`;
          }
          const shipping = shop.shippingFor(qty);
          const total = q.productPrice + shipping;
          const perBox = Math.round(total / qty);
          const isBest = bestShopByQty[qty] === shop.name;
          return `        <a class="rx-price-cell${isBest ? " best" : ""}" href="${escapeHtml(q.affiliateUrl)}" target="_blank" rel="noopener sponsored">
          <div class="unit">${qty}箱(送料込み)</div><div class="price">¥${yen(total)}</div><div class="unit-note">1箱あたり¥${yen(perBox)}</div><div class="per-box">商品¥${yen(q.productPrice)}+送料¥${yen(shipping)}</div>
        </a>`;
        })
        .join("\n");
      return `    <div class="rx-shop-card">
      <p class="shop-title">🟢 ${escapeHtml(shop.name)}</p>
      <div class="rx-price-grid">
${cellsHtml}
      </div>
    </div>`;
    })
    .join("\n\n");

  return `${heroHtml}

  <section class="value-explainer" aria-label="処方箋不要ショップの箱数別価格">
    <span class="rx-free-badge">処方箋不要で購入できるショップ</span>
    <p>
      下記2ショップは、商品ページ上で明確に「処方箋不要」と案内している専門ショップです。
      <strong>確実に処方箋なしで購入したい方</strong>には、こちらがおすすめです。
      価格は送料込みで比較しています。
    </p>

${shopCardsHtml}

    <p class="note">
      ※ 上記は標準サイズ(30枚入り)1箱あたりの価格です。送料が別途かかる場合、商品ページに記載の送料を含めた金額を掲載しています。
      表示価格は取得時点のものであり、実際のご購入時点の価格とは異なる場合があります。
    </p>
  </section>`;
}

/** 構造化データ（JSON-LD, schema.org Product）を生成する */
export function buildJsonLd({ productName, siteName, allItems, brandName }) {
  if (allItems.length === 0) return "";

  const offers = allItems.map((item) => ({
    "@type": "Offer",
    url: item.url,
    price: item.price,
    priceCurrency: "JPY",
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: item.shop },
  }));

  const withReviews = allItems.filter((i) => i.reviewCount && i.reviewAverage);
  let aggregateRating;
  if (withReviews.length > 0) {
    const totalCount = withReviews.reduce((sum, i) => sum + i.reviewCount, 0);
    const weightedAvg =
      withReviews.reduce((sum, i) => sum + i.reviewAverage * i.reviewCount, 0) / totalCount;
    aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(weightedAvg.toFixed(2)),
      reviewCount: totalCount,
    };
  }

  const json = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    description: siteName,
    brand: { "@type": "Brand", name: brandName || "ACUVUE" },
    ...(aggregateRating ? { aggregateRating } : {}),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "JPY",
      lowPrice: Math.min(...allItems.map((i) => i.price)),
      highPrice: Math.max(...allItems.map((i) => i.price)),
      offerCount: offers.length,
      offers,
    },
  };

  return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
}

// ---- 価格推移（履歴）機能 ----

const PRICE_HISTORY_MAX_DAYS = 30;

/** JST基準の「今日の日付」文字列(YYYY-MM-DD)を取得する */
export function todayJstDateString() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  // "sv-SE"(スウェーデン)ロケールはYYYY-MM-DD形式を返すのでそのまま使えるため採用
}

/**
 * 価格履歴に、今日ぶんのレコードを追加・更新する。
 * 同じ日付のレコードが既にある場合は、より安い方を採用する
 * （1日2回実行されるため、片方だけ安ければそちらを残す）。
 * 直近 PRICE_HISTORY_MAX_DAYS 日分だけを保持する。
 */
export function updatePriceHistory(history, todayEntry) {
  const list = Array.isArray(history) ? [...history] : [];
  const idx = list.findIndex((h) => h.date === todayEntry.date);
  if (idx === -1) {
    list.push(todayEntry);
  } else if (todayEntry.price < list[idx].price) {
    list[idx] = todayEntry;
  }
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  return list.slice(-PRICE_HISTORY_MAX_DAYS);
}

function historyMarkClass(source) {
  if (source === "楽天市場") return "rakuten";
  if (source === "Yahoo!ショッピング") return "yahoo";
  return "other";
}
function historyMarkLabel(source) {
  if (source === "楽天市場") return "楽天";
  if (source === "Yahoo!ショッピング") return "Yahoo!";
  return "その他";
}
function historyDotColor(source) {
  // グラフ上の点は、楽天=赤・Yahoo!=青・その他=グレーで塗り分ける
  // （文字表記のYahoo!ブランドピンクと、赤系の楽天色が近く見分けにくいため、
  //   点の色だけは視認性を優先して青にしている）
  if (source === "楽天市場") return "#bf0000";
  if (source === "Yahoo!ショッピング") return "#1D5C99";
  return "#6b7280";
}

/** 折れ線グラフ(SVG)を生成する */
function renderHistoryChart(history) {
  const W = 640;
  const H = 240;
  const PAD_L = 40;
  const PAD_R = 20;
  const PAD_T = 36; // 点の上に金額ラベルを出すため、上の余白を広めに取る
  const PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const prices = history.map((h) => h.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const rawRange = rawMax - rawMin;
  // 期間中まったく価格が変わらない（または変動がごくわずかな）場合、
  // そのままだと計算上すべての点が最下段に張り付いてしまうため、
  // 上下に一定の余白（パディング）を設けて、見やすい高さに表示する。
  const padding = rawRange > 0 ? rawRange * 0.25 : Math.max(rawMax * 0.03, 5);
  const vMin = rawMin - padding;
  const vMax = rawMax + padding;
  const vRange = vMax - vMin || 1;

  const xAt = (i) => PAD_L + (chartW * i) / Math.max(history.length - 1, 1);
  const yAt = (v) => PAD_T + chartH * (1 - (v - vMin) / vRange);

  const points = history.map((h, i) => [xAt(i), yAt(h.price)]);
  const pathD = "M " + points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");

  // 点が多いと金額ラベルが重なって読めなくなるため、件数が少ない時は
  // 全点に、多い時は「最初・最後・最安値・最高値」だけに絞ってラベルを出す
  const labelIdxs = new Set();
  if (history.length <= 12) {
    history.forEach((_, i) => labelIdxs.add(i));
  } else {
    labelIdxs.add(0);
    labelIdxs.add(history.length - 1);
    labelIdxs.add(prices.indexOf(rawMin));
    labelIdxs.add(prices.lastIndexOf(rawMax));
  }

  const dots = history
    .map((h, i) => {
      const [x, y] = points[i];
      const r = 7;
      let labelSvg = "";
      if (labelIdxs.has(i)) {
        // 山（周りより高い）の点はラベルを下に、それ以外は上に出して重なりを減らす
        const prevY = i > 0 ? points[i - 1][1] : y;
        const nextY = i < points.length - 1 ? points[i + 1][1] : y;
        const isPeak = y <= prevY && y <= nextY;
        const labelY = isPeak ? y + r + 16 : y - r - 8;
        labelSvg = `<text x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="middle" font-family="var(--mono)">${h.price.toLocaleString("ja-JP")}</text>`;
      }
      return `${labelSvg}\n  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${historyDotColor(h.source)}" />`;
    })
    .join("\n");

  // X軸ラベルは5件おき＋最終日
  const xLabelIdxs = new Set();
  for (let i = 0; i < history.length; i += 5) xLabelIdxs.add(i);
  xLabelIdxs.add(history.length - 1);
  const xLabels = [...xLabelIdxs]
    .map((i) => {
      const [x] = points[i];
      const d = new Date(history[i].date);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      return `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="11" fill="var(--ink-soft)" text-anchor="middle" font-family="var(--mono)">${label}</text>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
  <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + chartH}" stroke="var(--line)" stroke-width="1.5" />
  <line x1="${PAD_L}" y1="${PAD_T + chartH}" x2="${W - PAD_R}" y2="${PAD_T + chartH}" stroke="var(--line)" stroke-width="1.5" />
  <path d="${pathD}" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  ${dots}
  ${xLabels}
</svg>`;
}

function formatHistoryDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
function formatHistoryDateShort(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 「価格推移」セクションのHTMLを生成する。
 * history[].price は、その日の総合最安値を1箱(lensesPerBox枚)換算した
 * 価格として記録されている（箱数によって日ごとに一番お得な単位が
 * 入れ替わりうるため、固定の単位ではなく「実質的に一番お得だった
 * 1箱あたりの価格」を追いかける設計になっている）。
 */
export function renderPriceHistorySection({ history, productName, boxDivisor, lensesPerBox = 30 }) {
  if (!history || history.length < 2) {
    return ""; // データが少なすぎる間は非表示にする
  }

  const todayEntry = history[history.length - 1];
  const startEntry = history[0];
  const minEntry = history.reduce((a, b) => (b.price < a.price ? b : a));
  const maxEntry = history.reduce((a, b) => (b.price > a.price ? b : a));

  const diffBox = startEntry.price - todayEntry.price;

  let summarySentence;
  if (diffBox === 0) {
    summarySentence = `今日は${history.length}日前と比べて、1箱(${lensesPerBox}枚)あたりの価格は変わっていません(¥${yen(todayEntry.price)})。`;
  } else {
    const diffWord = diffBox > 0 ? "安くなっています" : "高くなっています";
    summarySentence =
      `今日は${history.length}日前と比べて、1箱(${lensesPerBox}枚)あたり<strong>¥${yen(Math.abs(diffBox))}</strong>${diffWord}` +
      `(¥${yen(startEntry.price)} → ¥${yen(todayEntry.price)})。`;
  }

  const unitNote = (entry) => (entry.unitLabel ? `<span class="history-unit-note">(${escapeHtml(entry.unitLabel)}が最安)</span>` : "");

  const statCard = (label, entry, { clickable = false } = {}) => {
    const inner = `
      <p class="label">${escapeHtml(label)}</p>
      <p class="value">¥${yen(entry.price)} <span class="unit-suffix">/ 1箱(${lensesPerBox}枚)</span></p>
      <p class="sub"><span class="shop-mark ${historyMarkClass(entry.source)}">${historyMarkLabel(entry.source)}</span> ${
        clickable ? escapeHtml(entry.shop) : formatHistoryDateShort(entry.date)
      } ${unitNote(entry)}</p>`;
    return clickable
      ? `<a class="history-stat today" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener sponsored"><span class="cta-arrow">→</span>${inner}</a>`
      : `<div class="history-stat">${inner}</div>`;
  };

  const rows = history
    .slice()
    .reverse()
    .map(
      (h) => `      <div class="history-row">
        <span class="history-date">${formatHistoryDateShort(h.date)}</span>
        <span class="history-shop"><span class="shop-mark ${historyMarkClass(h.source)}">${historyMarkLabel(h.source)}</span> ${escapeHtml(h.shop)}</span>
        <span class="history-prices">
          <span class="history-total">¥${yen(h.price)}<span class="unit-suffix">/1箱</span></span>
          ${unitNote(h)}
        </span>
      </div>`
    )
    .join("\n");

  return `  <section class="value-explainer" aria-label="価格推移">
    <h2 class="section-heading">${escapeHtml(productName)} 1箱(${lensesPerBox}枚)あたり実質最安値の過去${history.length}日間の推移</h2>

    <div class="history-summary">
      ${statCard("本日の最安値", todayEntry, { clickable: true })}
      ${statCard(`過去${history.length}日間の最安値`, minEntry)}
      ${statCard(`過去${history.length}日間の最高値`, maxEntry)}
    </div>
    <p class="history-note">↑「本日の最安値」はクリックするとショップの購入ページへ移動します</p>

    <p class="history-summary-text">
      ${summarySentence}
    </p>

    ${renderHistoryChart(history)}

    <p class="history-note">
      ○ 印は期間内の最安値のタイミングです。折れ線上の点の色は、その日最安だったモール(<span style="color:#bf0000;">●</span>楽天 / <span style="color:#1D5C99;">●</span><span style="color:#ff0033;">Yahoo!</span>)を表しています。価格は、その日もっともお得だった購入単位を1箱(${lensesPerBox}枚)あたりに換算した金額です(購入単位はカッコ内に表示しています)。
    </p>

    <h3 class="history-list-heading">日別の価格一覧</h3>
    <div class="history-list">
${rows}
    </div>
  </section>`;
}

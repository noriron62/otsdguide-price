// scripts/lib/scrape-rx-free.mjs
//
// レンズモード・レンズラボのような「処方箋不要」専門ショップは、
// 楽天/Yahoo!のような公式APIが無いため、商品ページのHTMLを直接取得して
// 価格を読み取る（スクレイピング）方式で対応する。
//
// サイトごとにページの作りが異なる可能性が高いため、複数の抽出方法を
// 順番に試し、どれかが成功すればその値を使う、という作りにしている。
// 万一どの方法でも価格が取れなかった場合は null を返し、その商品は
// 表示から除外する（存在しない値を表示するよりは安全なため）。

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** 文字列中の「¥1,234」「1,234円」のような表記から数値を取り出す */
function parseYen(text) {
  if (!text) return null;
  const cleaned = text.replace(/[,，]/g, "");
  const m = cleaned.match(/(\d{2,7})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * HTML中から価格らしき数値を、複数の方法を順番に試して抽出する。
 * expectedQty を渡すと、「1箱あたり」表記しか見つからないサイト
 * （例: レンズラボ）でも、単価×箱数で合計金額を計算できる。
 *
 * 1. 「1箱あたり」直後の¥表記 × 箱数（最も信頼できる。サイトによっては
 *    構造化データが箱数に関わらず固定値を返すことがあるため、これを優先する）
 * 2. schema.org の JSON-LD
 * 3. schema.org の itemprop="price" 属性
 * 4. OGP系の価格メタタグ
 * 5. 「販売価格」「税込価格」等のラベル直後に出てくる¥表記（最終手段）
 */
export function extractPrice(html, { expectedQty } = {}) {
  // 1. 「1箱あたり」直後の¥表記（単価）× 箱数
  if (expectedQty) {
    const perBoxMatch = html.match(/1箱あたり[^\d¥￥]{0,5}[¥￥]\s*([\d,，]{3,8})/);
    if (perBoxMatch) {
      const perBox = parseYen(perBoxMatch[1]);
      if (perBox) return { price: perBox * expectedQty, method: `1箱あたり×${expectedQty}` };
    }
  }

  // 2. JSON-LD
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        const offers = item?.offers || item?.Offers;
        const priceRaw = offers?.price ?? offers?.[0]?.price ?? item?.price;
        const price = typeof priceRaw === "string" ? parseYen(priceRaw) : priceRaw;
        if (typeof price === "number" && price > 0) return { price: Math.round(price), method: "JSON-LD" };
      }
    } catch {
      // JSON-LDの形式が想定と違う場合はスキップして次の方法を試す
    }
  }

  // 3. schema.orgのitemprop="price"属性
  const itempropMatch = html.match(
    /itemprop=["']price["'][^>]*(?:content=["']([\d.,]+)["']|>([\s\d,，円¥]{1,12}))/i
  );
  if (itempropMatch) {
    const price = parseYen(itempropMatch[1] || itempropMatch[2]);
    if (price) return { price, method: "itemprop" };
  }

  // 4. OGPの価格メタタグ
  const metaMatch = html.match(
    /<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([\d.,]+)["']/i
  );
  if (metaMatch) {
    const price = parseYen(metaMatch[1]);
    if (price) return { price, method: "OGPメタタグ" };
  }

  // 5. 「販売価格」「税込価格」等のラベル直後の¥表記（最終手段）
  const labelMatch = html.match(
    /(?:販売価格|税込価格|税込|通常価格|商品価格|価格)[^\d¥￥]{0,20}[¥￥]?\s*([\d,，]{3,8})\s*円?/
  );
  if (labelMatch) {
    const price = parseYen(labelMatch[1]);
    if (price) return { price, method: "ラベル直後" };
  }

  return { price: null, method: null };
}

/**
 * デバッグ用: ページ内に出てくる「¥1,234」「1,234円」のような表記を
 * 前後の文脈つきで最大5件抽出する（抽出に失敗した際、次回のログで
 * ページの実際の中身をある程度確認できるようにするため）。
 */
function debugYenCandidates(html) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); // タグを除去し、テキストだけにする
  const matches = [...text.matchAll(/.{0,15}[¥￥][\d,，]{3,8}.{0,10}|.{0,15}[\d,，]{3,8}\s*円.{0,10}/g)];
  return matches.slice(0, 5).map((m) => m[0].trim());
}

/** 指定URLのページを取得し、価格を抽出する。取得・抽出に失敗した場合は null を返す。
 *  expectedQty を渡すと、「1箱あたり」表記から合計金額を計算できる。 */
export async function scrapeShopPrice(url, expectedQty) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.warn(`  [warn] 処方箋不要ショップの取得に失敗（HTTP ${res.status}）: ${url}`);
      return null;
    }
    const html = await res.text();
    const { price, method } = extractPrice(html, { expectedQty });

    // 常に候補を表示しておく（成功時も、想定と違う値を拾っていないか
    // 目視確認できるようにするため）
    const candidates = debugYenCandidates(html);
    console.log(
      `  [debug] ${url}\n` +
        `    抽出結果: ${price !== null ? `¥${price}（方法: ${method}）` : "抽出失敗"}\n` +
        `    ページ内の¥候補: ${candidates.length ? candidates.join(" / ") : "見つからず"}`
    );

    if (price === null) {
      console.warn(`  [warn] 処方箋不要ショップのページから価格を抽出できませんでした: ${url}`);
    }
    return price;
  } catch (err) {
    console.warn(`  [warn] 処方箋不要ショップの取得中にエラー: ${url} (${err.message})`);
    return null;
  }
}

/**
 * 「処方箋不要」専門店とは別に、「楽天でもYahoo!でもない、独自の
 * 通販サイト」(処方箋あり・なし問わず)の価格を取得するための関数。
 * サイトによって「¥1,234」ではなく「1,234円税込」のような表記を
 * 使っていることがあるため、rx-free専用のextractPriceとは別に、
 * こちらは「数字+円」という表記も対象に含めた、より広めの抽出を行う。
 * （rx-free側の抽出ロジックを汚染しないよう、あえて分離している）
 *
 * itemCode を渡すと、ページ内でその商品コードが最初に出てくる位置より
 * 「後ろ」だけを検索対象にする。ページ上部のクーポンバナー等に含まれる
 * 無関係な「◯◯円」表記（例:「500円OFFクーポン」）を、実際の商品価格と
 * 誤認しないようにするための対策。
 */
export function extractGenericYenPrice(html, { itemCode } = {}) {
  // 1. JSON-LD（他の抽出と同様、最も信頼できる場合はこちらを優先する）
  const jsonLdBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        const offers = item?.offers || item?.Offers;
        const priceRaw = offers?.price ?? offers?.[0]?.price ?? item?.price;
        const price = typeof priceRaw === "string" ? parseYen(priceRaw) : priceRaw;
        if (typeof price === "number" && price > 0) return { price: Math.round(price), method: "JSON-LD" };
      }
    } catch {
      // JSON-LDの形式が想定と違う場合はスキップ
    }
  }

  // 商品コードが出てくる位置より前の部分（ヘッダー・クーポンバナー等）は
  // 検索対象から除外する
  let searchTarget = html;
  if (itemCode) {
    const idx = html.indexOf(itemCode);
    if (idx !== -1) searchTarget = html.slice(idx);
  }

  // 2. 「1,234円税込」「1,234円（税込）」のように、数字の直後に「円」が
  // 付く表記（検索対象の中で最初に見つかったものを採用する）
  const yenSuffixMatch = searchTarget.match(/([\d,，]{3,8})\s*円\s*(?:\(?税込\)?)?/);
  if (yenSuffixMatch) {
    const price = parseYen(yenSuffixMatch[1]);
    if (price) return { price, method: "円表記" };
  }

  return { price: null, method: null };
}

/** 「その他のショップ」の価格を取得する（extractGenericYenPriceを使う点のみ rx-free 用と異なる） */
export async function scrapeOtherShopPrice(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.warn(`  [warn] その他のショップの取得に失敗（HTTP ${res.status}）: ${url}`);
      return null;
    }
    const html = await res.text();
    // URLの末尾（例: K_AL_DT90Z0_01_H.html）から商品コードを取り出し、
    // その商品コードがページ内に出てくる位置より後ろだけを検索対象にする
    const itemCodeMatch = url.match(/\/([^/]+)\.html?$/i);
    const itemCode = itemCodeMatch ? itemCodeMatch[1] : null;
    const { price, method } = extractGenericYenPrice(html, { itemCode });
    console.log(
      price !== null
        ? `  [debug] ${url} 抽出結果: ¥${price}（方法: ${method}）`
        : `  [debug] ${url} 抽出失敗`
    );
    if (price === null) {
      console.warn(`  [warn] その他のショップのページから価格を抽出できませんでした: ${url}`);
    }
    return price;
  } catch (err) {
    console.warn(`  [warn] その他のショップの取得中にエラー: ${url} (${err.message})`);
    return null;
  }
}

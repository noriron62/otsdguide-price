// scripts/lib/fetch-product-data.mjs
//
// 商品1件ぶんの価格データ(楽天市場・Yahoo!ショッピング・処方箋不要ショップ)を
// 取得し、生データ(オブジェクト)として返すモジュール。
//
// oasisu(newmediagallery.org)の scripts/build-all.mjs 内 buildOneProduct()
// のデータ取得部分をそのまま移植し、HTML生成呼び出し(renderXxxSection系)だけ
// 取り除いたもの。otsdguide.org は1ページに複数商品(標準品・マルチフォーカル)
// をまとめて表示する構成のため、HTML生成は呼び出し側(build-otsdguide.mjs)で
// 別途まとめて行う。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { scrapeShopPrice, scrapeOtherShopPrice } from "./scrape-rx-free.mjs";
import {
  fetchRakutenRaw,
  fetchYahooRaw,
  scrapeRakutenSearchPage,
  resolveRakutenItemCodeFromPageUrl,
  fetchRakutenByItemCode,
  normalizeRakutenItem,
  normalizeYahooItem,
  applyCommonFilters,
  buildRanking,
  todayJstDateString,
  updatePriceHistory,
} from "./common.mjs";

export async function fetchProductPriceData(product, { SITE_BASE_URL, RAKUTEN_APP_ID, RAKUTEN_ACCESS_KEY, RAKUTEN_AFFILIATE_ID, YAHOO_CLIENT_ID, MOSHIMO, VALUECOMMERCE, ROOT }) {
  const siteUrl = `${SITE_BASE_URL}/${product.slug}/`;

  const [rakutenResult, yahooResult] = await Promise.all([
    fetchRakutenRaw({
      keyword: product.searchKeyword,
      appId: RAKUTEN_APP_ID,
      accessKey: RAKUTEN_ACCESS_KEY,
      affiliateId: RAKUTEN_AFFILIATE_ID,
      siteUrl,
    }),
    fetchYahooRaw({ keyword: product.searchKeyword, clientId: YAHOO_CLIENT_ID }),
  ]);

  if (rakutenResult.skipped) console.warn(`  [skip] 楽天: ${rakutenResult.skipped}`);
  if (yahooResult.skipped) console.warn(`  [skip] Yahoo!: ${yahooResult.skipped}`);

  let rakutenRawItems = rakutenResult.items;
  let yahooRawItems = yahooResult.items;

  // 比較単位に priceHint（想定価格帯）が設定されている場合、その価格帯を
  // 直接指定した追加取得を行う。安い順の取得だけでは、単価の安い商品が
  // 大量にあると、まとめ買い商品が取得件数の範囲外に埋もれてしまうことが
  // あるため、価格帯を直接指定して確実に拾えるようにする。
  const hintedUnits = product.units.filter((u) => u.priceHint);
  if (hintedUnits.length > 0) {
    const seenRakutenCodes = new Set(rakutenRawItems.map((i) => i.itemCode || i.itemUrl));
    const seenYahooCodes = new Set(yahooRawItems.map((i) => i.code || i.url));

    const hintedResults = await Promise.all(
      hintedUnits.flatMap((unit) => {
        // unit.hintedKeywords（配列）を指定すると、複数のキーワードで
        // それぞれ検索し、結果をすべて合流させる。表記ゆれ（例:
        // 「ワンデー」の有無）でAPIの検索結果に出てこないショップを
        // 拾うための仕組み。単一の hintedKeyword のみ指定した場合は
        // 従来通り1種類のキーワードだけで検索する。
        const keywords = unit.hintedKeywords || [unit.hintedKeyword || product.searchKeyword];
        return keywords.flatMap((keyword) => [
          fetchRakutenRaw({
            // 比較単位ごとに unit.hintedKeyword を指定した場合、価格帯指定の
            // 追加取得だけそのキーワードで検索する。同じ価格帯に類似の
            //他ユニット商品が大量にあり、通常のキーワードでは埋もれてしまう
            // ケース（例: 96枚×2箱が32枚×4箱セットに埋もれる）向けの仕組み。
            keyword,
            appId: RAKUTEN_APP_ID,
            accessKey: RAKUTEN_ACCESS_KEY,
            affiliateId: RAKUTEN_AFFILIATE_ID,
            siteUrl,
            maxPages: 5,
            minPrice: unit.priceHint.min,
            maxPrice: unit.priceHint.max,
          }).then((r) => ({ source: "rakuten", unit: unit.key, ...r })),
          fetchYahooRaw({
            keyword,
            clientId: YAHOO_CLIENT_ID,
            maxPages: 5,
            minPrice: unit.priceHint.min,
            maxPrice: unit.priceHint.max,
          }).then((r) => ({ source: "yahoo", unit: unit.key, ...r })),
        ]);
      })
    );

    for (const result of hintedResults) {
      if (result.source === "rakuten") {
        const newItems = result.items.filter(
          (i) => !seenRakutenCodes.has(i.itemCode || i.itemUrl)
        );
        for (const i of newItems) seenRakutenCodes.add(i.itemCode || i.itemUrl);
        rakutenRawItems = rakutenRawItems.concat(newItems);
      } else {
        const newItems = result.items.filter((i) => !seenYahooCodes.has(i.code || i.url));
        for (const i of newItems) seenYahooCodes.add(i.code || i.url);
        yahooRawItems = yahooRawItems.concat(newItems);
      }
    }
    console.log(
      `  [debug] 価格帯指定の追加取得: 楽天+${rakutenRawItems.length - rakutenResult.items.length}件 / Yahoo!+${yahooRawItems.length - yahooResult.items.length}件`
    );

    // 診断用ログ：どの比較単位の価格帯ヒントで、実際に何件見つかったか
    // 個別に確認できるようにする（「0件」の原因調査に使う）
    for (let i = 0; i < hintedUnits.length; i++) {
      const unit = hintedUnits[i];
      const rakutenHint = hintedResults[i * 2];
      const yahooHint = hintedResults[i * 2 + 1];
      console.log(
        `    [debug] ${unit.label}のヒント(¥${unit.priceHint.min}〜¥${unit.priceHint.max}): 楽天${rakutenHint.items.length}件 / Yahoo!${yahooHint.items.length}件`
      );
      for (const item of rakutenHint.items.slice(0, 5)) {
        console.log(`      [楽天/${unit.label}ヒント] ¥${item.itemPrice} ${item.itemName}`);
      }
      for (const item of yahooHint.items.slice(0, 5)) {
        console.log(`      [Yahoo!/${unit.label}ヒント] ¥${item.price} ${item.name}`);
      }
    }
  }

  const rakutenItems = applyCommonFilters(
    rakutenRawItems
      .filter((i) => product.isCorrectProduct(i.itemName))
      .map((i) => normalizeRakutenItem(i, { affiliateId: RAKUTEN_AFFILIATE_ID, moshimo: MOSHIMO }))
  );
  const yahooItems = applyCommonFilters(
    yahooRawItems
      .filter((i) => product.isCorrectProduct(i.name))
      .map((i) => normalizeYahooItem(i, { valuecommerce: VALUECOMMERCE }))
  );

  // 診断用ログ：ブランド判定・処方箋フィルタ後、比較単位への振り分け前の
  // 総数と商品名サンプルを出しておく（「該当0件」の原因調査に使う）
  console.log(
    `  [debug] ブランド判定後の件数: 楽天${rakutenItems.length}件 / Yahoo!${yahooItems.length}件`
  );
  for (const item of rakutenItems.slice(0, 5)) {
    console.log(`    [楽天] ¥${item.price} ${item.name}`);
  }
  for (const item of yahooItems.slice(0, 5)) {
    console.log(`    [Yahoo!] ¥${item.price} ${item.name}`);
  }
  // 「〇箱」という文字列を含む商品だけをピンポイントで抽出する
  // （全件のうち、実際にどんな箱数表記があるのか確認するため）
  const withBoxCount = [...rakutenItems, ...yahooItems].filter((i) =>
    /\d箱/.test((i.name || "").replace(/\s/g, ""))
  );
  console.log(`  [debug] 「〇箱」を含む商品: ${withBoxCount.length}件`);
  for (const item of withBoxCount.slice(0, 15)) {
    console.log(`    [${item.source}] ¥${item.price} ${item.name}`);
  }

  // 商品ごとの比較単位（例: 90枚×2箱／90枚1箱）ごとにランキングを作る。
  // 単位は配列の順番に処理し、先に該当した商品は後の単位では重複して
  // 拾わないようにする（例: 「90枚×2箱セット」に該当した商品が
  // 「90枚1箱」側にも二重計上されるのを防ぐ）。
  const claimedRakuten = new Set();
  const claimedYahoo = new Set();
  const itemKey = (item) => `${item.shop}__${item.price}__${item.url}`;

  const unitResults = [];
  for (const unit of product.units) {
    const rakutenCandidates = rakutenItems.filter(
      (i) => !claimedRakuten.has(itemKey(i)) && unit.matches(i.name, i.price)
    );
    const yahooCandidates = yahooItems.filter(
      (i) => !claimedYahoo.has(itemKey(i)) && unit.matches(i.name, i.price)
    );

    // 【実験的機能】楽天のキーワード検索API(IchibaItem/Search)が、なぜか
    // 特定のショップを検索結果に含めてくれないことがある問題への対策。
    // unit.enableSearchPageScrape: true を指定した比較単位だけ、公式APIを
    // 使わず検索結果ページを直接読み取り、そこで見つかった商品も候補に
    // 加える。ページの内部構造に依存した緩い抽出のため、既存の商品には
    // 影響が出ないよう、明示的に有効化した単位でしか動かない。
    if (unit.enableSearchPageScrape && unit.priceHint) {
      const scraped = await scrapeRakutenSearchPage(unit.hintedKeyword || product.searchKeyword, {
        minPrice: unit.priceHint.min,
        maxPrice: unit.priceHint.max,
      });
      for (const s of scraped) {
        if (!s.name) continue; // 商品名を抽出できなかったものは判定できないため除外
        if (!product.isCorrectProduct(s.name)) continue;
        if (!unit.matches(s.name, s.price)) continue;
        rakutenCandidates.push({
          source: "楽天市場",
          name: s.name,
          price: s.price,
          url: s.url,
          shop: s.shop,
          caption: "",
          catchcopy: "",
        });
      }
    }

    // APIの検索結果に、たまたま毎回出てこないショップがあった場合の救済策。
    // unit.manualListings に手動で登録しておくと、API結果に合流させる。
    // 各エントリは次の3通りのいずれかを指定できる:
    //   price    … 固定値（手動更新）
    //   itemCode … 商品コードで毎回自動的に最新価格を取得
    //   pageUrl  … 商品ページのURLから商品コードを自動で見つけ出したうえで、
    //              毎回自動的に最新価格を取得（itemCodeが分からない場合の
    //              入り口。一度見つけた商品コードは変わらないことが多いが、
    //              念のため毎回解決し直す）
    if (unit.manualListings) {
      for (const m of unit.manualListings.rakuten || []) {
        let itemCode = m.itemCode;
        if (!itemCode && m.pageUrl) {
          itemCode = await resolveRakutenItemCodeFromPageUrl(m.pageUrl, { siteUrl });
        }
        if (itemCode) {
          const fetched = await fetchRakutenByItemCode(itemCode, {
            appId: RAKUTEN_APP_ID,
            accessKey: RAKUTEN_ACCESS_KEY,
            affiliateId: RAKUTEN_AFFILIATE_ID,
            siteUrl,
          });
          console.log(
            fetched
              ? `  [manualListings/itemCode] ${itemCode}: ¥${fetched.price}（自動取得）`
              : `  [manualListings/itemCode] ${itemCode}: 取得失敗`
          );
          if (fetched) {
            // itemCode指定の場合、店舗名・アフィリエイトリンク・画像は
            // APIから取得したものをそのまま使う（設定で上書きされていれば
            // そちらを優先する）。
            rakutenCandidates.push({ ...fetched, ...(m.shop ? { shop: m.shop } : {}) });
          }
        } else {
          rakutenCandidates.push({ ...m, source: "楽天市場" });
        }
      }
      for (const m of unit.manualListings.yahoo || []) {
        yahooCandidates.push({ ...m, source: "Yahoo!ショッピング" });
      }
    }

    for (const i of rakutenCandidates) claimedRakuten.add(itemKey(i));
    for (const i of yahooCandidates) claimedYahoo.add(itemKey(i));

    const topN = product.rankingTopN || 5;
    const rakutenRanking = buildRanking(rakutenCandidates, unit.totalLenses, topN, product.lensesPerBox || 30);
    const yahooRanking = buildRanking(yahooCandidates, unit.totalLenses, topN, product.lensesPerBox || 30);
    unitResults.push({ unit, rakutenRanking, yahooRanking });
  }

  // ---- 「その他のショップ」(楽天/Yahoo!以外の独自サイト)の価格取得 ----
  // unit.otherShops に設定がある比較単位だけ対象にする。
  // 「総合最安値」の比較対象にも含めるため、楽天/Yahoo!の総合最安値計算より
  // 前にここで取得しておく。
  const otherShopsRankedByUnitKey = {};
  for (const unit of product.units) {
    if (!unit.otherShops || unit.otherShops.length === 0) continue;
    const items = [];
    for (const shop of unit.otherShops) {
      const price =
        typeof shop.staticPrice === "number" ? shop.staticPrice : await scrapeOtherShopPrice(shop.scrapeUrl);
      console.log(
        price !== null
          ? `  [その他のショップ] ${shop.shop} ${unit.label}: ¥${price}${typeof shop.staticPrice === "number" ? "（固定値）" : ""}`
          : `  [その他のショップ] ${shop.shop} ${unit.label}: 取得失敗`
      );
      if (price === null) continue;
      items.push({ shop: shop.shop, price, url: shop.affiliateUrl, source: "その他のショップ", image: shop.image });
    }
    // 通常の楽天/Yahoo!ランキングと同じ関数(buildRanking)に通すことで、
    // 順位・1箱あたり単価・1枚あたり単価を正しく計算する
    // （直接pushしただけでは、これらの項目がundefinedのままになってしまう）。
    otherShopsRankedByUnitKey[unit.key] = buildRanking(items, unit.totalLenses, items.length, product.lensesPerBox || 30);
  }

  // 「総合最安値」は、特定の比較単位に固定するのではなく、
  // 全ユニット(1箱・2箱・6箱など)の最安値候補の中から、
  // 1枚あたり単価(rawUnitPrice、四捨五入前の値)が最も安いものを選ぶ。
  // 四捨五入後のunitPriceで比較すると、同額になった際に配列内で先に
  // 出てくるユニットが残ってしまい、実際にはわずかに安い方を見逃す
  // ことがあるため、必ず四捨五入前の値で比較する。
  // 「その他のショップ」(アットレンズ等)も、同じページ内に掲載している以上、
  // 「最安値」と謳うからには比較対象に含める（楽天/Yahoo!だけで計算すると、
  // 実際にはその他のショップの方が安いのに矛盾した表示になってしまうため）。
  let overallBest = null;
  let overallBestUnit = null;
  let overallBestUnitResult = null;
  for (const unitResult of unitResults) {
    const { unit, rakutenRanking, yahooRanking } = unitResult;
    const otherShopBest = (otherShopsRankedByUnitKey[unit.key] || [])[0];
    for (const candidate of [rakutenRanking[0], yahooRanking[0], otherShopBest]) {
      if (!candidate) continue;
      if (!overallBest || candidate.rawUnitPrice < overallBest.rawUnitPrice) {
        overallBest = candidate;
        overallBestUnit = unit;
        overallBestUnitResult = unitResult;
      }
    }
  }

  const updatedAt = new Date().toISOString();
  const outDir = path.join(ROOT, product.outputDir);
  await mkdir(outDir, { recursive: true });

  // ---- 処方箋不要ショップ(レンズモード・レンズラボ等)の価格取得 ----
  // rxFreeShops が設定されている商品だけ対象にする。
  // 公式APIが無いため、商品ページを直接取得して価格を読み取る。
  let rxFreeShopResults = null;
  let rxFreeBestForHistory = null; // 価格推移データ用（別枠で記録する）
  let rxFreeHistory = [];
  if (product.rxFreeShops) {
    const { quantities, shops } = product.rxFreeShops;
    const shopResults = [];
    for (const shop of shops) {
      const shopQuantities = [];
      for (const qty of quantities) {
        const page = shop.pages[qty];
        if (!page) continue;
        const price =
          typeof page.staticPrice === "number" ? page.staticPrice : await scrapeShopPrice(page.scrapeUrl, qty);
        console.log(
          price !== null
            ? `  [処方箋不要] ${shop.name} ${qty}箱: ¥${price}${typeof page.staticPrice === "number" ? "（固定値）" : ""}`
            : `  [処方箋不要] ${shop.name} ${qty}箱: 取得失敗`
        );
        shopQuantities.push({ qty, productPrice: price, affiliateUrl: page.affiliateUrl });
      }
      shopResults.push({ name: shop.name, shippingFor: shop.shippingFor, quantities: shopQuantities });
    }
    rxFreeShopResults = { quantities, shopResults };

    // 総合最安値(処方箋不要側)を、価格推移グラフ用に先に控えておく
    for (const shop of shopResults) {
      for (const q of shop.quantities) {
        if (q.productPrice === null) continue;
        const total = q.productPrice + shop.shippingFor(q.qty);
        const rawUnitPrice = total / (q.qty * 30);
        if (!rxFreeBestForHistory || rawUnitPrice < rxFreeBestForHistory.rawUnitPrice) {
          rxFreeBestForHistory = {
            rawUnitPrice,
            unitPrice: Math.round(rawUnitPrice),
            price: Math.round(total / q.qty),
            shop: shop.name,
            source: shop.name,
            url: q.affiliateUrl,
            unitLabel: `${q.qty}箱`,
          };
        }
      }
    }

    // 処方箋不要ショップの価格推移も、処方箋あり側とは別ファイルで
    // 独立して記録する（両者は買い方の体験が異なるため、あえて1つの
    // グラフにまとめず、別々のグラフとして持たせる）。
    if (rxFreeBestForHistory) {
      const rxHistoryPath = path.join(outDir, "price-history-rxfree.json");
      try {
        rxFreeHistory = JSON.parse(await readFile(rxHistoryPath, "utf-8"));
        if (rxFreeHistory.some((h) => !h.unitLabel)) rxFreeHistory = [];
      } catch {
        rxFreeHistory = [];
      }
      rxFreeHistory = updatePriceHistory(rxFreeHistory, {
        date: todayJstDateString(),
        price: rxFreeBestForHistory.price,
        unitLabel: rxFreeBestForHistory.unitLabel,
        source: rxFreeBestForHistory.source,
        shop: rxFreeBestForHistory.shop,
        url: rxFreeBestForHistory.url,
      });
      await writeFile(rxHistoryPath, JSON.stringify(rxFreeHistory, null, 2), "utf-8");
    }
  }

  // ---- 楽天/Yahoo!側の価格推移（履歴）の更新 ----
  // 箱数によって日ごとに「一番お得な単位」が入れ替わりうるため、固定の
  // 比較単位を追い続けるのではなく、その日の総合最安値(overallBest)を
  // 1箱換算した価格を docs-xxx/price-history.json に記録していく。
  let history = [];
  if (overallBest && overallBestUnit) {
    const lensesPerBox = product.lensesPerBox || 30;
    const perBoxPrice = Math.round(overallBest.rawUnitPrice * lensesPerBox);

    const historyPath = path.join(outDir, "price-history.json");
    try {
      history = JSON.parse(await readFile(historyPath, "utf-8"));
      if (history.some((h) => !h.unitLabel)) history = [];
    } catch {
      history = [];
    }

    history = updatePriceHistory(history, {
      date: todayJstDateString(),
      price: perBoxPrice,
      unitLabel: overallBestUnit.label,
      source: overallBest.source,
      shop: overallBest.shop,
      url: overallBest.url,
    });

    await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
  }

  return {
    product,
    updatedAt,
    unitResults, // [{ unit, rakutenRanking, yahooRanking }]
    otherShopsRankedByUnitKey,
    overallBest,
    overallBestUnit,
    overallBestUnitResult,
    rxFreeShopResults, // { quantities, shopResults } または null
    rxFreeBestForHistory,
    rxFreeHistory, // 処方箋不要側の価格推移(直近30日分)
    history, // 楽天/Yahoo側の価格推移(直近30日分)
  };
}

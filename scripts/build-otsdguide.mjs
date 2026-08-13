// scripts/build-otsdguide.mjs
//
// otsdguide.org(プロクリアワンデー通販激安最安値情報)の index.html を生成する。
//
// oasisu(newmediagallery.org)側の build-all.mjs と異なり、otsdguide.org は
// 「1つのHTMLページに標準品(otsdguide-proclear)とマルチフォーカル
// (otsdguide-proclear-multifocal)の両方をまとめて表示する」設計(旧サイトの
// page/3/ 構造を踏襲)のため、専用のビルドスクリプトとして分けている。
//
// 環境変数(GitHub ActionsのSecrets、oasisu側と共通のものをそのまま使う想定):
//   SITE_BASE_URL / RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / RAKUTEN_AFFILIATE_ID
//   YAHOO_CLIENT_ID / MOSHIMO_A_ID / MOSHIMO_P_ID / MOSHIMO_PC_ID / MOSHIMO_PL_ID
//   VALUECOMMERCE_SID / VALUECOMMERCE_PID

import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { products } from "./products.config.mjs";
import { fetchProductPriceData } from "./lib/fetch-product-data.mjs";
import {
  renderRxFreeRankTable,
  renderRakutenYahooRankTable,
  renderTalkBubble,
  renderSoukatsuBox,
  pickRxFreeOverallBest,
  pickRakutenYahooOverallBest,
} from "./lib/otsdguide-render.mjs";
import { renderTemplate, escapeHtml } from "./lib/common.mjs";

/** 「2026年8月13日（令和8年）」形式の更新日文字列を生成する */
function formatUpdatedDateJa(updatedAt) {
  const d = new Date(updatedAt);
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
  const dateStr = formatter.format(d);
  // 令和年 = 西暦年 - 2018 (令和元年=2019年)
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Tokyo" }).formatToParts(d);
  const jstYear = Number(parts.find((p) => p.type === "year").value);
  const reiwaYear = jstYear - 2018;
  return `${dateStr}（令和${reiwaYear}年）`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const TEMPLATE_PATH = path.join(ROOT, "docs-template", "index.template.html");
const OUT_DIR = path.join(ROOT, "docs-otsdguide");

const SITE_BASE_URL = (process.env.SITE_BASE_URL || "https://otsdguide.org").replace(/\/+$/, "");
const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || "";
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY || "";
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || "";
const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID || "";
const MOSHIMO = {
  aId: process.env.MOSHIMO_A_ID || "",
  pId: process.env.MOSHIMO_P_ID || "",
  pcId: process.env.MOSHIMO_PC_ID || "",
  plId: process.env.MOSHIMO_PL_ID || "",
};
const VALUECOMMERCE = {
  sid: process.env.VALUECOMMERCE_SID || "",
  pid: process.env.VALUECOMMERCE_PID || "",
};

async function main() {
  const standardProduct = products.find((p) => p.id === "otsdguide-proclear");
  const multiProduct = products.find((p) => p.id === "otsdguide-proclear-multifocal");
  if (!standardProduct || !multiProduct) {
    throw new Error("otsdguide-proclear / otsdguide-proclear-multifocal が products.config.mjs に見つかりません");
  }

  await mkdir(OUT_DIR, { recursive: true });

  const fetchOpts = {
    SITE_BASE_URL,
    RAKUTEN_APP_ID,
    RAKUTEN_ACCESS_KEY,
    RAKUTEN_AFFILIATE_ID,
    YAHOO_CLIENT_ID,
    MOSHIMO,
    VALUECOMMERCE,
    ROOT: OUT_DIR, // price-history.json 等の読み書き先(商品ごとにサブフォルダを分ける)
  };

  console.log("=== 標準品(otsdguide-proclear)のデータ取得 ===");
  await mkdir(path.join(OUT_DIR, standardProduct.outputDir), { recursive: true });
  const standardData = await fetchProductPriceData(standardProduct, fetchOpts);

  console.log("\n=== マルチフォーカル(otsdguide-proclear-multifocal)のデータ取得 ===");
  await mkdir(path.join(OUT_DIR, multiProduct.outputDir), { recursive: true });
  const multiData = await fetchProductPriceData(multiProduct, fetchOpts);

  // ---- HTML断片の生成 ----
  const standardTalkBubble = renderTalkBubble({
    avatarSrc: "assets/uploads/woman.png",
    avatarAlt: "女性",
    message: "プロクリアワンデーを購入する上で、一番出費を抑えられると考えられるのは！",
  });
  const standardRxFreeBest = standardData.rxFreeShopResults
    ? pickRxFreeOverallBest(standardData.rxFreeShopResults)
    : null;
  const standardRakutenYahooBest = pickRakutenYahooOverallBest(
    standardData.overallBest,
    standardData.overallBestUnit
  );
  const standardSoukatsu = renderSoukatsuBox({
    rxFreeBest: standardRxFreeBest,
    rxRequiredBest: standardRakutenYahooBest,
  });
  const standardRxFreeTable = standardData.rxFreeShopResults
    ? renderRxFreeRankTable(standardData.rxFreeShopResults)
    : "";
  const standardRakutenYahooTable = renderRakutenYahooRankTable({ unitResults: standardData.unitResults });

  const multiTalkBubble = renderTalkBubble({
    avatarSrc: "assets/uploads/man.png",
    avatarAlt: "男性",
    message:
      "プロクリアワンデー マルチフォーカル（遠近両用）を購入する上で、一番出費を抑えられると考えられるのは！",
  });
  const multiRxFreeBest = multiData.rxFreeShopResults ? pickRxFreeOverallBest(multiData.rxFreeShopResults) : null;
  const multiRakutenYahooBest = pickRakutenYahooOverallBest(multiData.overallBest, multiData.overallBestUnit);
  const multiSoukatsu = renderSoukatsuBox({
    rxFreeBest: multiRxFreeBest,
    rxRequiredBest: multiRakutenYahooBest,
  });
  const multiRxFreeTable = multiData.rxFreeShopResults ? renderRxFreeRankTable(multiData.rxFreeShopResults) : "";
  const multiRakutenYahooTable = renderRakutenYahooRankTable({ unitResults: multiData.unitResults });

  // ---- テンプレートへの差し込み ----
  const template = await readFile(TEMPLATE_PATH, "utf-8");
  const updatedAt = new Date().toISOString();

  const html = renderTemplate(template, {
    PAGE_TITLE: escapeHtml(
      "プロクリアワンデー通販激安最安値情報【毎日更新！処方箋不要もマルチフォーカル最安値も】"
    ),
    META_DESCRIPTION: escapeHtml(
      "プロクリアワンデー通販激安最安値情報。楽天市場・Yahoo!ショッピング・処方箋不要の専門店(レンズラボ・レンズモード)の価格を毎日比較。マルチフォーカル(遠近両用)の最安値情報も掲載。"
    ),
    CANONICAL_URL: escapeHtml(`${SITE_BASE_URL}/`),
    SITE_H1: escapeHtml(
      "プロクリアワンデー通販激安最安値情報【毎日更新！処方箋不要もマルチフォーカル最安値も】"
    ),
    UPDATED_TEXT: escapeHtml(formatUpdatedDateJa(updatedAt)),
    STANDARD_TALK_BUBBLE: standardTalkBubble,
    STANDARD_SOUKATSU: standardSoukatsu,
    STANDARD_RXFREE_TABLE: standardRxFreeTable,
    STANDARD_RAKUTEN_YAHOO_TABLE: standardRakutenYahooTable,
    MULTI_TALK_BUBBLE: multiTalkBubble,
    MULTI_SOUKATSU: multiSoukatsu,
    MULTI_RXFREE_TABLE: multiRxFreeTable,
    MULTI_RAKUTEN_YAHOO_TABLE: multiRakutenYahooTable,
  });

  await writeFile(path.join(OUT_DIR, "index.html"), html, "utf-8");

  // assets(CSS・画像)一式をコピー
  await cp(path.join(ROOT, "docs-template", "assets"), path.join(OUT_DIR, "assets"), { recursive: true });

  // sitemap.xml / robots.txt
  const canonicalUrl = `${SITE_BASE_URL}/`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${escapeHtml(canonicalUrl)}</loc>
    <lastmod>${updatedAt.slice(0, 10)}</lastmod>
    <changefreq>daily</changefreq>
  </url>
</urlset>
`;
  await writeFile(path.join(OUT_DIR, "sitemap.xml"), sitemap, "utf-8");

  const robots = `User-agent: *
Allow: /

Sitemap: ${canonicalUrl}sitemap.xml
`;
  await writeFile(path.join(OUT_DIR, "robots.txt"), robots, "utf-8");

  console.log(`\n=== 完了: ${path.join(OUT_DIR, "index.html")} を生成しました ===`);
}

main().catch((err) => {
  console.error("致命的なエラーが発生しました:", err);
  process.exit(1);
});

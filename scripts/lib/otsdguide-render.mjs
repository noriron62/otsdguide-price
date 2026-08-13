// scripts/lib/otsdguide-render.mjs
//
// otsdguide.org 独自デザイン(旧WordPressテーマ踏襲・処方箋不要ランキング形式)で
// HTML断片を生成する関数群。データの取得自体は fetch-product-data.mjs
// (oasisu の共通ロジックをそのまま流用)が行い、ここでは見た目の組み立てだけを行う。

import { escapeHtml } from "./common.mjs";

const yenFmt = new Intl.NumberFormat("ja-JP");
const yen = (n) => (typeof n === "number" ? yenFmt.format(n) : "-");

/**
 * 処方箋不要ショップ(レンズラボ・レンズモード等)の、箱数ごとのランキング
 * テーブルをまとめて生成する。quantities順(降順を想定)に、それぞれ
 * 該当ショップを合計金額の安い順に並べる。
 */
export function renderRxFreeRankTable({ quantities, shopResults }) {
  const sectionsHtml = quantities
    .map((qty) => {
      const rows = [];
      for (const shop of shopResults) {
        const q = shop.quantities.find((x) => x.qty === qty);
        if (!q || q.productPrice === null) continue;
        const shipping = shop.shippingFor(qty);
        const total = q.productPrice + shipping;
        const perBox = Math.round(total / qty);
        rows.push({ shopName: shop.name, total, perBox, url: q.affiliateUrl });
      }
      rows.sort((a, b) => a.total - b.total);

      if (rows.length === 0) {
        return `      <tr><th colspan="4">${qty}箱</th></tr>
      <tr><td colspan="4" class="empty-row">現在、該当する価格情報がありません。</td></tr>`;
      }

      const rowsHtml = rows
        .map((r, i) => {
          const rank = i + 1;
          const rankClass = rank === 1 ? ' class="rank1"' : "";
          return `      <tr>
        <td${rankClass}>${rank}位</td>
        <td class="shopname"><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">${escapeHtml(r.shopName)}</a></td>
        <td><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(r.perBox)}</a></td>
        <td><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(r.total)}</a></td>
      </tr>`;
        })
        .join("\n");

      return `      <tr><th colspan="4">${qty}箱</th></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${rowsHtml}`;
    })
    .join("\n");

  const tabsHtml = quantities.map((q) => `<span>${q}箱</span>`).join("");

  return `  <div class="price-box">
    <div class="price-box-head">処方箋不要 ランキング（レンズラボ／レンズモード）</div>
    <div class="price-box-sub">※処方箋不要で購入できる専門店の価格をまとめています</div>
    <div class="box-tabs">
      ${tabsHtml}
    </div>
    <table class="rank-table">
${sectionsHtml}
    </table>
    <div class="graph-placeholder">［ 価格推移グラフ（点＋ラベル表示）を挿入 ］</div>
  </div>`;
}

/**
 * 楽天市場・Yahoo!ショッピングの、比較単位(箱数)ごとのランキングテーブルを
 * まとめて生成する。unitResults(unitごとの{unit, rakutenRanking, yahooRanking})
 * をそのまま受け取る。
 */
export function renderRakutenYahooRankTable({ unitResults }) {
  const tabsHtml = unitResults.map(({ unit }) => `<span>${unit.label}</span>`).join("");

  const sectionsHtml = unitResults
    .map(({ unit, rakutenRanking, yahooRanking }) => {
      const renderRows = (ranking) => {
        if (!ranking || ranking.length === 0) {
          return `      <tr><td colspan="4" class="empty-row">現在、該当する価格情報がありません。</td></tr>`;
        }
        return ranking
          .map((item) => {
            const rankClass = item.rank === 1 ? ' class="rank1"' : "";
            return `      <tr>
        <td${rankClass}>${item.rank}位</td>
        <td class="shopname"><a href="${escapeHtml(item.url)}" target="_blank" rel="nofollow noopener sponsored">${escapeHtml(item.shop)}</a></td>
        <td><a href="${escapeHtml(item.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(item.boxUnitPrice)}</a></td>
        <td><a href="${escapeHtml(item.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(item.price)}</a></td>
      </tr>`;
          })
          .join("\n");
      };

      return `      <tr class="section-row"><td colspan="4">楽天市場 TOP${rakutenRanking.length || 3}（${unit.label}）</td></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${renderRows(rakutenRanking)}
      <tr class="section-row"><td colspan="4">Yahoo!ショッピング TOP${yahooRanking.length || 3}（${unit.label}）</td></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${renderRows(yahooRanking)}`;
    })
    .join("\n");

  return `  <div class="price-box">
    <div class="price-box-head">処方箋必要 ランキング（楽天市場／Yahoo!ショッピング）</div>
    <div class="box-tabs">
      ${tabsHtml}
    </div>
    <table class="rank-table">
${sectionsHtml}
    </table>
    <div class="graph-placeholder">［ 価格推移グラフ（点＋ラベル表示）を挿入 ］</div>
  </div>`;
}

/** 吹き出し（女性/男性アバター＋コメント）のHTMLを生成する */
export function renderTalkBubble({ avatarSrc, avatarAlt, message }) {
  return `  <div class="talk-wrap">
    <div class="talk-avatar"><img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(avatarAlt)}"></div>
    <div class="talk-bubble">
      <p>${escapeHtml(message)}</p>
    </div>
  </div>`;
}

/**
 * 総合最安値ボックス（処方箋不要／処方箋必要の2枠）を生成する。
 * それぞれの枠の best オブジェクトが qty(箱数)を持っていれば、
 * 「◯箱購入したときです！」という answerLead を自動生成する。
 * best が無い場合はその枠を「取得できませんでした」表示にする。
 */
export function renderSoukatsuBox({ rxFreeBest, rxRequiredBest }) {
  const renderItem = (best, label) => {
    if (!best) {
      return `    <div class="item">
      <div class="label">${escapeHtml(label)}</div>
      <div class="price">現在取得できません</div>
    </div>`;
    }
    const answerLead = best.qty ? `${best.qty}箱購入したときです！` : "";
    const answerLeadHtml = answerLead
      ? `      <div class="answer-lead">${escapeHtml(answerLead)}</div>\n`
      : "";
    return `    <a class="item" href="${escapeHtml(best.url)}" target="_blank" rel="nofollow noopener sponsored">
${answerLeadHtml}      <div class="label">${escapeHtml(label)}</div>
      <div class="price">¥${yen(best.perBox)}</div>
      <div class="shop">${escapeHtml(best.shop)}（1箱あたり）</div>
    </a>`;
  };

  return `  <div class="soukatsu">
${renderItem(rxFreeBest, "処方箋不要 総合最安値")}
${renderItem(rxRequiredBest, "処方箋必要（楽天/Yahoo） 総合最安値")}
  </div>`;
}

/**
 * rxFreeShopResults(quantities, shopResults)から、処方箋不要側の
 * 「総合最安値」候補(1件)を計算する。renderSoukatsuBoxにそのまま渡せる形。
 */
export function pickRxFreeOverallBest({ quantities, shopResults }) {
  let best = null;
  for (const shop of shopResults) {
    for (const q of shop.quantities) {
      if (q.productPrice === null) continue;
      const shipping = shop.shippingFor(q.qty);
      const total = q.productPrice + shipping;
      const perBox = Math.round(total / q.qty);
      const rawUnitPrice = total / (q.qty * 30);
      if (!best || rawUnitPrice < best.rawUnitPrice) {
        best = { shop: shop.name, perBox, total, qty: q.qty, url: q.affiliateUrl, rawUnitPrice };
      }
    }
  }
  return best;
}

/**
 * overallBest(楽天/Yahooの総合最安値候補、buildRankingの戻り値形式)と、
 * それが属する比較単位(overallBestUnit)から、renderSoukatsuBoxに
 * そのまま渡せる形に変換する。qtyは単位ラベル("4箱"等)から抽出する。
 */
export function pickRakutenYahooOverallBest(overallBest, overallBestUnit) {
  if (!overallBest) return null;
  const qtyMatch = overallBestUnit?.label?.match(/(\d+)箱/);
  return {
    shop: overallBest.shop,
    perBox: overallBest.boxUnitPrice,
    total: overallBest.price,
    url: overallBest.url,
    qty: qtyMatch ? Number(qtyMatch[1]) : null,
  };
}

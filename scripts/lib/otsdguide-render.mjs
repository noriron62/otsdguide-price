// scripts/lib/otsdguide-render.mjs
//
// otsdguide.org 独自デザイン(旧WordPressテーマ踏襲・処方箋不要ランキング形式)で
// HTML断片を生成する関数群。データの取得自体は fetch-product-data.mjs
// (oasisu の共通ロジックをそのまま流用)が行い、ここでは見た目の組み立てだけを行う。

import { escapeHtml } from "./common.mjs";

const yenFmt = new Intl.NumberFormat("ja-JP");
const yen = (n) => (typeof n === "number" ? yenFmt.format(n) : "-");

/**
 * 「順位・ショップ・単価・合計」4列の幅を固定するcolgroup。
 * colspan="4"の見出し行が混在するテーブルで、行ごとに列幅の自動計算が
 * ズレて縦の罫線がバラバラになる問題を防ぐために、全テーブル共通で使う。
 */
const RANK_TABLE_COLGROUP = `      <colgroup>
        <col style="width:15%">
        <col style="width:39%">
        <col style="width:23%">
        <col style="width:23%">
      </colgroup>`;

/**
 * unit.label(例: "90枚×2箱セット" "2箱(標準サイズ・60枚)")から、
 * 「購入したときです！」に自然につながる短い単位表記に正規化する。
 * 例: "90枚×2箱セット" → "90枚×2箱" / "2箱(標準サイズ・60枚)" → "2箱(60枚)"
 */
function normalizeUnitLabel(label) {
  if (!label) return "";
  return label.replace(/セット$/, "").replace(/標準サイズ・/, "");
}

/**
 * 処方箋不要ショップ(レンズラボ・レンズモード等)の、箱数ごとのランキング
 * テーブルを生成する。quantities順(降順を想定)に、それぞれ独立した
 * <table>として出力する(箱数ごとに見た目を分離するため)。
 */
export function renderRxFreeRankTable({ quantities, shopResults, history }) {
  const tablesHtml = quantities
    .map((qty) => {
      const rows = [];
      for (const shop of shopResults) {
        const q = shop.quantities.find((x) => x.qty === qty);
        if (!q || q.productPrice === null) continue;
        const shipping = shop.shippingFor(qty);
        const total = q.productPrice + shipping;
        const perBox = Math.round(total / qty);
        rows.push({
          shopName: shop.name,
          total,
          perBox,
          url: q.affiliateUrl,
          productPrice: q.productPrice,
          shipping,
        });
      }
      rows.sort((a, b) => a.total - b.total);

      const qtyLabel = `${qty}箱(${qty * 30}枚)`;

      if (rows.length === 0) {
        return `    <table class="rank-table">
${RANK_TABLE_COLGROUP}
      <tr><th colspan="4">${qtyLabel}</th></tr>
      <tr><td colspan="4" class="empty-row">現在、該当する価格情報がありません。</td></tr>
    </table>`;
      }

      const rowsHtml = rows
        .map((r, i) => {
          const rank = i + 1;
          const rankClass = rank === 1 ? ' class="rank1"' : "";
          const breakdown =
            r.shipping > 0
              ? `<span class="price-breakdown">(商品¥${yen(r.productPrice)}+送料¥${yen(r.shipping)})</span>`
              : "";
          return `      <tr>
        <td${rankClass}>${rank}位</td>
        <td class="shopname"><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">${escapeHtml(r.shopName)}</a></td>
        <td class="price-cell"><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(r.perBox)}</a></td>
        <td class="price-cell"><a href="${escapeHtml(r.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(r.total)}</a>${breakdown}</td>
      </tr>`;
        })
        .join("\n");

      return `    <table class="rank-table">
${RANK_TABLE_COLGROUP}
      <tr><th colspan="4">${qtyLabel}</th></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${rowsHtml}
    </table>`;
    })
    .join("\n");

  const tabsHtml = quantities.map((q) => `<span>${q}箱(${q * 30}枚)</span>`).join("");

  return `  <div class="price-box">
    <div class="price-box-head">処方箋不要 ランキング（レンズラボ／レンズモード）</div>
    <div class="price-box-sub">※処方箋不要で購入できる専門店の価格をまとめています（表示金額は送料無料、または送料込みの金額です）</div>
    <div class="box-tabs">
      ${tabsHtml}
    </div>
${tablesHtml}
${history ? renderPriceHistoryChart(history) : ""}
    <p class="price-note">※表示価格はすべて送料無料（又は送料込み）の金額です。</p>
  </div>`;
}

/**
 * 楽天市場・Yahoo!ショッピングの、比較単位(箱数)ごとのランキングテーブルを
 * 生成する。楽天・Yahoo!はそれぞれ独立した順位付け(それぞれ独立したTOPn)だが、
 * 箱数ごとに1つの<table>にまとめる(楽天セクション見出し→楽天ランキング→
 * Yahooセクション見出し→Yahooランキングの順で、間隔をあけずに連続表示)。
 * 見出しには「楽天市場 TOPn（単位ラベル）」のように箱数を含める。
 * unitResults(unitごとの{unit, rakutenRanking, yahooRanking})をそのまま受け取る。
 */
export function renderRakutenYahooRankTable({ unitResults, history }) {
  const tabsHtml = unitResults
    .map(({ unit }) => `<span>${escapeHtml(normalizeUnitLabel(unit.label))}</span>`)
    .join("");

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
        <td class="price-cell"><a href="${escapeHtml(item.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(item.boxUnitPrice)}</a></td>
        <td class="price-cell"><a href="${escapeHtml(item.url)}" target="_blank" rel="nofollow noopener sponsored">¥${yen(item.price)}</a></td>
      </tr>`;
      })
      .join("\n");
  };

  const tablesHtml = unitResults
    .map(({ unit, rakutenRanking, yahooRanking }) => {
      const unitLabel = normalizeUnitLabel(unit.label);
      return `    <table class="rank-table">
${RANK_TABLE_COLGROUP}
      <tr><th colspan="4" class="table-title">楽天市場 TOP${rakutenRanking.length || 3}（${escapeHtml(unitLabel)}）</th></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${renderRows(rakutenRanking)}
      <tr><th colspan="4" class="table-title">Yahoo!ショッピング TOP${yahooRanking.length || 3}（${escapeHtml(unitLabel)}）</th></tr>
      <tr><th>順位</th><th>ショップ</th><th>単価（1箱）</th><th>合計</th></tr>
${renderRows(yahooRanking)}
    </table>`;
    })
    .join("\n");

  return `  <div class="price-box">
    <div class="price-box-head">処方箋必要 ランキング（楽天市場／Yahoo!ショッピング）</div>
    <div class="box-tabs">
      ${tabsHtml}
    </div>
${tablesHtml}
${history ? renderPriceHistoryChart(history) : ""}
    <p class="price-note">※表示価格はすべて送料無料（又は送料込み）の金額です。</p>
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
 * それぞれの枠の best オブジェクトが unitLabel(例:"90枚×2箱" "6箱(180枚)")を
 * 持っていれば、「◯◯購入したときです！」という answerLead を自動生成する。
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
    const answerLead = best.unitLabel ? `${best.unitLabel}購入したときです！` : "";
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
 * unitLabelは「◯箱(◯枚)」の形(30枚/箱固定)。
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
        best = {
          shop: shop.name,
          perBox,
          total,
          qty: q.qty,
          unitLabel: `${q.qty}箱(${q.qty * 30}枚)`,
          url: q.affiliateUrl,
          rawUnitPrice,
        };
      }
    }
  }
  return best;
}

/**
 * overallBest(楽天/Yahooの総合最安値候補、buildRankingの戻り値形式)と、
 * それが属する比較単位(overallBestUnit)から、renderSoukatsuBoxに
 * そのまま渡せる形に変換する。unitLabelはunit.labelをそのまま正規化して使う
 * (例: "90枚×2箱セット" → "90枚×2箱")ため、90枚パックのような特殊な単位でも
 * 正確に表記される。
 */
export function pickRakutenYahooOverallBest(overallBest, overallBestUnit) {
  if (!overallBest) return null;
  return {
    shop: overallBest.shop,
    perBox: overallBest.boxUnitPrice,
    total: overallBest.price,
    url: overallBest.url,
    unitLabel: overallBestUnit?.label ? normalizeUnitLabel(overallBestUnit.label) : null,
  };
}

/**
 * 価格推移グラフ用に、履歴データを「直近7日は日次のまま・それより古い分は
 * 7日ごとの週平均にまとめる」形に変換する。データが増えてもグラフの点数が
 * 際限なく増えず、見た目がゴチャつかないようにするための処理。
 * historyは日付昇順(古い→新しい)を前提とする(updatePriceHistoryの戻り値通り)。
 * 戻り値は [{ date, price, label, isWeekly }] の配列(古い→新しい順)。
 * dateは日次点なら"YYYY-MM-DD"、週集約点ならグループ最終日の"YYYY-MM-DD"。
 * labelはX軸に出す表示用文字列。
 */
export function groupHistoryForChart(history) {
  if (!history || history.length === 0) return [];

  const RECENT_DAYS = 7;
  const recentCount = Math.min(RECENT_DAYS, history.length);
  const olderPart = history.slice(0, history.length - recentCount);
  const recentPart = history.slice(history.length - recentCount);

  const weeklyPoints = [];
  for (let i = 0; i < olderPart.length; i += RECENT_DAYS) {
    const chunk = olderPart.slice(i, i + RECENT_DAYS);
    const avg = Math.round(chunk.reduce((sum, h) => sum + h.price, 0) / chunk.length);
    const firstDate = chunk[0].date;
    const lastDate = chunk[chunk.length - 1].date;
    weeklyPoints.push({
      date: lastDate,
      price: avg,
      label: formatWeekRangeLabel(firstDate, lastDate),
      isWeekly: true,
    });
  }

  const dailyPoints = recentPart.map((h) => ({
    date: h.date,
    price: h.price,
    label: formatMonthDayLabel(h.date),
    isWeekly: false,
  }));

  return [...weeklyPoints, ...dailyPoints];
}

function formatMonthDayLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatWeekRangeLabel(firstDateStr, lastDateStr) {
  const a = new Date(firstDateStr);
  const b = new Date(lastDateStr);
  return `${a.getMonth() + 1}/${a.getDate()}〜${b.getMonth() + 1}/${b.getDate()}`;
}

/**
 * groupHistoryForChartの結果を、シンプルな点+ラベル表示のSVG折れ線グラフに
 * する。週集約点はオレンジ、日次点は赤の点で区別する。
 */
export function renderPriceHistoryChart(history) {
  const points = groupHistoryForChart(history);
  if (points.length < 2) {
    return "";
  }

  const W = 640;
  const H = 220;
  const PAD_L = 30;
  const PAD_R = 30;
  const PAD_T = 34;
  const PAD_B = 34;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const prices = points.map((p) => p.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const rawRange = rawMax - rawMin;
  const padding = rawRange > 0 ? rawRange * 0.25 : Math.max(rawMax * 0.03, 5);
  const vMin = rawMin - padding;
  const vMax = rawMax + padding;
  const vRange = vMax - vMin || 1;

  const xAt = (i) => PAD_L + (chartW * i) / Math.max(points.length - 1, 1);
  const yAt = (v) => PAD_T + chartH * (1 - (v - vMin) / vRange);

  const xy = points.map((p, i) => [xAt(i), yAt(p.price)]);
  const pathD = "M " + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");

  const dots = points
    .map((p, i) => {
      const [x, y] = xy[i];
      const r = p.isWeekly ? 5 : 6;
      const color = p.isWeekly ? "#e0a030" : "#d32f2f";
      const prevY = i > 0 ? xy[i - 1][1] : y;
      const nextY = i < xy.length - 1 ? xy[i + 1][1] : y;
      const isPeak = y <= prevY && y <= nextY;
      const labelY = isPeak ? y + r + 16 : y - r - 8;
      const priceLabel = `<text x="${x.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="12" font-weight="700" fill="#333" text-anchor="middle">¥${yen(p.price)}</text>`;
      return `${priceLabel}\n  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5" />`;
    })
    .join("\n");

  const xLabels = points
    .map((p, i) => {
      const [x] = xy[i];
      return `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">${escapeHtml(p.label)}</text>`;
    })
    .join("\n");

  return `  <div class="chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:auto;">
      <line x1="${PAD_L}" y1="${PAD_T + chartH}" x2="${W - PAD_R}" y2="${PAD_T + chartH}" stroke="#eee" stroke-width="1" />
      <path d="${pathD}" fill="none" stroke="#f0a0a0" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
${dots}
${xLabels}
    </svg>
    <p class="chart-note">※オレンジの点は7日間の平均値(まとめ表示)、赤い点は直近7日間の日次価格です。</p>
  </div>`;
}

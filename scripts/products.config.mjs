// scripts/products.config.mjs
//
// otsdguide.org(プロクリアワンデー通販激安最安値情報)専用の商品設定。
// データ取得ロジック(価格取得・箱数判定・処方箋不要ショップの
// スクレイピング等)は oasisu(newmediagallery.org) の
// proclear-saiyasu / proclear-multifocal-saiyasu の設定を流用している
// (箱数構成がほぼ同一のため)。表示テンプレートだけ otsdguide.org 独自
// デザイン(旧WordPressテーマ踏襲)に差し替えている。

import { stripShippingPromoText } from "./lib/common.mjs";

export const products = [
  {
    id: "otsdguide-proclear",
    slug: "otsdguide-proclear",
    outputDir: "_price-history/proclear",
    siteName: "プロクリアワンデー最安値通販価格情報",
    theme: { accent: "#2F6B4F", gold: "#B8892B" }, // フォレストグリーン系(他4サイトと見分けやすい配色)
    historyUnitKey: "bundle", // 価格推移グラフで記録する比較単位（90枚×2箱セットが実測でも最安のため）
    searchKeyword: "プロクリアワンデー",
    metaDescription:
      "プロクリアワンデーの楽天市場・Yahoo!ショッピングの価格を毎日チェックし、処方箋不要で購入できるショップを中心に、90枚×2箱・90枚1箱・2箱・1箱それぞれの最安値トップ5を掲載しています。",
    subtitle:
      "「90枚×2箱」「90枚1箱」「2箱」「1箱」それぞれの単位を基準に、楽天市場・Yahoo!ショッピングの価格を毎日チェックし、処方箋不要で購入できるショップを中心に、それぞれのショップ別最安値トップ5を掲載しています。",
    productSchemaName: "プロクリアワンデー 90枚入り×2箱セット（180枚）",
    brandName: "Proclear", // JSON-LD(構造化データ)のbrand.nameに使用（クーパービジョン社製のため他商品と異なる）
    brand: "クーパービジョン", // トップページのブランド別グルーピングに使用
    brandKey: "coopervision",
    // トップページのスペック比較表に使用(メーカー公式・販売店情報を確認のうえ設定)
    specs: {
      material: "omafilcon A",
      water: 60, // 含水率(%)
      dk: 22.8, // 酸素透過率(Dk/t)
      uv: false, // UVカットの有無
      origin: "海外",
      type: "標準（近視）", // 標準（近視）/乱視用/遠近両用
    },
    shortName: "プロクリアワンデー", // トップページの商品カード・フッターで使う短い正式名称
    // 処方箋不要ショップのセクションを新設した分、ページが長くなりすぎない
    // よう、楽天/Yahoo!ランキングは各ベスト3に絞る
    rankingTopN: 3,

    // 「処方箋不要」を明言している専門ショップ（楽天/Yahoo!とは別に、
    // HTMLスクレイピングで価格を取得する）。1/2/4/6箱それぞれの
    // 商品ページURLと、A8.net経由のアフィリエイトリンクを保持する。
    rxFreeShops: {
      quantities: [1, 2, 4, 6],
      shops: [
        {
          name: "レンズモード",
          // 送料: 300円×箱数（最低1,000円）
          shippingFor: (boxes) => Math.max(300 * boxes, 1000),
          // レンズモードはJavaScriptで価格を表示する作りのため、自動取得ができない。
          // そのため商品価格は固定値（staticPrice）で運用し、運営者が定期的に
          // （目安2週間ごと）手動で最新価格に更新する方針とする。
          pages: {
            1: {
              staticPrice: 2230,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1%2F",
            },
            2: {
              staticPrice: 4456,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1%212%2F",
            },
            4: {
              staticPrice: 8900,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1%214%2F",
            },
            6: {
              staticPrice: 13344,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1%216%2F",
            },
          },
        },
        {
          name: "レンズラボ",
          // 送料: 全国一律700円
          shippingFor: () => 700,
          pages: {
            1: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0012-1",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0012-1",
            },
            2: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0012-2",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0012-2",
            },
            4: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0012-4",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0012-4",
            },
            6: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0012-6",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0012-6",
            },
          },
        },
      ],
    },

    /** 商品名が「プロクリアワンデー」（マルチフォーカル・乱視用ではない）であることを確認する */
    isCorrectProduct(name) {
      if (!name) return false;
      const n = name.replace(/\s/g, "");
      if (/(マルチフォーカル|遠近両用|乱視用|トーリック|toric)/i.test(n)) return false;
      return /プロクリア/.test(n);
    },

    units: [
      {
        key: "bundle",
        label: "90枚×2箱セット",
        totalLenses: 180,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー 90枚入り×2箱セット(180枚)",
        // 参考価格(90枚×2箱13,120円)をもとに、価格帯を直接指定して追加取得する。
        // 下限は当初11,000円だったが、Yahoo!側の母数が少なすぎたため
        // 10,500円まで広げている。上限も16,000円→18,000円に広げ、
        // 処方箋不要の商品がより多く含まれるか確認中（90枚1箱・90枚1箱系の
        // 実勢価格帯とは matches() 側のロジックで区別している）。
        priceHint: { min: 10500, max: 18000 },
        // 通常の検索キーワードのままだと、同じ価格帯にある「×4箱セット」
        // 「90枚1箱」等の商品が多く、90枚×2箱セットが埋もれてしまうため、
        // 検索キーワード自体を絞り込む。Yahoo!側は「2箱」まで含めると
        // 母数が少なすぎたため、「2箱」は外して広めにしている
        // （90枚1箱との区別は matches() 側のロジックで行っている）。
        hintedKeyword: "プロクリアワンデー 90枚",
        introHtml: "",
        /** 「90枚入り×2箱（180枚）セット」らしきものだけを判定する */
        matches(name) {
          if (!name) return false;
          const n = stripShippingPromoText(name.replace(/\s/g, ""));
          if (/単品/.test(n)) return false;

          const mentionsSingleBoxTerms = /(1箱)/.test(n);
          const mentions2Box = /2箱/.test(n);
          if (mentionsSingleBoxTerms && !mentions2Box) return false;

          if (/180枚/.test(n)) return true;

          const has90 = /90/.test(n);
          const has2Box =
            /(2箱|×2箱|ｘ2箱|x2箱|2箱セット|90.{0,4}×2|90.{0,4}x2|90.{0,4}ｘ2)/i.test(n);
          return has90 && has2Box;
        },
      },
      {
        key: "single90",
        label: "90枚1箱",
        totalLenses: 90,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー 90枚1箱",
        // 参考価格(90枚1箱6,800円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 5800, max: 8500 },
        introHtml: `    <h2 class="section-heading">90枚1箱(単品)でも比較したい方へ</h2>
    <p>
      「まずは1箱だけ試したい」という方向けに、90枚1箱(単品)の価格帯も
      別枠で掲載しています。<strong>90枚×2箱セットとは金額の単位が異なる</strong>ため、
      混同しないようご注意ください(こちらは90枚1箱分の価格です)。
    </p>`,
        // この商品は「標準サイズ(30枚入り)の2箱・1箱」も別途存在するため、
        // それらとの混同を防ぐよう「2箱」の表記も明示的に除外する
        matches(name) {
          if (!name) return false;
          const n = stripShippingPromoText(name.replace(/\s/g, ""));
          const otherBoxCount = /(2箱|3箱|4箱|5箱|6箱|60枚|180枚|270枚|360枚)/;
          if (otherBoxCount.test(n)) return false;
          return /90/.test(n);
        },
      },
      {
        key: "box2",
        label: "2箱(標準サイズ・60枚)",
        totalLenses: 60,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー 2箱セット(60枚・標準サイズ)",
        // 参考価格(2箱4,900円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 4000, max: 6200 },
        introHtml: `    <h2 class="section-heading">標準サイズ(30枚入り)の2箱でも比較したい方へ</h2>
    <p>
      90枚パックとは別に、標準サイズ(30枚入り)を2箱で販売しているショップも
      見つかった場合は、こちらに別枠で掲載しています。<strong>90枚パックとは
      金額の単位が異なる</strong>ため、比較する際は1枚あたりの単価をご確認ください。
    </p>`,
        // 90枚パック系(bundle/single90)との混同を防ぐため、「90」を含む商品は除外する
        matches(name) {
          if (!name) return false;
          const n = stripShippingPromoText(name.replace(/\s/g, ""));
          if (/単品/.test(n)) return false;
          if (/90/.test(n)) return false;
          if (/(3箱|4箱|5箱|6箱)/.test(n)) return false;
          return /2箱/.test(n);
        },
      },
      {
        key: "box1",
        label: "1箱(標準サイズ・30枚)",
        totalLenses: 30,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー 1箱(30枚・標準サイズ)",
        // 参考価格(1箱2,590円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 2000, max: 3500 },
        introHtml: `    <h2 class="section-heading">標準サイズ(30枚入り)の1箱でも比較したい方へ</h2>
    <p>
      「まずは1箱だけ試したい」という方向けに、標準サイズ(30枚入り)1箱の
      価格帯も別枠で掲載しています。<strong>90枚パック・2箱セットとは
      金額の単位が異なる</strong>ため、比較する際は1枚あたりの単価をご確認ください。
    </p>`,
        // 他の箱数・90枚パックをはっきり示す表記がある商品は、こちらでは対象外にする
        matches(name) {
          if (!name) return false;
          const n = stripShippingPromoText(name.replace(/\s/g, ""));
          if (/(90|2箱|3箱|4箱|5箱|6箱|60枚|180枚)/.test(n)) return false;
          return true;
        },
      },
    ],

    productIntroHtml: `    <h2 class="section-heading">処方箋不要で購入できるショップを中心に比較しています</h2>
    <p>
      プロクリアワンデーは、コンタクトレンズの中でも「処方箋の提示が必要」な
      ショップで取り扱われることが多い商品です。当サイトでは、商品名や説明文に
      「処方箋あり」「処方箋必要」などと明記された商品はあらかじめ除外していて、
      処方箋不要で購入できるショップを中心に価格を比較しています。
    </p>
    <p>
      楽天・Yahooで扱っているお店は処方箋が必要です。でも店頭で購入するよりは
      安いので処方箋を用意できる方は、ぜひ利用したいですね！
      処方箋が不要というと一般激安サイトで手にすることになりますが、安いサイトも
      ありますので、参考にしてくださいね。掲載金額はもちろん送料無料（又は込み）です。
    </p>
    <p>
      あわせて、購入する数量によって1枚あたりの単価が変わる点にも注目しています。
      1箱(30枚)だけの購入は単価が割高になりがちですが、90枚入り×2箱セット
      (180枚)は、まとめ買い向けに価格設定しているショップが多く、
      1枚あたりの単価がもっとも下がりやすい傾向があります。そのため当サイトでは、
      90枚×2箱セットを中心に比較しつつ、90枚1箱・標準サイズの2箱・1箱で
      見つかった場合も、それぞれ別枠であわせて掲載しています。
    </p>
    <p class="note">
      ※ 「処方箋不要」とは、購入時に処方箋の提示を求めないショップがある、という
      販売形態の説明であり、眼科での検査が不要という意味ではありません。
      コンタクトレンズは高度管理医療機器です。目の健康のため、定期的に眼科での
      検査を受けたうえでご購入・ご使用くださいね。
    </p>
    <p style="text-align:center; font-weight:700; color:var(--teal); margin-top:16px;">
      瞳を美しく維持するためにも…..
    </p>`,

    productInfoHeading: "プロクリアワンデーとは",
    productInfoHtml: `        <p>
          プロクリアワンデーは、クーパービジョン社が展開する1日使い捨てタイプの
          コンタクトレンズです。瞳の角膜細胞の膜構造をモデルにした独自素材
          「オマフィルコンA」を採用し、うるおい成分「MPC」をレンズに配合している
          のが特徴とされています。
        </p>
        <h3>PCテクノロジーによる生体適合性</h3>
        <p>
          人工臓器などにも応用されている「PCテクノロジー」により、生体適合性が
          高く瞳になじみやすいとされています。また、レンズ表面に汚れが
          付着しにくい設計になっており、清潔さを保ちやすい点も特徴です。
        </p>
        <h3>うるおいを保つ設計</h3>
        <p>
          MPCという保水成分により、レンズ内の水分が減少しにくく、装用中の
          うるおいが続きやすいとされています。レンズの形状変化も少なく、
          快適なつけ心地が期待できます。
        </p>
        <h3>取り扱いやすい設計</h3>
        <p>
          薄型でありながら形状がしっかりしているため、レンズの表裏が
          分かりやすく、扱いやすい設計になっているとされています。
        </p>
        <h3>こんな方におすすめ</h3>
        <ul>
          <li>装用中のうるおい・清潔さを重視したい方</li>
          <li>他のレンズで合わなかった経験がある方</li>
          <li>まとめ買いでコストを抑えたい方</li>
        </ul>
        <p class="note">
          ※ 度数・カーブなどの詳細仕様は変更される場合があります。
          ご購入前に、各販売店の商品ページやメーカーの公式情報で
          最新の仕様をご確認ください。コンタクトレンズは高度管理医療機器のため、
          眼科での検査・処方をふまえたうえでのご購入・ご使用をおすすめします。
          本ページは購入の最終判断材料としてではなく、比較検討のための
          参考情報としてご活用ください。
        </p>`,
  },

  {
    id: "otsdguide-proclear-multifocal",
    slug: "otsdguide-proclear-multifocal",
    outputDir: "_price-history/proclear-multifocal",
    siteName: "プロクリアワンデー マルチフォーカル(遠近両用)最安値通販価格情報",
    theme: { accent: "#1F6FB2", gold: "#B8892B" }, // ブライトブルー系(他11サイトと見分けやすい配色)
    historyUnitKey: "box2", // 価格推移グラフで記録する比較単位（2箱が参考価格上もっとも安いため）
    searchKeyword: "プロクリアワンデー マルチフォーカル",
    metaDescription:
      "プロクリアワンデー マルチフォーカル(遠近両用)の楽天市場・Yahoo!ショッピングの価格を毎日チェックし、処方箋不要で購入できるショップを中心に、6箱・4箱・2箱・1箱それぞれの最安値トップ3を掲載しています。",
    subtitle:
      "「6箱」「4箱」「2箱」「1箱」それぞれの単位を基準に、楽天市場・Yahoo!ショッピングの価格を毎日チェックし、処方箋不要で購入できるショップを中心に、それぞれのショップ別最安値トップ3を掲載しています。",
    productSchemaName: "プロクリアワンデー マルチフォーカル(遠近両用) 6箱セット（180枚）",
    brandName: "Proclear", // JSON-LD(構造化データ)のbrand.nameに使用（クーパービジョン社製のため他商品と異なる）
    brand: "クーパービジョン", // トップページのブランド別グルーピングに使用
    brandKey: "coopervision",
    // トップページのスペック比較表に使用(メーカー公式・販売店情報を確認のうえ設定)
    specs: {
      material: "omafilcon A",
      water: 60, // 含水率(%)
      dk: 22.8, // 酸素透過率(Dk/t)
      uv: false, // UVカットの有無
      origin: "海外",
      type: "遠近両用", // 標準（近視）/乱視用/遠近両用
    },
    shortName: "プロクリアワンデー マルチフォーカル(遠近両用)", // トップページの商品カード・フッターで使う短い正式名称
    // 処方箋不要ショップのセクションがある分、ページが長くなりすぎないよう
    // 楽天/Yahoo!ランキングは各ベスト3に絞る（通常版プロクリアと同じ方針）
    rankingTopN: 3,

    // 「処方箋不要」を明言している専門ショップ（通常版プロクリアと同じ2ショップ）。
    // レンズモードは、この商品では6箱セットの取り扱いが無いため、
    // 1/2/4箱のみ設定している（設定が無い箱数はカード上で「該当ありません」
    // と自動表示される）。
    rxFreeShops: {
      quantities: [1, 2, 4, 6],
      shops: [
        {
          name: "レンズモード",
          // 送料: 300円×箱数（最低1,000円）
          shippingFor: (boxes) => Math.max(300 * boxes, 1000),
          // JavaScriptで価格を表示する作りのため自動取得ができない。
          // 商品価格は固定値（staticPrice）で運用し、運営者が定期的に
          // （目安2週間ごと）手動で最新価格に更新する方針とする。
          pages: {
            1: {
              staticPrice: 2780,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1P%2F",
            },
            2: {
              staticPrice: 5556,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1P%212%2F",
            },
            4: {
              staticPrice: 11100,
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=25PI8T+9SI0AA+76W+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lensmode.com%2Fgoods%2Findex%2Fgc%2FCP1P%214%2F",
            },
            // 6箱セットの取り扱いが無いため設定なし
          },
        },
        {
          name: "レンズラボ",
          // 送料: 全国一律700円
          shippingFor: () => 700,
          pages: {
            1: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0101-1",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0101-1",
            },
            2: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0101-2",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0101-2",
            },
            4: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0101-4",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0101-4",
            },
            6: {
              scrapeUrl: "https://www.lens-labo.com/item/detail?itemcd=L0101-6",
              affiliateUrl:
                "https://px.a8.net/svt/ejp?a8mat=2ZH1FY+BRCL9U+3SZ4+BW0YB&a8ejpredirect=https%3A%2F%2Fwww.lens-labo.com%2Fitem%2Fdetail%3Fitemcd%3DL0101-6",
            },
          },
        },
      ],
    },

    /** 商品名が「プロクリアワンデー マルチフォーカル(遠近両用)」であることを確認する */
    isCorrectProduct(name) {
      if (!name) return false;
      const n = name.replace(/\s/g, "");
      if (/(乱視用|トーリック|toric)/i.test(n)) return false;
      if (!/(マルチフォーカル|遠近両用)/i.test(n)) return false;
      return /プロクリア/.test(n);
    },

    // この商品には90枚パックの設定が無く、標準サイズ(30枚入り)の
    // 1/2/4/6箱のみで展開されている（通常版プロクリアとは構成が異なる）。
    units: [
      {
        key: "box6",
        label: "6箱(180枚)",
        totalLenses: 180,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー マルチフォーカル 6箱セット(180枚)",
        // 参考価格(6箱14,760円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 12000, max: 18000 },
        // 「4箱」等の商品に埋もれやすいため、「6箱」を含む検索キーワードに絞り込む
        hintedKeyword: "プロクリアワンデー マルチフォーカル 6箱",
        introHtml: "",
        matches(name) {
          return isBoxCount(name, 6) || /180枚/.test(name.replace(/\s/g, ""));
        },
      },
      {
        key: "box4",
        label: "4箱(120枚)",
        totalLenses: 120,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー マルチフォーカル 4箱セット(120枚)",
        // 参考価格(4箱9,860円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 8000, max: 12000 },
        introHtml: `    <h2 class="section-heading">4箱(単品)でも比較したい方へ</h2>
    <p>
      4箱セット(120枚)で販売しているショップも見つかった場合は、
      こちらに別枠で掲載しています。<strong>6箱とは金額の単位が異なる</strong>ため、
      比較する際は1枚あたりの単価をご確認ください。
    </p>`,
        matches(name) {
          return isBoxCount(name, 4) || /120枚/.test(name.replace(/\s/g, ""));
        },
      },
      {
        key: "box2",
        label: "2箱(60枚)",
        totalLenses: 60,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー マルチフォーカル 2箱セット(60枚)",
        // 参考価格(2箱4,900円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 4000, max: 6200 },
        introHtml: `    <h2 class="section-heading">2箱(単品)でも比較したい方へ</h2>
    <p>
      2箱セット(60枚)で販売しているショップも見つかった場合は、
      こちらに別枠で掲載しています。<strong>6箱・4箱とは金額の単位が異なる</strong>ため、
      比較する際は1枚あたりの単価をご確認ください。
    </p>`,
        matches(name) {
          return isBoxCount(name, 2) || /60枚/.test(name.replace(/\s/g, ""));
        },
      },
      {
        key: "box1",
        label: "1箱(30枚)",
        totalLenses: 30,
        heroLabel: "本日の総合最安値（1枚あたり）",
        heroName: "プロクリアワンデー マルチフォーカル 1箱(30枚)",
        // 参考価格(1箱2,590円)をもとに、価格帯を直接指定して追加取得する
        priceHint: { min: 2000, max: 3500 },
        introHtml: `    <h2 class="section-heading">1箱(単品)でも比較したい方へ</h2>
    <p>
      「まずは1箱だけ試したい」という方向けに、1箱(30枚)の価格帯も
      別枠で掲載しています。<strong>6箱・4箱・2箱とは金額の単位が異なる</strong>
      ため、比較する際は1枚あたりの単価をご確認ください。
    </p>`,
        matches(name) {
          if (!name) return false;
          const n = stripShippingPromoText(name.replace(/\s/g, ""));
          if (/(2箱|3箱|4箱|5箱|6箱|60枚|120枚|180枚)/.test(n)) return false;
          return true;
        },
      },
    ],

    productIntroHtml: `    <h2 class="section-heading">処方箋不要で購入できるショップを中心に比較しています</h2>
    <p>
      プロクリアワンデー マルチフォーカル(遠近両用)は、コンタクトレンズの中でも
      「処方箋の提示が必要」なショップで取り扱われることが多い商品です。
      当サイトでは、商品名や説明文に「処方箋あり」「処方箋必要」などと明記された
      商品はあらかじめ除外していて、処方箋不要で購入できるショップを中心に
      価格を比較しています。
    </p>
    <p>
      楽天・Yahooで扱っているお店は処方箋が必要です。でも店頭で購入するよりは
      安いので処方箋を用意できる方は、ぜひ利用したいですね！
      処方箋が不要というと一般激安サイトで手にすることになりますが、安いサイトも
      ありますので、参考にしてくださいね。掲載金額はもちろん送料無料（又は込み）です。
    </p>
    <p>
      あわせて、購入する数量によって1枚あたりの単価が変わる点にも注目しています。
      1箱(30枚)だけの購入は単価が割高になりがちですが、<strong>6箱(180枚)</strong>は
      まとめ買い向けに価格設定しているショップが多く、1枚あたりの単価がもっとも
      下がりやすい傾向があります。そのため当サイトでは、6箱セットを中心に比較しつつ、
      4箱・2箱・1箱の場合も、それぞれ別枠であわせて掲載しています。
    </p>
    <p class="note">
      ※ 「処方箋不要」とは、購入時に処方箋の提示を求めないショップがある、という
      販売形態の説明であり、眼科での検査が不要という意味ではありません。
      コンタクトレンズは高度管理医療機器です。目の健康のため、定期的に眼科での
      検査を受けたうえでご購入・ご使用くださいね。
    </p>
    <p style="text-align:center; font-weight:700; color:var(--teal); margin-top:16px;">
      瞳を美しく維持するためにも…..
    </p>`,

    productInfoHeading: "プロクリアワンデー マルチフォーカル(遠近両用)とは",
    productInfoHtml: `        <p>
          プロクリアワンデー マルチフォーカル(遠近両用)は、クーパービジョン社が
          展開する、遠近両用に対応した1日使い捨てタイプのコンタクトレンズです。
          通常版と同じ独自素材「オマフィルコンA」を採用し、うるおい成分「MPC」を
          レンズに配合しているのが特徴とされています。
        </p>
        <h3>ナチュラル サメーション テクノロジー デザイン</h3>
        <p>
          レンズの中心から外側に向かって度数がなだらかに変化する設計により、
          近くから遠くまでピントを合わせやすいよう工夫されています。まばたきや
          視線移動の際の違和感を抑え、自然な見え方を目指した設計とされています。
          ADD(加入度数)は+1.50のみの展開です。
        </p>
        <h3>うるおいを保つ設計</h3>
        <p>
          通常版と同様、MPCという保水成分により、レンズ内の水分が減少しにくく、
          装用中のうるおいが続きやすいとされています。
        </p>
        <h3>こんな方におすすめ</h3>
        <ul>
          <li>近くも遠くも見えづらさを感じ始めた方</li>
          <li>老眼鏡と裸眼を使い分けるのが面倒に感じる方</li>
          <li>装用中のうるおいを重視したい方</li>
          <li>まとめ買いでコストを抑えたい方</li>
        </ul>
        <p class="note">
          ※ 度数・ADD(加入度数)・カーブなどの詳細仕様は変更される場合があります。
          遠近両用レンズは見え方の感じ方に個人差が大きいため、
          ご購入前に必ず眼科での検査・処方をふまえてご確認ください。
          本ページは購入の最終判断材料としてではなく、比較検討のための
          参考情報としてご活用ください。
        </p>`,
  },
];

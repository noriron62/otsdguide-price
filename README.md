# otsdguide-price

otsdguide.org(プロクリアワンデー通販激安最安値情報)の価格自動更新・静的サイト生成の仕組み。

[[lens-price-site]] (oasisu / newmediagallery.org) の価格取得ロジック(楽天市場・
Yahoo!ショッピングAPI連携、処方箋不要ショップのスクレイピング)をそのまま流用し、
otsdguide.org 独自のデザイン(旧WordPressテーマを踏襲、処方箋不要ランキングを
前面に出す構成)で1枚の `index.html` を生成する。

## 構成

```
scripts/
  products.config.mjs      商品設定(標準品・マルチフォーカルの2商品)
  build-otsdguide.mjs      ビルドスクリプト本体(このリポジトリの主役)
  deploy-ftp.mjs           FTPデプロイスクリプト
  lib/
    common.mjs             oasisu側の共通ロジック(価格取得・単価計算等、そのまま移植)
    scrape-rx-free.mjs     処方箋不要ショップのスクレイピング(そのまま移植)
    fetch-product-data.mjs 商品1件ぶんの価格データを取得する(HTML生成を含まない)
    otsdguide-render.mjs   otsdguide.org独自デザインでHTML断片を生成する
docs-template/
  index.template.html      サイト全体のHTMLテンプレート(プレースホルダー方式)
  assets/                  CSS・画像一式
docs-otsdguide/            ビルド結果の出力先(index.html, sitemap.xml, robots.txt等)
  _price-history/          日々の価格推移データ(JSON)の保存先。次回ビルド時に
                            前回分を読み込んで追記するための内部データで、
                            ページからリンクされることはない
                            (実際に公開して問題はないが、非表示にしたい場合は
                            deploy-ftp.mjs側でこのフォルダだけ除外するよう
                            調整してもよい)
.github/workflows/
  update-otsdguide.yml     GitHub Actionsワークフロー
```

## ローカルでのビルド確認

```bash
npm install
npm run build   # docs-otsdguide/index.html が生成される
```

APIキー等の環境変数が未設定でも、エラーにはならず該当データが空(「現在取得
できません」表示)になるだけなので、レイアウト確認だけならそのまま実行できる。

## セットアップに必要な作業(この場では完結できない部分)

### 1. GitHubリポジトリの作成・push

このプロジェクト一式を新しいGitHubリポジトリ(例: `otsdguide-price`)として
作成し、pushする。

### 2. GitHub Secretsの登録

[[lens-price-site]] (oasisu)側と共通のSecretsは、値をそのままコピーして
このリポジトリにも登録すればよい。

- `RAKUTEN_APP_ID` / `RAKUTEN_ACCESS_KEY` / `RAKUTEN_AFFILIATE_ID`
- `YAHOO_CLIENT_ID`
- `MOSHIMO_A_ID` / `MOSHIMO_P_ID` / `MOSHIMO_PC_ID` / `MOSHIMO_PL_ID`
- `VALUECOMMERCE_SID` / `VALUECOMMERCE_PID`
- `FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD`
  (oasisuと同じXserverアカウントを使う場合は共通の値でよい)

このリポジトリ固有のSecretsとして、以下を新規に登録する。

- `OTSDGUIDE_SITE_BASE_URL` … `https://otsdguide.org` (末尾スラッシュ無し)
- `OTSDGUIDE_FTP_BASE_DIR` … otsdguide.org の公開フォルダの絶対パス
  (例: `/otsdguide.org/public_html`。Xserverのサーバーパネルで確認できる)

### 3. cron-job.orgでの定期実行設定

oasisuと同様、GitHub Actionsの`workflow_dispatch`をcron-job.org等の外部
サービスから定期的に呼び出す運用を想定している。呼び出しURLは
`https://api.github.com/repos/<ユーザー名>/otsdguide-price/actions/workflows/update-otsdguide.yml/dispatches`
になる(GitHubのPersonal Access Tokenが必要)。

### 4. 動作確認

初回は`workflow_dispatch`を手動実行し、実際に楽天/Yahoo!/レンズラボから
価格が取れているか、FTPデプロイが成功しているかを確認する。

このチャットの検証環境ではAPIキーが無いためレンズモード(固定値)以外は
「現在取得できません」表示になっていたが、実際のAPIキー・GitHub Actions
環境からのアクセスであれば正常に取得できるはずである(レンズラボの
スクレイピングがこの検証環境でHTTP 403だったのは、サンドボックス環境
からのアクセスをブロックされたためと考えられる)。

## 今後の拡張候補

- 価格推移グラフ(現状は「価格推移グラフを挿入」というプレースホルダーの
  まま。[[lens-price-site]]側の`renderHistoryChart`関数を移植すれば表示できる)
- 旧WordPressサイトの主要ページから新サイトへの301リダイレクト設定
  (`otsdguide.org/.htaccess`。旧サイトはトップページ+`page/3/`に集約されて
  いたため、リダイレクト対象は限定的なはず)

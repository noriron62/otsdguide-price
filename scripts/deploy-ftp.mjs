// scripts/deploy-ftp.mjs
//
// docs-otsdguide/ フォルダの中身を、FTPの公開フォルダ(otsdguide.orgの
// ドキュメントルート)にそのままアップロードする。
//
// oasisu(newmediagallery.org)側は「1商品=1サブディレクトリ」構成のため
// 複数フォルダをループしてアップロードする仕組みだったが、otsdguide.org は
// 単独のサイト(1ページ構成)なので、docs-otsdguide/ の中身をまるごと
// ベースディレクトリ直下にアップロードするだけのシンプルな構成にしている。
//
// 環境変数（GitHub Actions の Secrets）:
//   FTP_SERVER / FTP_USERNAME / FTP_PASSWORD
//     oasisu(newmediagallery.org)と同じXserverアカウントを使う場合は
//     共通のSecretをそのまま流用できる。
//   FTP_BASE_DIR（このリポジトリでは OTSDGUIDE_FTP_BASE_DIR という名前で
//     ワークフロー側からこの環境変数に渡している）
//     otsdguide.org の公開フォルダの絶対パス
//     （例: /otsdguide.org/public_html。Xserver等、1つのFTPアカウントで
//     複数ドメインを管理している場合に、ドメインごとの公開フォルダを
//     明示的に指定する）。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "basic-ftp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCAL_DIR = path.join(ROOT, "docs-otsdguide");

const FTP_SERVER = process.env.FTP_SERVER || "";
const FTP_USERNAME = process.env.FTP_USERNAME || "";
const FTP_PASSWORD = process.env.FTP_PASSWORD || "";
const FTP_SECURE = (process.env.FTP_SECURE || "true") !== "false";
const FTP_BASE_DIR = (process.env.FTP_BASE_DIR || "").replace(/\/+$/, "");

async function main() {
  if (!FTP_SERVER || !FTP_USERNAME || !FTP_PASSWORD) {
    console.error(
      "[error] FTP_SERVER / FTP_USERNAME / FTP_PASSWORD のいずれかが未設定です。デプロイをスキップします。"
    );
    process.exit(1);
  }

  const client = new Client();
  client.ftp.verbose = false;

  await client.access({
    host: FTP_SERVER,
    user: FTP_USERNAME,
    password: FTP_PASSWORD,
    secure: FTP_SECURE,
  });

  let baseDir;
  if (FTP_BASE_DIR) {
    await client.cd(FTP_BASE_DIR);
    baseDir = await client.pwd();
    console.log(`[debug] FTP_BASE_DIR を指定された場所に移動しました: ${baseDir}`);
  } else {
    baseDir = await client.pwd();
    console.log(`[debug] FTP_BASE_DIR 未指定のため、ログイン直後の場所を使用: ${baseDir}`);
  }

  console.log(`\n=== ${LOCAL_DIR} → ${baseDir}/ ===`);
  try {
    await client.cd(baseDir);
    await client.uploadFromDir(LOCAL_DIR);
    console.log(`  OK: ${LOCAL_DIR} をアップロードしました`);
  } catch (err) {
    console.error(`  [error] アップロードに失敗しました: ${err.message}`);
    client.close();
    process.exit(1);
  }

  client.close();
  console.log("\n=== デプロイ完了 ===");
}

main().catch((err) => {
  console.error("致命的なエラーが発生しました:", err);
  process.exit(1);
});

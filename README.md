# panel-de-pon

落ち物パズル「パネルでポン」をブラウザで遊べるようにしたものです。スマホの縦画面向けに作っていて、ひとりで遊ぶモードと、友人とのオンライン対戦ができます。

**遊ぶ:** https://123yoshidandy.github.io/panel-de-pon/

## できること

- **ひとりで遊ぶ**：時間とともにお邪魔ゲージが溜まり、満タンになるとお邪魔ブロックが降ってくる。連鎖・同時消しでゲージを減らせる
- **オンライン対戦（2人）**：連鎖・同時消しで相手にお邪魔ブロックを送る。送られてきたお邪魔ブロックは自分の攻撃で打ち消せる
- **操作**（スマホ・PC 共通）
  - ブロックを左右にドラッグ：移動
  - フィールドの外を長押し：せり上げ
  - フィールドの外をダブルタップ（ダブルクリック）：平滑化（高い列のブロックを隣の低い列へずらす）
- **設定**：難易度（れんしゅう／やさしい／ふつう／むずかしい。ブロックは5色で、むずかしいだけ青を加えた6色）、効果音、BGM。設定と名前はブラウザに保存する

## 遊び方

### オンライン対戦
1. タイトル画面で「オンライン対戦」を押し、名前を入れて「部屋を作る」を押す
2. 「招待URLを送る」で友人にURLを送る（友人は開いて「オンライン対戦」→「参加する」を押す。部屋番号（数字5桁）でも参加できる）
3. 部屋を作った人が「対戦スタート」を押す
4. 勝敗がついたら「部屋に戻る」で、同じ相手と続けて遊べる

## 開発

必要なもの：Node.js 22 以上、Python 3（画面を手元で配信するため）

```bash
npm install

# 画面を手元で配信して http://localhost:8000 を開く
python3 -m http.server 8000

# テスト
npm test
```

### オンライン対戦を手元で試す

AWS を使わずに、同じ処理のテスト用サーバーを手元で動かせます。画面を `localhost` で開くと、自動でこのサーバーにつながります。ブラウザのタブを2つ開けば、ひとりで対戦を試せます。

```bash
npm run dev:server   # ws://localhost:8787
```

URLに `?server=wss://...` を付けると、接続先のサーバーを変えられます。

## 構成

```
index.html css/ sounds/   画面（GitHub Pages でそのまま公開する）
js/
  game.js          ゲームの進行（DOMに依存しない。対戦用のルールも含む）
  Block.js constants.js settings.js random.js
  renderer.js layout.js input.js sound.js title.js
  online.js        オンライン対戦のサーバーとの通信
  online-config.js 接続先のサーバーの URL
  lobby.js         オンライン対戦の画面（部屋の作成・参加）
  main.js          画面の切り替えとゲームループ
server/            オンライン対戦のサーバー
  src/room-service.js  部屋の処理（作成・参加・開始・中継・勝敗）
  src/handler.js       Lambda の入口
  src/dynamo-store.js  DynamoDB への保存
  dev-server.js        手元で試すためのテスト用サーバー
  template.yaml        AWS SAM のテンプレート
test/              テスト（Vitest）
```

### オンライン対戦のしくみ

- ゲームはそれぞれの端末で進め、サーバーは部屋の管理と、相手へのメッセージの中継だけを行う
- 中継するのは、攻撃（送るお邪魔ブロック）と、相手の画面に表示する自分のフィールドの様子（約0.2秒ごと）
- 対戦の開始時に2人に同じシードを配り、ブロックの並びをそろえる
- ゲームオーバーになった端末が負けをサーバーに伝え、サーバーが2人に勝敗を知らせる

## サーバー（AWS）

API Gateway（WebSocket）・Lambda・DynamoDB を AWS SAM で作ります（東京リージョン、スタック名 `panel-de-pon-online`）。

- 部屋は最後の操作から2日で自動的に消える。ログは7日で消える
- 想定外のアクセスに備えて、受け付けるリクエストの数に上限を設けている

### デプロイ

AWS SAM CLI と AWS CLI が必要です。プロフィールは環境変数で渡します。変更内容を表示し、確認してから反映します。

```bash
AWS_PROFILE=<プロフィール名> npm run deploy:server
```

デプロイ後に出力される `WebSocketUrl` を、`js/online-config.js` の `DEPLOYED_SERVER_URL` に書きます。画面は main ブランチに push すると GitHub Pages に反映されます。

## Reference

https://qiita.com/z0ero/items/2f681e3bee594ab3fffe

// 遊び方の画面と、確認のダイアログ（タイトル・プレイ中の画面の上に重ねて出す）

let overlay = null;

function open(html, actions) {
    close();
    overlay = document.createElement('div');
    overlay.id = 'help-screen';
    overlay.innerHTML = html;
    for (const button of overlay.querySelectorAll('[data-action]')) {
        button.addEventListener('click', () => {
            close();
            actions[button.dataset.action]?.();
        });
    }
    document.body.append(overlay);
}

function close() {
    overlay?.remove();
    overlay = null;
}

// 遊び方の画面。versus が true なら、対戦中はゲームが止まらないことを添える。閉じると onClose()
export function showHelp({ versus = false, onClose = () => {} } = {}) {
    open(`
        <div class="help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
            <h2 id="help-title" class="help-title">遊び方</h2>
            ${versus ? '<p class="help-note">対戦中は、この画面を開いていてもゲームは止まりません</p>' : ''}
            <section>
                <h3>ルール</h3>
                <ul>
                    <li>パネルを左右に入れ替えて、同じ色を縦か横に3つ以上並べると消えます</li>
                    <li>パネルは下から少しずつせり上がってきます。一番上まで積み上がった状態でさらにせり上がると、ゲームオーバーです</li>
                    <li>パネルが消えている間は、せり上がりが止まります</li>
                    <li>4つ以上を一度に消すと<strong>同時消し</strong>、消えたあとに落ちてきたパネルでまた消えると<strong>連鎖</strong>になります</li>
                    <li>お邪魔ブロックは、接しているパネルを消すとパネルに変わります</li>
                    <li>1人プレイでは、時間とともに上のお邪魔ゲージが溜まり、満タンになるとお邪魔ブロックが降ってきます。連鎖や同時消しでゲージを減らせます</li>
                </ul>
            </section>
            <section>
                <h3>操作</h3>
                <dl class="help-controls">
                    <dt>パネルを左右にドラッグ</dt><dd>移動</dd>
                    <dt>フィールド外を長押し</dt><dd>せり上げ</dd>
                    <dt>フィールド外をダブルタップ</dt><dd>段差をならす</dd>
                </dl>
                <p class="help-detail">段差をならすと、台を揺らして、高い列のパネルを隣の低い列へずらします</p>
            </section>
            <section>
                <h3>オンライン対戦</h3>
                <ul>
                    <li>連鎖や同時消しをすると、相手にお邪魔ブロックを送ります</li>
                    <li>送られてくるお邪魔ブロックは、降ってくる前に自分の連鎖や同時消しで打ち消せます</li>
                    <li>先にゲームオーバーになった方が負けです</li>
                </ul>
            </section>
            <button type="button" class="help-close" data-action="close">閉じる</button>
        </div>
    `, { close: onClose });
}

// はい・いいえの確認。onYes() / onNo()
export function showConfirm({ title, text = '', yes, no, onYes, onNo = () => {} }) {
    open(`
        <div class="help-card confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" class="help-title">${title}</h2>
            ${text ? `<p class="help-note">${text}</p>` : ''}
            <div class="confirm-buttons">
                <button type="button" class="help-close" data-action="no">${no}</button>
                <button type="button" class="help-close primary" data-action="yes">${yes}</button>
            </div>
        </div>
    `, { yes: onYes, no: onNo });
}

export const isHelpOpen = () => overlay !== null;

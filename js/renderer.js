import {
    WIDTH, HEIGHT, BLOCK_SIZE, LAND_BOUNCE_FRAMES, PANEL_STYLES, CHAIN_COLOR, COMBO_COLOR,
    GARBAGE_GAUGE_MAX, GARBAGE_GAUGE_WARNING, SHAKE_FRAMES
} from './constants.js';
import {
    getRaiseOffset, flattenMovePosition, panelOffset, garbageOffset, clearProgress, CLEAR
} from './game.js';
import { isGarbageEnabled } from './settings.js';
import { panelSprite, panelLayers, drawGarbage, pixelRatio } from './panel-art.js';

const POP_EFFECT_FRAMES = 14; // 弾けたあとに輪と星が広がる時間
const FONT = "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', sans-serif";

export let canvas;
export let gameOverElement;
export let gaugeElement;
let gaugeFillElement;
let g;
let scoreElement;
let maxChainElement;

// 対戦用（相手のフィールド・相手の名前・自分への予告・勝敗の表示）
export let opponentCanvas;
export let opponentLabel;
export let incomingElement;
export let versusResultElement;
let og;
let incomingKey = '';

// 描画の初期化。onRestart・onBackToTitle はゲームオーバー画面、onRematch・onBackToRoom は対戦の勝敗画面のボタンで呼ばれる
export function initRenderer({ onRestart, onBackToTitle, onRematch, onBackToRoom }) {
    canvas = document.createElement('canvas');
    canvas.classList.add('field');
    g = canvas.getContext('2d');
    document.body.append(canvas);

    opponentCanvas = document.createElement('canvas');
    opponentCanvas.classList.add('opponent-field');
    og = opponentCanvas.getContext('2d');
    opponentLabel = document.createElement('div');
    opponentLabel.classList.add('opponent-label');
    incomingElement = document.createElement('div');
    incomingElement.classList.add('incoming');
    versusResultElement = document.createElement('div');
    versusResultElement.classList.add('message');
    versusResultElement.innerHTML = `
        <div class="message-card">
            <div class="versus-result-title"></div>
            <div class="message-score versus-result-score"></div>
            <div class="message-buttons">
                <button type="button" class="message-button primary" data-action="rematch">もう1回</button>
                <button type="button" class="message-button" data-action="room">部屋に戻る</button>
            </div>
            <div class="versus-result-note"></div>
        </div>
    `;
    versusResultElement.querySelector('[data-action="rematch"]').addEventListener('click', () => onRematch());
    versusResultElement.querySelector('[data-action="room"]').addEventListener('click', () => onBackToRoom());
    document.body.append(opponentCanvas, opponentLabel, incomingElement, versusResultElement);
    setVersusVisible(false);

    // お邪魔ブロックのゲージ
    gaugeElement = document.createElement('div');
    gaugeElement.classList.add('garbage-gauge');
    gaugeFillElement = document.createElement('div');
    gaugeFillElement.classList.add('garbage-gauge-fill');
    gaugeElement.append(gaugeFillElement);
    document.body.append(gaugeElement);

    gameOverElement = document.createElement('div');
    gameOverElement.classList.add('message');
    gameOverElement.innerHTML = `
        <div class="message-card">
            <div class="game-over-title">GAME OVER</div>
            <div class="message-score">がんばった時間 <span class="game-over-time"></span> 秒</div>
            <div class="message-score">最大連鎖 <span class="game-over-chain"></span></div>
            <div class="message-buttons">
                <button type="button" class="message-button primary" data-action="restart">もう一度</button>
                <button type="button" class="message-button" data-action="title">タイトルへ</button>
            </div>
        </div>
    `;
    scoreElement = gameOverElement.querySelector('.game-over-time');
    maxChainElement = gameOverElement.querySelector('.game-over-chain');
    const actions = { restart: onRestart, title: onBackToTitle };
    for (const button of gameOverElement.querySelectorAll('.message-button')) {
        button.addEventListener('click', () => {
            button.blur();
            actions[button.dataset.action]();
        });
    }
    document.body.append(gameOverElement);

    return canvas;
}

// ===== フィールド =====

// 盤面の地（紺の地に、ごくうすい市松模様のマス目）
function drawBackdrop(raiseY) {
    const size = BLOCK_SIZE;
    for (let y = -1; y <= HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            if ((x + y) % 2) continue;
            g.fillStyle = 'rgba(255, 255, 255, 0.035)';
            g.fillRect(x * size, y * size - raiseY, size, size);
        }
    }
}

// パネル1枚を描く。bounce（着地の弾み）が残っている間は、板は動かさず記号だけを少し下に揺らす
function drawPanel(color, px, py, { variant = 'normal', bounce = 0, scale = 1, alpha = 1 } = {}) {
    const size = BLOCK_SIZE;
    g.save();
    g.globalAlpha = alpha;
    if (bounce > 0 && variant === 'normal' && scale === 1) {
        const { slab, mark } = panelLayers(color, size);
        const dip = Math.sin(Math.PI * bounce / LAND_BOUNCE_FRAMES) * size * 0.07;
        g.drawImage(slab, px, py, size, size);
        // 沈んだ記号が縁にかからないよう、板の面の内側だけに描く
        g.beginPath();
        g.rect(px + size * 0.08, py + size * 0.08, size * 0.84, size * 0.84);
        g.clip();
        g.drawImage(mark, px, py + dip, size, size);
    } else {
        // scale は下を支点に縮める（弾ける直前）
        g.translate(px + size / 2, py + size);
        g.scale(scale, scale);
        g.drawImage(panelSprite(color, size, variant), -size / 2, -size, size, size);
    }
    g.restore();
}

// 弾けたパネルの跡に、広がる輪と星を描く（frame は弾けてからのフレーム数）
function drawPop(color, px, py, frame) {
    const size = BLOCK_SIZE;
    const k = frame / POP_EFFECT_FRAMES;
    const cx = px + size / 2;
    const cy = py + size / 2;
    g.save();
    g.globalAlpha = 1 - k;
    g.strokeStyle = PANEL_STYLES[color].light;
    g.lineWidth = size * 0.1 * (1 - k) + 1;
    g.beginPath();
    g.arc(cx, cy, size * (0.25 + 0.45 * k), 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; ++i) {
        const angle = Math.PI / 4 + i * Math.PI / 2;
        const d = size * (0.2 + 0.6 * k);
        const r = size * 0.09 * (1 - k);
        g.beginPath();
        g.arc(cx + Math.cos(angle) * d, cy + Math.sin(angle) * d, r, 0, Math.PI * 2);
        g.fill();
    }
    g.restore();
}

// 連鎖数（×2）・同時消し数（4）のバッジ。時間とともに少しずつ浮かぶ
function drawPopup(popup, raiseY) {
    const size = BLOCK_SIZE;
    const rise = popup.t * size / 60;
    const w = size * 1.1;
    const h = size * 0.75;
    const px = popup.x * size + size / 2 - w / 2;
    const py = popup.y * size - raiseY - rise + (size - h) / 2;
    const isChain = popup.kind === 'chain';
    g.save();
    g.globalAlpha = Math.min(1, (60 - popup.t) / 12);
    g.fillStyle = isChain ? CHAIN_COLOR : COMBO_COLOR;
    g.strokeStyle = '#fff';
    g.lineWidth = size / 14;
    g.beginPath();
    g.roundRect(px, py, w, h, h / 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `800 ${size * 0.5}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(isChain ? `×${popup.value}` : `${popup.value}`, px + w / 2, py + h / 2 + size * 0.02);
    g.restore();
}

// 描画処理。countdown が 1 以上なら、対戦開始までの秒数を大きく表示する
export function render(state, { countdown = 0 } = {}) {
    const ratio = pixelRatio();
    const size = BLOCK_SIZE;
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const raiseY = getRaiseOffset(state);
    drawBackdrop(raiseY);

    // 平滑化で移っているパネルは、着くまで移動先のマスには描かない
    const flying = [];
    const hidden = new Set();
    for (const move of state.flattenMoves) {
        const pos = flattenMovePosition(move, state.flattenFrame);
        if (!pos) continue;
        flying.push({ color: move.color, ...pos });
        hidden.add(move.toY * WIDTH + move.toX);
    }

    for (let y = 0; y < HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            const item = state.grid[y][x];
            if (item?.kind !== 'panel' || hidden.has(y * WIDTH + x)) continue;
            const { dx, dy } = panelOffset(item);
            const px = (x + dx) * size;
            const py = (y + dy) * size - raiseY;
            if (item.phase === CLEAR) {
                const { flash, popped, t } = clearProgress(item);
                if (popped) {
                    if (t - item.popAt < POP_EFFECT_FRAMES) drawPop(item.color, px, py, t - item.popAt);
                } else if (flash) {
                    drawPanel(item.color, px, py, { variant: (t >> 2) & 1 ? 'flash' : 'normal' });
                } else {
                    drawPanel(item.color, px, py, { variant: 'faded', scale: 0.92 });
                }
                continue;
            }
            drawPanel(item.color, px, py, { bounce: item.bounce });
        }
    }

    // 次にせり上がってくる段（暗く）
    for (let x = 0; x < WIDTH; ++x) {
        drawPanel(state.next[x], x * size, HEIGHT * size - raiseY, { alpha: 0.4 });
    }

    for (const garbage of state.garbages) {
        const flash = garbage.clearing && (garbage.t & 4) !== 0;
        drawGarbage(g, size, garbage.x * size, (garbage.y + garbageOffset(garbage)) * size - raiseY,
            garbage.width, garbage.height, flash);
    }

    for (const f of flying) {
        drawPanel(f.color, f.x * size, f.y * size - raiseY);
    }

    // 平滑化でフィールドを左右に揺らす（だんだん小さくなる）
    const shake = state.shakeFrame > 0
        ? Math.sin(state.shakeFrame * Math.PI / 2) * size / 8 * state.shakeFrame / SHAKE_FRAMES
        : 0;
    canvas.style.transform = shake ? `translateX(${shake}px)` : '';

    for (const popup of state.popups) drawPopup(popup, raiseY);

    if (countdown > 0) {
        g.fillStyle = 'rgba(255, 255, 255, 0.45)';
        g.fillRect(0, 0, WIDTH * size, HEIGHT * size);
        g.font = `800 ${size * 3}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = size / 4;
        g.strokeStyle = '#fff';
        g.strokeText(String(countdown), WIDTH * size / 2, HEIGHT * size / 2);
        g.fillStyle = CHAIN_COLOR;
        g.fillText(String(countdown), WIDTH * size / 2, HEIGHT * size / 2);
    }

    gaugeElement.style.visibility = state.mode === 'solo' && isGarbageEnabled(state.settings) ? 'visible' : 'hidden';
    renderGauge(state.garbageGauge / GARBAGE_GAUGE_MAX);
    if (state.mode === 'versus') renderIncoming(state.incoming);
}

// 自分に送られてきて、まだ降っていないお邪魔ブロック（幅に比例した長さで並べ、2段以上は段数も出す）
function renderIncoming(incoming) {
    const key = incoming.map(p => `${p.width}x${p.height}`).join(',');
    if (key === incomingKey) return;
    incomingKey = key;
    incomingElement.innerHTML = incoming.map(p =>
        `<span class="incoming-piece" style="flex-basis: ${p.width / WIDTH * 100}%">${p.height > 1 ? `×${p.height}` : ''}</span>`
    ).join('');
}

// 対戦用の表示（相手のフィールド・予告）を出すか
export function setVersusVisible(visible) {
    for (const element of [opponentCanvas, opponentLabel, incomingElement]) {
        element.style.display = visible ? '' : 'none';
    }
    if (!visible) hideVersusResult();
    incomingKey = '';
    incomingElement.innerHTML = '';
}

// 相手のフィールドを小さく描く。snapshot は相手から届いたフィールドの様子（game.js の getSnapshot）
// info: { name, connected }
export function renderOpponent(snapshot, info) {
    const ratio = pixelRatio();
    const size = opponentCanvas.width / ratio / WIDTH;
    og.setTransform(ratio, 0, 0, ratio, 0, 0);
    og.clearRect(0, 0, WIDTH * size, HEIGHT * size);
    if (snapshot) {
        const raiseY = Math.floor(size * snapshot.raise);
        for (let i = 0; i < WIDTH * HEIGHT; ++i) {
            const c = snapshot.cells[i];
            if (c === '.') continue;
            drawMiniPanel(Number(c), (i % WIDTH) * size, Math.floor(i / WIDTH) * size - raiseY, size);
        }
        for (const [x, y, width, height, clearing] of snapshot.garbages) {
            drawGarbage(og, size, x * size, y * size - raiseY, width, height, Boolean(clearing));
        }
        og.globalAlpha = 0.4;
        for (let x = 0; x < WIDTH; ++x) {
            drawMiniPanel(Number(snapshot.next[x]), x * size, HEIGHT * size - raiseY, size);
        }
        og.globalAlpha = 1;
    }
    opponentLabel.textContent = `${info.name}${info.connected ? '' : '（切断中）'}`;
}

// 相手のフィールドの小さなパネル（濃い板に、記号の色の四角）
function drawMiniPanel(color, px, py, size) {
    const style = PANEL_STYLES[color];
    const inset = Math.max(0.5, size * 0.05);
    og.fillStyle = style.base;
    og.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
    og.fillStyle = style.symbol;
    og.fillRect(px + size * 0.28, py + size * 0.28, size * 0.44, size * 0.44);
}

// 対戦の勝敗を表示する。title は 'WIN' など、score は勝ち数の表示、note は「相手を待っています」などの一言。
// canRematch が false なら「もう1回」を押せなくする（押したあと・相手が部屋を出たあと）
export function showVersusResult(title, score, { note = '', canRematch = true } = {}) {
    versusResultElement.querySelector('.versus-result-title').textContent = title;
    versusResultElement.querySelector('.versus-result-score').textContent = score;
    versusResultElement.querySelector('.versus-result-note').textContent = note;
    versusResultElement.querySelector('[data-action="rematch"]').disabled = !canRematch;
    versusResultElement.dataset.result = title;
    versusResultElement.style.visibility = 'visible';
    canvas.style.filter = `blur(${BLOCK_SIZE / 6}px) saturate(0.8)`;
}

export function hideVersusResult() {
    versusResultElement.style.visibility = 'hidden';
    canvas.style.filter = '';
}

// お邪魔ブロックのゲージ（ratio は 0〜1）
function renderGauge(ratio) {
    gaugeFillElement.style.width = `${ratio * 100}%`;
    gaugeElement.classList.toggle('warning', ratio >= GARBAGE_GAUGE_WARNING);
    gaugeElement.classList.toggle('full', ratio >= 1);
}

// ゲームオーバー表示（seconds は耐えた秒数）
export function showGameOver(seconds, maxChain) {
    scoreElement.textContent = seconds.toFixed(1);
    maxChainElement.textContent = maxChain;
    gameOverElement.style.visibility = 'visible';
    canvas.style.filter = `blur(${BLOCK_SIZE / 6}px) saturate(0.8)`;
}

export function hideGameOver() {
    gameOverElement.style.visibility = 'hidden';
    canvas.style.filter = '';
}

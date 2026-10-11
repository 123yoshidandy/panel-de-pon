import {
    WIDTH, HEIGHT, BLOCK_SIZE, GARBAGE, FALL_FRAME,
    COLORS, LIGHT_COLORS, DARK_COLORS, RELIEF,
    GARBAGE_COLOR, GARBAGE_LIGHT_COLOR, GARBAGE_DARK_COLOR, CHAIN_COLOR, COMBO_COLOR,
    GARBAGE_GAUGE_MAX, GARBAGE_GAUGE_WARNING, SHAKE_FRAME
} from './constants.js';
import { getRaiseOffset, flattenMovePosition } from './game.js';
import { isGarbageEnabled } from './settings.js';

// キャンバスとコンテキスト
export let canvas;
export let gameOverElement;
export let gaugeElement;
let gaugeFillElement;
let g;

let scoreElement;
let maxChainElement;

// 描画の初期化。onRestart・onBackToTitle はゲームオーバー画面のボタンで呼ばれる
export function initRenderer({ onRestart, onBackToTitle }) {
    canvas = document.createElement('canvas');
    canvas.classList.add('field');
    g = canvas.getContext('2d');
    document.body.append(canvas);

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
        <div class="game-over-title">GAME OVER</div>
        <div class="game-over-score">TIME <span class="game-over-time"></span> s</div>
        <div class="game-over-score">MAX CHAIN <span class="game-over-chain"></span></div>
        <div class="game-over-buttons">
            <button type="button" class="game-over-button" data-action="restart">RESTART</button>
            <button type="button" class="game-over-button" data-action="title">タイトルへ</button>
        </div>
    `;
    scoreElement = gameOverElement.querySelector('.game-over-time');
    maxChainElement = gameOverElement.querySelector('.game-over-chain');
    const actions = { restart: onRestart, title: onBackToTitle };
    for (const button of gameOverElement.querySelectorAll('.game-over-button')) {
        button.addEventListener('click', () => {
            button.blur(); // フォーカスが残ってキー入力を奪わないように
            actions[button.dataset.action]();
        });
    }
    document.body.append(gameOverElement);

    return canvas;
}

// 指定座標を中心に文字列を描画
function drawText(str, x, y) {
    const tm = g.measureText(str);
    g.fillText(str, x - 0.5 * tm.width, y + 0.5 * tm.actualBoundingBoxAscent);
}

// (px, py) を左上としてブロックを描画
function drawBlock(type, px, py) {
    const edge = BLOCK_SIZE / 16;
    g.translate(px, py);
    g.fillStyle = COLORS[type];
    g.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
    g.fillStyle = LIGHT_COLORS[type];
    drawText(RELIEF[type], 0.5 * BLOCK_SIZE, 0.5 * BLOCK_SIZE);
    g.fillRect(0, 0, BLOCK_SIZE, edge);
    g.fillRect(0, 0, edge, BLOCK_SIZE);
    g.fillStyle = DARK_COLORS[type];
    g.fillRect(0, BLOCK_SIZE - edge, BLOCK_SIZE, edge);
    g.fillRect(BLOCK_SIZE - edge, 0, edge, BLOCK_SIZE);
    g.setTransform(1, 0, 0, 1, 0, 0);
}

// お邪魔ブロックを描画（消去中は点滅）
function drawGarbage(garbage, raiseY) {
    const offsetY = garbage.falling ? garbage.count * BLOCK_SIZE / FALL_FRAME : 0;
    const flash = garbage.clearing && (garbage.count & 4) !== 0;
    drawGarbageRect(g, BLOCK_SIZE, garbage.x * BLOCK_SIZE, garbage.y * BLOCK_SIZE + offsetY - raiseY,
        garbage.width, garbage.height, flash);
}

// ctx に、(px, py) を左上として幅 width・高さ height マスのお邪魔ブロックを描く（相手のフィールドの描画でも使う）
export function drawGarbageRect(ctx, size, px, py, width, height, flash = false) {
    const edge = size / 16;
    const w = width * size;
    const h = height * size;
    ctx.translate(px, py);
    ctx.fillStyle = flash ? GARBAGE_LIGHT_COLOR : GARBAGE_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = GARBAGE_LIGHT_COLOR;
    ctx.fillRect(0, 0, w, edge);
    ctx.fillRect(0, 0, edge, h);
    ctx.fillStyle = GARBAGE_DARK_COLOR;
    ctx.fillRect(0, h - edge, w, edge);
    ctx.fillRect(w - edge, 0, edge, h);
    // 中央の模様
    ctx.strokeStyle = GARBAGE_DARK_COLOR;
    ctx.lineWidth = edge;
    ctx.strokeRect(size / 4, size / 4, w - size / 2, h - size / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// 連鎖数（x2）・同時消し数（4）を描画（時間とともに少しずつ上に浮かぶ）
function drawPopup(popup, raiseY) {
    const rise = popup.count * BLOCK_SIZE / 60;
    const px = popup.x * BLOCK_SIZE;
    const py = popup.y * BLOCK_SIZE - raiseY - rise;
    const isChain = popup.kind === 'chain';
    g.fillStyle = isChain ? CHAIN_COLOR : COMBO_COLOR;
    g.fillRect(px, py, BLOCK_SIZE, BLOCK_SIZE * 0.8);
    g.strokeStyle = 'white';
    g.lineWidth = BLOCK_SIZE / 16;
    g.strokeRect(px, py, BLOCK_SIZE, BLOCK_SIZE * 0.8);
    g.fillStyle = 'white';
    g.font = `${BLOCK_SIZE * 0.55}px Anton, sans-serif`;
    drawText(isChain ? `x${popup.value}` : `${popup.value}`, px + BLOCK_SIZE / 2, py + BLOCK_SIZE * 0.4);
}

// 描画処理
export function render(state) {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = `${BLOCK_SIZE * 0.8}px メイリオ`;
    const raiseY = getRaiseOffset(state);

    // 平滑化で移動中のブロックは、着地するまで移動先のマスには描かない
    const flying = [];
    const hidden = new Set();
    for (const move of state.flattenMoves) {
        const pos = flattenMovePosition(move, state.flattenFrame);
        if (!pos) continue;
        flying.push({ type: move.type, ...pos });
        hidden.add(move.toX + move.toY * WIDTH);
    }

    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = state.blocks[x + y * WIDTH];
            if (b.type !== GARBAGE && b.isVisible() && !hidden.has(x + y * WIDTH)) {
                drawBlock(b.type, x * BLOCK_SIZE + b.offsetX(), y * BLOCK_SIZE + b.offsetY() - raiseY);
            }
        }
        // 予告ブロック
        g.fillStyle = DARK_COLORS[state.next[x]];
        g.fillRect(x * BLOCK_SIZE, HEIGHT * BLOCK_SIZE - raiseY, BLOCK_SIZE, BLOCK_SIZE);
    }

    for (const garbage of state.garbages) {
        drawGarbage(garbage, raiseY);
    }

    for (const f of flying) {
        drawBlock(f.type, f.x * BLOCK_SIZE, f.y * BLOCK_SIZE - raiseY);
    }

    // 平滑化でフィールドを左右に揺らす（だんだん小さくなる）
    const shake = state.shakeFrame > 0
        ? Math.sin(state.shakeFrame * Math.PI / 2) * BLOCK_SIZE / 8 * state.shakeFrame / SHAKE_FRAME
        : 0;
    canvas.style.transform = shake ? `translateX(${shake}px)` : '';


    for (const popup of state.popups) {
        drawPopup(popup, raiseY);
    }

    gaugeElement.style.visibility = state.mode === 'solo' && isGarbageEnabled(state.settings) ? 'visible' : 'hidden';
    renderGauge(state.garbageGauge / GARBAGE_GAUGE_MAX);
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
    gameOverElement.style.transition = 'filter 0.666s';
    gameOverElement.style.filter = 'blur(0px)';
    canvas.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
}

// ゲームオーバー非表示
export function hideGameOver() {
    gameOverElement.style.visibility = 'hidden';
    gameOverElement.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
    canvas.style.filter = 'blur(0px)';
}

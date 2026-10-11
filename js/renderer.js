import {
    WIDTH, HEIGHT, BLOCK_SIZE, GARBAGE, FALL_FRAME,
    COLORS, LIGHT_COLORS, DARK_COLORS, RELIEF,
    GARBAGE_COLOR, GARBAGE_LIGHT_COLOR, GARBAGE_DARK_COLOR
} from './constants.js';
import { getRaiseOffset } from './game.js';

// キャンバスとコンテキスト
export let canvas;
export let gameOverElement;
let g;

// タッチ操作の端末ではカーソルを表示しない
const showCursor = !(('ontouchstart' in window) || navigator.maxTouchPoints > 0);

let scoreElement;

// 描画の初期化。onRestart はゲームオーバー画面の RESTART ボタンで呼ばれる
export function initRenderer(onRestart) {
    canvas = document.createElement('canvas');
    canvas.classList.add('field');
    g = canvas.getContext('2d');
    document.body.append(canvas);

    gameOverElement = document.createElement('div');
    gameOverElement.classList.add('message');
    gameOverElement.innerHTML = `
        <div class="game-over-title">GAME OVER</div>
        <div class="game-over-score">TIME <span class="game-over-time"></span> s</div>
        <button type="button" class="restart-button">RESTART</button>
        <div class="game-over-hint">Z / X / Enter</div>
    `;
    scoreElement = gameOverElement.querySelector('.game-over-time');
    const restartButton = gameOverElement.querySelector('.restart-button');
    restartButton.addEventListener('click', () => {
        restartButton.blur(); // フォーカスが残ってキー入力を奪わないように
        onRestart();
    });
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
    const edge = BLOCK_SIZE / 16;
    const width = garbage.width * BLOCK_SIZE;
    const offsetY = garbage.falling ? garbage.count * BLOCK_SIZE / FALL_FRAME : 0;
    const flash = garbage.clearing && (garbage.count & 4) !== 0;
    g.translate(garbage.x * BLOCK_SIZE, garbage.y * BLOCK_SIZE + offsetY - raiseY);
    g.fillStyle = flash ? GARBAGE_LIGHT_COLOR : GARBAGE_COLOR;
    g.fillRect(0, 0, width, BLOCK_SIZE);
    g.fillStyle = GARBAGE_LIGHT_COLOR;
    g.fillRect(0, 0, width, edge);
    g.fillRect(0, 0, edge, BLOCK_SIZE);
    g.fillStyle = GARBAGE_DARK_COLOR;
    g.fillRect(0, BLOCK_SIZE - edge, width, edge);
    g.fillRect(width - edge, 0, edge, BLOCK_SIZE);
    // 中央の模様
    g.strokeStyle = GARBAGE_DARK_COLOR;
    g.lineWidth = edge;
    g.strokeRect(BLOCK_SIZE / 4, BLOCK_SIZE / 4, width - BLOCK_SIZE / 2, BLOCK_SIZE / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
}

// (x, y) を左側とするペアを囲むカーソルを描画
function drawCursor(x, y, raiseY, counter) {
    g.translate((x + 0.5) * BLOCK_SIZE, (y + 0.5) * BLOCK_SIZE - raiseY);
    g.fillStyle = 'white';
    g.beginPath();
    const offset = -((Math.floor(counter / 30) & 1) + BLOCK_SIZE * 0.5);
    for (let i = 0; i < 2; ++i) {
        for (let j = 0; j < 4; ++j) {
            g.rotate(0.5 * Math.PI);
            g.rect(offset, offset, BLOCK_SIZE / 3, BLOCK_SIZE / 8);
            g.rect(offset, offset, BLOCK_SIZE / 8, BLOCK_SIZE / 3);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
}

// 描画処理
export function render(state) {
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = `${BLOCK_SIZE * 0.8}px メイリオ`;
    const raiseY = getRaiseOffset(state);

    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = state.blocks[x + y * WIDTH];
            if (b.type !== GARBAGE && b.isVisible()) {
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

    if (showCursor) {
        drawCursor(state.x, state.y, raiseY, state.counter);
    }
}

// ゲームオーバー表示（seconds は耐えた秒数）
export function showGameOver(seconds) {
    scoreElement.textContent = seconds.toFixed(1);
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

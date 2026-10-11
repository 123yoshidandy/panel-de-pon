import {
    WIDTH, HEIGHT, BLOCK_SIZE,
    COLORS, LIGHT_COLORS, DARK_COLORS, RELIEF
} from './constants.js';
import { getRaiseOffset } from './game.js';

// キャンバスとコンテキスト
export let canvas;
export let gameOverElement;
let g;

// タッチ操作の端末ではカーソルを表示しない
const showCursor = !(('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// 描画の初期化
export function initRenderer() {
    canvas = document.createElement('canvas');
    canvas.classList.add('field');
    g = canvas.getContext('2d');
    document.body.append(canvas);

    gameOverElement = document.createElement('div');
    gameOverElement.classList.add('message');
    gameOverElement.innerText = 'GAME OVER';
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
            if (b.isVisible()) {
                drawBlock(b.type, x * BLOCK_SIZE + b.offsetX(), y * BLOCK_SIZE + b.offsetY() - raiseY);
            }
        }
        // 予告ブロック
        g.fillStyle = DARK_COLORS[state.next[x]];
        g.fillRect(x * BLOCK_SIZE, HEIGHT * BLOCK_SIZE - raiseY, BLOCK_SIZE, BLOCK_SIZE);
    }

    if (showCursor) {
        drawCursor(state.x, state.y, raiseY, state.counter);
    }
}

// ゲームオーバー表示
export function showGameOver() {
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

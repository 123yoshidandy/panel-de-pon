import {
    WIDTH, HEIGHT, BLOCK_SIZE,
    COLORS, LIGHT_COLORS, DARK_COLORS, RELIEF
} from './constants.js';
import { gameState } from './game.js';

// キャンバスとコンテキスト
export let canvas;
export let g;
export let game_over;

// 描画の初期化
export function initRenderer() {
    // メインキャンバス
    canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
        position: 'absolute',
    });
    canvas.classList.add('field');
    Object.assign(canvas, { width: BLOCK_SIZE * WIDTH, height: BLOCK_SIZE * HEIGHT });
    g = canvas.getContext('2d');
    document.body.append(canvas);

    // GAME OVERテキスト
    game_over = document.createElement('div');
    Object.assign(game_over.style, {
        position: 'absolute',
        width: `${BLOCK_SIZE * WIDTH}px`,
        height: `${BLOCK_SIZE * HEIGHT}px`,
        lineHeight: `${BLOCK_SIZE * HEIGHT}px`,
        fontSize: `${BLOCK_SIZE}px`
    });
    game_over.classList.add('message');
    game_over.innerText = 'GAME OVER';
    document.body.append(game_over);

    return { canvas, g, game_over };
}

// 描画処理
export function render(blocks, next) {
    // 指定座標を中心に文字列を描画
    const drawText = (str, x, y) => {
        const tm = g.measureText(str);
        g.fillText(str, x - 0.5 * tm.width, y + 0.5 * tm.actualBoundingBoxAscent);
    };

    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = `${BLOCK_SIZE * 0.8}px メイリオ`;
    const raiseY = Math.floor(BLOCK_SIZE * gameState.raiseCount / gameState.raiseTime);
    gameState.raiseY = raiseY;

    // ブロック
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = blocks[x + y * WIDTH];
            if (b.isVisible()) {
                g.translate(x * BLOCK_SIZE + b.offsetX(), y * BLOCK_SIZE + b.offsetY() - raiseY);
                g.fillStyle = COLORS[b.type];
                g.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
                g.fillStyle = LIGHT_COLORS[b.type];
                drawText(RELIEF[b.type], 0.5 * BLOCK_SIZE, 0.5 * BLOCK_SIZE);
                g.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE / 16);
                g.fillRect(0, 0, BLOCK_SIZE / 16, BLOCK_SIZE);
                g.fillStyle = DARK_COLORS[b.type];
                g.fillRect(0, BLOCK_SIZE - BLOCK_SIZE / 16, BLOCK_SIZE, BLOCK_SIZE / 16);
                g.fillRect(BLOCK_SIZE - BLOCK_SIZE / 16, 0, BLOCK_SIZE / 16, BLOCK_SIZE);
                g.setTransform(1, 0, 0, 1, 0, 0);
            }
        }
        g.fillStyle = DARK_COLORS[next[x]];
        g.fillRect(x * BLOCK_SIZE, HEIGHT * BLOCK_SIZE - raiseY, BLOCK_SIZE, BLOCK_SIZE);
    }

    // カーソル（モバイルでは非表示）
    if (!gameState.isMobile) {
        g.translate((gameState.x + 0.5) * BLOCK_SIZE, (gameState.y + 0.5) * BLOCK_SIZE - raiseY);
        g.fillStyle = 'white';
        g.beginPath();
        const offset = -((Math.floor(gameState.counter / 30) & 1) + BLOCK_SIZE * 0.5);
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
}

// ゲームオーバー表示
export function showGameOver() {
    game_over.style.visibility = 'visible';
    game_over.style.transition = 'filter 0.666s';
    game_over.style.filter = 'blur(0px)';
    canvas.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
}

// ゲームオーバー非表示
export function hideGameOver() {
    game_over.style.visibility = 'hidden';
    game_over.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
    canvas.style.filter = 'blur(0px)';
    g.filter = 'none';
}
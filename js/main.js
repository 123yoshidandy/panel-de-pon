import { initRenderer, render, showGameOver, hideGameOver } from './renderer.js';
import { initInput, pollInput } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState } from './game.js';
import { initTitle } from './title.js';
import { FRAME_MS } from './constants.js';

// タブ復帰時などに1回の描画で進めるフレーム数の上限
const MAX_FRAMES_PER_TICK = 5;

let isGameOver = false;
let lastTime = 0;
let pendingTime = 0;

// ゲームオーバー中ならリスタート
function restart() {
    if (isGameOver) startGame();
}

// 描画・入力の初期化
function setup() {
    const canvas = initRenderer(restart);

    doLayout();
    window.addEventListener('resize', doLayout);

    initInput(canvas, restart);
}

// ゲームを開始
function startGame() {
    resetGame();
    pollInput(); // 開始前の入力は捨てる
    hideGameOver();
    isGameOver = false;
    lastTime = performance.now();
    pendingTime = 0;
    requestAnimationFrame(tick);
}

// ゲームループ。表示のリフレッシュレートに関係なく FRAME_MS ごとに1フレーム進める
function tick(now) {
    pendingTime += Math.min(now - lastTime, FRAME_MS * MAX_FRAMES_PER_TICK);
    lastTime = now;
    for (; pendingTime >= FRAME_MS; pendingTime -= FRAME_MS) {
        if (updateGame(pollInput())) {
            isGameOver = true;
            break;
        }
    }

    render(gameState);

    if (isGameOver) {
        showGameOver(gameState.counter * FRAME_MS / 1000);
    } else {
        requestAnimationFrame(tick);
    }
}

initTitle(() => {
    setup();
    startGame();
});

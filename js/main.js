import { initRenderer, render, showGameOver, hideGameOver } from './renderer.js';
import { initInput, raiseKey } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState } from './game.js';

let continueFunc;

// 初期化
function init() {
    // 描画の初期化
    const { canvas } = initRenderer();

    // レイアウト処理
    doLayout();
    window.addEventListener('resize', doLayout);

    // 入力処理の初期化
    initInput(canvas, () => {
        if (continueFunc) {
            continueFunc();
            continueFunc = null;
        }
    });

    // ゲームを開始
    resetGame();
    hideGameOver();
    startGameLoop();
}

// ゲームループ
function startGameLoop() {
    gameState.intervalKey = setInterval(updateFunc, 16);
}

// 更新処理
function updateFunc() {
    const gameOver = updateGame();

    if (gameOver) {
        // ゲームオーバー処理
        showGameOver();
        clearInterval(gameState.intervalKey);
        continueFunc = () => {
            resetGame();
            hideGameOver();
            startGameLoop();
        };
    }

    // 描画
    render(gameState.blocks, gameState.next);
}

// 開始
init();
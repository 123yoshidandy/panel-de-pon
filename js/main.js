import { initRenderer, render, showGameOver, hideGameOver } from './renderer.js';
import { initInput, raiseKey } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState } from './game.js';
import { initTitle } from './title.js';

let continueFunc;
let gameInitialized = false;

// 初期化
function init() {
    // タイトル画面を表示
    initTitle(() => {
        startGameFromTitle();
    });
}

// タイトル画面からゲームを開始
function startGameFromTitle() {
    if (!gameInitialized) {
        // 初回のみ初期化
        initGame();
        gameInitialized = true;
    }

    // ゲームを開始
    resetGame();
    hideGameOver();
    startGameLoop();
}

// ゲームの初期化
function initGame() {
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
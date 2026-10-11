import { initRenderer, render, showGameOver, hideGameOver } from './renderer.js';
import { initInput, pollInput } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState } from './game.js';
import { showTitle } from './title.js';
import { playEventSounds, playSound, setSoundEnabled, setBgmEnabled, startBgm, stopBgm } from './sound.js';
import { FRAME_MS } from './constants.js';

// タブ復帰時などに1回の描画で進めるフレーム数の上限
const MAX_FRAMES_PER_TICK = 5;

let scene = 'title'; // 'title' | 'playing' | 'gameover'
let initialized = false;
let lastTime = 0;
let pendingTime = 0;

// ゲームオーバー中ならリスタート
function restart() {
    if (scene === 'gameover') startGame();
}

// ゲームオーバー中ならタイトルへ戻る
function backToTitle() {
    if (scene !== 'gameover') return;
    scene = 'title';
    showTitle(startFromTitle);
}

// タイトル画面からゲームを開始
function startFromTitle(settings) {
    if (!initialized) {
        setup();
        initialized = true;
    }
    startGame(settings);
}

// 描画・入力の初期化
function setup() {
    const canvas = initRenderer({ onRestart: restart, onBackToTitle: backToTitle });

    doLayout();
    window.addEventListener('resize', doLayout);

    initInput(canvas);
}

// ゲームを開始（settings を省略すると前回と同じ設定）
function startGame(settings) {
    resetGame(settings);
    setSoundEnabled(gameState.settings.sound === 'on');
    setBgmEnabled(gameState.settings.bgm === 'on');
    startBgm();
    pollInput(); // 開始前の入力は捨てる
    hideGameOver();
    scene = 'playing';
    lastTime = performance.now();
    pendingTime = 0;
    requestAnimationFrame(tick);
}

// ゲームループ。表示のリフレッシュレートに関係なく FRAME_MS ごとに1フレーム進める
function tick(now) {
    pendingTime += Math.min(now - lastTime, FRAME_MS * MAX_FRAMES_PER_TICK);
    lastTime = now;
    for (; pendingTime >= FRAME_MS; pendingTime -= FRAME_MS) {
        const gameOver = updateGame(pollInput());
        playEventSounds(gameState.events);
        if (gameOver) {
            scene = 'gameover';
            stopBgm(1);
            playSound('gameover');
            break;
        }
    }

    render(gameState);

    if (scene === 'gameover') {
        showGameOver(gameState.counter * FRAME_MS / 1000, gameState.maxChain);
    } else {
        requestAnimationFrame(tick);
    }
}

showTitle(startFromTitle);

import { WIDTH, HEIGHT, BLOCK_SIZE } from './constants.js';
import { gameState } from './game.js';

// キー状態
export let upKey = false;
export let leftKey = false;
export let rightKey = false;
export let downKey = false;
export let swapKey = false;
export let raiseKey = false;

// タッチ操作用変数
let touchStartX = null;
let touchStartY = null;
let swapDirection = null;

// 入力状態のリセット
export function resetKeys() {
    upKey = false;
    leftKey = false;
    rightKey = false;
    downKey = false;
    swapKey = false;
}

// 入力処理の初期化
export function initInput(canvas, continueCallback) {
    // キーボードイベント
    window.addEventListener('keydown', function(ev) {
        switch (ev.keyCode) {
            case 37: // left
                leftKey = true;
                ev.preventDefault();
                break;
            case 38: // up
                upKey = true;
                ev.preventDefault();
                break;
            case 39: // right
                rightKey = true;
                ev.preventDefault();
                break;
            case 40: // down
                downKey = true;
                ev.preventDefault();
                break;
            case 90: // Z
                swapKey = !ev.repeat;
                break;
            case 88: // X
                if (!ev.repeat) raiseKey = true;
                break;
        }
        if (continueCallback && (swapKey || raiseKey)) {
            continueCallback();
        }
    });

    window.addEventListener('keyup', function(ev) {
        switch (ev.keyCode) {
            case 88: // X
                raiseKey = false;
                break;
        }
    });

    // マウスイベント
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart);
    canvas.addEventListener('touchmove', onTouchMove);
    canvas.addEventListener('touchend', onTouchEnd);
}

function onMouseDown(ev) {
    const rect = ev.currentTarget.getBoundingClientRect();

    // タッチイベントとマウスイベントを区別
    let clientX, clientY;
    if (ev.touches && ev.touches.length > 0) {
        clientX = ev.touches[0].clientX;
        clientY = ev.touches[0].clientY;
    } else {
        clientX = ev.clientX;
        clientY = ev.clientY;
    }

    // スケーリングを考慮した座標計算
    const mouseX = (clientX - rect.left) / gameState.currentScale;
    const mouseY = (clientY - rect.top) / gameState.currentScale;

    gameState.x = Math.floor((mouseX - BLOCK_SIZE / 2) / BLOCK_SIZE);
    const currentRaiseY = Math.floor(BLOCK_SIZE * gameState.raiseCount / gameState.raiseTime);
    gameState.y = Math.floor((mouseY - BLOCK_SIZE / 2 + currentRaiseY) / BLOCK_SIZE);
    // カーソル位置を有効範囲内に制限
    gameState.x = Math.max(0, Math.min(gameState.x, WIDTH - 2));
    gameState.y = Math.max(0, Math.min(gameState.y, HEIGHT - 1));
}

function onMouseUp(ev) {
    swapKey = !ev.repeat;
}

// タッチイベント処理
function onTouchStart(ev) {
    ev.preventDefault();
    if (ev.touches.length === 0) return;

    const rect = ev.currentTarget.getBoundingClientRect();
    const touch = ev.touches[0];

    touchStartX = (touch.clientX - rect.left) / gameState.currentScale;
    touchStartY = (touch.clientY - rect.top) / gameState.currentScale;

    // タッチ位置を取得
    const touchX = Math.floor((touchStartX - BLOCK_SIZE / 2) / BLOCK_SIZE);
    const currentRaiseY = Math.floor(BLOCK_SIZE * gameState.raiseCount / gameState.raiseTime);
    const touchY = Math.floor((touchStartY - BLOCK_SIZE / 2 + currentRaiseY) / BLOCK_SIZE);

    // タッチ位置を有効範囲内に制限
    gameState.x = Math.max(0, Math.min(touchX, WIDTH - 1));
    gameState.y = Math.max(0, Math.min(touchY, HEIGHT - 1));

    swapDirection = null;
}

function onTouchMove(ev) {
    ev.preventDefault();
    if (ev.touches.length === 0 || touchStartX === null) return;

    const rect = ev.currentTarget.getBoundingClientRect();
    const touch = ev.touches[0];

    const currentX = (touch.clientX - rect.left) / gameState.currentScale;
    const currentY = (touch.clientY - rect.top) / gameState.currentScale;

    const deltaX = currentX - touchStartX;
    const deltaY = currentY - touchStartY;

    // スワイプの閾値（1/3ブロック分）
    const threshold = BLOCK_SIZE / 3;

    // 横スワイプでブロック入れ替え（一度だけ実行）
    if (swapDirection === null && Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0) {
            // 右スワイプ: タッチしたブロックを右に移動
            if (gameState.x < WIDTH - 1) {
                // 右端でない場合のみ実行
                swapDirection = 'right';
                swapKey = true;
            }
        } else {
            // 左スワイプ: タッチしたブロックを左に移動
            if (gameState.x > 0) {
                // 左端でない場合
                gameState.x--; // カーソルを左に移動
                swapDirection = 'left';
                swapKey = true;
            } else if (gameState.x == WIDTH - 1) {
                // 右端をタッチした場合、左のブロックと入れ替え
                gameState.x = WIDTH - 2; // カーソルを左側のペアに設定
                swapDirection = 'left';
                swapKey = true;
            }
        }
    }
}

function onTouchEnd(ev) {
    ev.preventDefault();

    touchStartX = null;
    touchStartY = null;
    swapDirection = null;
}
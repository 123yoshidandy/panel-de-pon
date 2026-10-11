// キー状態（raise 以外は1フレームごとにリセット）
const keys = { up: false, down: false, left: false, right: false, swap: false, raise: false, flatten: false };

// マウス・タッチ操作（座標はキャンバスの描画領域基準のピクセル）
let pointerActions = [];

const DIRECTION_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const RAISE_HOLD_MS = 150; // フィールド外をこの時間押し続けたら加速（タップでせり上がらないように）
const DOUBLE_TAP_MS = 300; // フィールド外のタップからこの時間内に再びタッチしたら平滑化

let canvas;
let onConfirm;
let dragTouchId = null; // ブロックをつかんでいるタッチのID
let raiseTouchId = null; // 加速用タッチのID
let raiseTimer = null;
let lastTapTime = -Infinity; // フィールド外を最後にタップした時刻

// 1フレーム分の入力を取り出す
export function pollInput() {
    const input = { ...keys, actions: pointerActions };
    pointerActions = [];
    keys.up = keys.down = keys.left = keys.right = keys.swap = keys.flatten = false;
    return input;
}

// 入力処理の初期化。onConfirmCallback は入れ替え・加速・決定キーが押されたときに呼ばれる
export function initInput(targetCanvas, onConfirmCallback) {
    canvas = targetCanvas;
    onConfirm = onConfirmCallback;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('touchstart', onTouchStart);
    canvas.addEventListener('touchmove', onTouchMove);
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    // 画面全体のタッチイベント（加速用）
    document.addEventListener('touchstart', onDocumentTouchStart);
    document.addEventListener('touchend', onDocumentTouchEnd);
    document.addEventListener('touchcancel', onDocumentTouchEnd);

    // 長押し（加速）や右クリックでメニューを出さない
    document.addEventListener('contextmenu', ev => ev.preventDefault());
}

function onKeyDown(ev) {
    // タイトル画面の設定などフォーム部品の操作中はゲームの入力として扱わない
    if (ev.target.closest?.('input, button')) return;
    const direction = DIRECTION_KEYS[ev.code];
    if (direction) {
        keys[direction] = true;
        ev.preventDefault();
        return;
    }
    if (ev.repeat) return;
    if (ev.code === 'KeyZ') {
        keys.swap = true;
    } else if (ev.code === 'KeyX') {
        keys.raise = true;
    } else if (ev.code === 'KeyC') {
        keys.flatten = true;
        return;
    } else if (ev.code !== 'Enter' && ev.code !== 'Space') {
        return;
    }
    onConfirm?.();
}

function onKeyUp(ev) {
    if (ev.code === 'KeyX') keys.raise = false;
}

// クライアント座標をキャンバスの描画領域基準の座標に変換（枠線の分を除く）
function toCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        px: clientX - rect.left - canvas.clientLeft,
        py: clientY - rect.top - canvas.clientTop
    };
}

const findTouch = (touches, id) => Array.from(touches).find(t => t.identifier === id);

// マウスは左ボタンのみ受け付ける
function onMouseDown(ev) {
    if (ev.button !== 0) return;
    pointerActions.push({ type: 'select', ...toCanvasPoint(ev.clientX, ev.clientY) });
}

function onMouseUp(ev) {
    if (ev.button !== 0) return;
    keys.swap = true;
}

// タッチしたブロックをつかみ、指を左右に動かすとついてくる
function onTouchStart(ev) {
    ev.preventDefault();
    const touch = ev.changedTouches[0];
    dragTouchId = touch.identifier;
    pointerActions.push({ type: 'touch', ...toCanvasPoint(touch.clientX, touch.clientY) });
}

function onTouchMove(ev) {
    ev.preventDefault();
    const touch = dragTouchId !== null && findTouch(ev.changedTouches, dragTouchId);
    if (!touch) return;
    pointerActions.push({ type: 'drag', ...toCanvasPoint(touch.clientX, touch.clientY) });
}

function onTouchEnd(ev) {
    ev.preventDefault();
    if (dragTouchId !== null && findTouch(ev.changedTouches, dragTouchId)) {
        dragTouchId = null;
        pointerActions.push({ type: 'release' });
    }
}

// キャンバスの外側を長押ししている間は加速、ダブルタップで平滑化
function onDocumentTouchStart(ev) {
    if (raiseTouchId !== null) return;
    const rect = canvas.getBoundingClientRect();
    for (const touch of ev.changedTouches) {
        const { clientX: x, clientY: y } = touch;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) continue;
        if (performance.now() - lastTapTime < DOUBLE_TAP_MS) {
            lastTapTime = -Infinity;
            keys.flatten = true;
            return;
        }
        raiseTouchId = touch.identifier;
        raiseTimer = setTimeout(() => { keys.raise = true; }, RAISE_HOLD_MS);
        break;
    }
}

function onDocumentTouchEnd(ev) {
    if (raiseTouchId !== null && findTouch(ev.changedTouches, raiseTouchId)) {
        clearTimeout(raiseTimer);
        // 加速が始まる前に離したらタップ
        lastTapTime = keys.raise ? -Infinity : performance.now();
        raiseTouchId = null;
        keys.raise = false;
    }
}

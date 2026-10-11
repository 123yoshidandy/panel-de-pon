// マウス・タッチ操作（Pointer Events でまとめて扱う）
//   フィールド内: ブロックをつかんで左右にドラッグ
//   フィールド外: 長押しでせり上げ、ダブルタップ（ダブルクリック）で平滑化

const RAISE_HOLD_MS = 150; // フィールド外をこの時間押し続けたら加速（タップでせり上がらないように）
const DOUBLE_TAP_MS = 300; // フィールド外のタップからこの時間内に再び押したら平滑化

// raise は押している間 true、flatten は1フレームごとにリセット
const state = { raise: false, flatten: false };
// フィールド内の操作（座標はキャンバスの描画領域基準のピクセル）
let pointerActions = [];

let canvas;
let dragPointerId = null; // ブロックをつかんでいるポインターのID
let raisePointerId = null; // 加速用ポインターのID
let raiseTimer = null;
let lastTapTime = -Infinity; // フィールド外を最後にタップした時刻

// 1フレーム分の入力を取り出す
export function pollInput() {
    const input = { ...state, actions: pointerActions };
    pointerActions = [];
    state.flatten = false;
    return input;
}

export function initInput(targetCanvas) {
    canvas = targetCanvas;

    canvas.addEventListener('pointerdown', onFieldPointerDown);
    canvas.addEventListener('pointermove', onFieldPointerMove);
    canvas.addEventListener('pointerup', onFieldPointerUp);
    canvas.addEventListener('pointercancel', onFieldPointerUp);

    document.addEventListener('pointerdown', onOutsidePointerDown);
    document.addEventListener('pointerup', onOutsidePointerUp);
    document.addEventListener('pointercancel', onOutsidePointerUp);

    // 長押し（加速）や右クリックでメニューを出さない
    document.addEventListener('contextmenu', ev => ev.preventDefault());
}

// マウスは左ボタンのみ受け付ける
const isPrimary = ev => ev.pointerType !== 'mouse' || ev.button === 0;

// クライアント座標をキャンバスの描画領域基準の座標に変換（枠線の分を除く）
function toCanvasPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return {
        px: ev.clientX - rect.left - canvas.clientLeft,
        py: ev.clientY - rect.top - canvas.clientTop
    };
}

// 押したブロックをつかみ、左右に動かすとついてくる
function onFieldPointerDown(ev) {
    if (!isPrimary(ev) || dragPointerId !== null) return;
    ev.preventDefault();
    dragPointerId = ev.pointerId;
    canvas.setPointerCapture(ev.pointerId); // フィールドの外に出ても離すまで追いかける
    pointerActions.push({ type: 'touch', ...toCanvasPoint(ev) });
}

function onFieldPointerMove(ev) {
    if (ev.pointerId !== dragPointerId) return;
    pointerActions.push({ type: 'drag', ...toCanvasPoint(ev) });
}

function onFieldPointerUp(ev) {
    if (ev.pointerId !== dragPointerId) return;
    dragPointerId = null;
    pointerActions.push({ type: 'release' });
}

// フィールドの外を長押ししている間は加速、ダブルタップで平滑化
function onOutsidePointerDown(ev) {
    if (!isPrimary(ev) || raisePointerId !== null) return;
    // フィールド上や、ボタン・タイトル画面などの操作は対象外
    if (ev.target === canvas || ev.target.closest?.('button, input, label, #title-screen')) return;
    if (performance.now() - lastTapTime < DOUBLE_TAP_MS) {
        lastTapTime = -Infinity;
        state.flatten = true;
        return;
    }
    raisePointerId = ev.pointerId;
    raiseTimer = setTimeout(() => { state.raise = true; }, RAISE_HOLD_MS);
}

function onOutsidePointerUp(ev) {
    if (ev.pointerId !== raisePointerId) return;
    clearTimeout(raiseTimer);
    // 加速が始まる前に離したらタップ
    lastTapTime = state.raise ? -Infinity : performance.now();
    raisePointerId = null;
    state.raise = false;
}

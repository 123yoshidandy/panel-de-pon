import { WIDTH, HEIGHT, BLOCK_SIZE, MIN_BLOCK_SIZE, MAX_BLOCK_SIZE, setBlockSize } from './constants.js';
import {
    canvas, gameOverElement, gaugeElement,
    opponentCanvas, opponentLabel, incomingElement, versusResultElement
} from './renderer.js';
import { pixelRatio } from './panel-art.js';

const GAUGE_GAP = 4; // ゲージとフィールドの間隔（px）
const OPPONENT_SCALE = 0.45; // 相手のフィールドの大きさ（自分のフィールドに対する比）
const OPPONENT_GAP = 12; // 自分と相手のフィールドの間隔（px）

let mode = 'solo'; // 'solo' | 'versus'

// 画面サイズに合わせてブロックサイズを決め、フィールドを配置する。
// nextMode を渡すと配置の種類を切り替える（省略すると前回と同じ。画面サイズが変わったとき用）
export function doLayout(nextMode = mode) {
    mode = nextMode;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const versus = mode === 'versus';

    // 縦横それぞれの制約から収まる最大サイズを求める（対戦では相手のフィールドの分も横幅に入れる）
    const columns = versus ? WIDTH * (1 + OPPONENT_SCALE) : WIDTH;
    const maxBlockSizeX = Math.floor((w * 0.92 - (versus ? OPPONENT_GAP : 0)) / columns);
    const maxBlockSizeY = Math.floor((h * 0.85) / HEIGHT);
    setBlockSize(Math.max(MIN_BLOCK_SIZE, Math.min(MAX_BLOCK_SIZE, maxBlockSizeX, maxBlockSizeY)));

    // キャンバスは画面の画素密度の分だけ細かく描き、表示の大きさは CSS で決める
    const ratio = pixelRatio();
    const canvasWidth = BLOCK_SIZE * WIDTH;
    const canvasHeight = BLOCK_SIZE * HEIGHT;
    setCanvasSize(canvas, canvasWidth, canvasHeight, ratio);
    const opponentSize = Math.floor(BLOCK_SIZE * OPPONENT_SCALE);
    setCanvasSize(opponentCanvas, opponentSize * WIDTH, opponentSize * HEIGHT, ratio);

    for (const el of [gameOverElement, versusResultElement]) {
        Object.assign(el.style, {
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            fontSize: `${BLOCK_SIZE}px`
        });
    }

    // 枠線を含めたサイズで中央揃え（対戦では自分と相手を並べた幅で）
    const totalWidth = canvas.offsetWidth + (versus ? OPPONENT_GAP + opponentCanvas.offsetWidth : 0);
    const left = (w - totalWidth) * 0.5;
    const top = (h - canvas.offsetHeight) * 0.5;
    for (const el of [canvas, gameOverElement, versusResultElement]) {
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    // ゲージ・予告はフィールドの真上に、描画領域と同じ幅で置く
    const gaugeHeight = Math.max(6, Math.round(BLOCK_SIZE / 3));
    for (const el of [gaugeElement, incomingElement]) {
        Object.assign(el.style, {
            left: `${left + canvas.clientLeft}px`,
            top: `${Math.max(0, top - gaugeHeight - GAUGE_GAP)}px`,
            width: `${canvasWidth}px`,
            height: `${gaugeHeight}px`,
            fontSize: `${gaugeHeight * 0.8}px`
        });
    }

    // 相手のフィールドは右側に、上をそろえて置く。名前はその上に出す
    const opponentLeft = left + canvas.offsetWidth + OPPONENT_GAP;
    Object.assign(opponentCanvas.style, { left: `${opponentLeft}px`, top: `${top}px` });
    Object.assign(opponentLabel.style, {
        left: `${opponentLeft}px`,
        top: `${Math.max(0, top - gaugeHeight - GAUGE_GAP)}px`,
        width: `${opponentCanvas.offsetWidth}px`,
        fontSize: `${Math.max(10, gaugeHeight)}px`
    });
}

function setCanvasSize(element, width, height, ratio) {
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
}

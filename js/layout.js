import { WIDTH, HEIGHT, BLOCK_SIZE, MIN_BLOCK_SIZE, MAX_BLOCK_SIZE, setBlockSize } from './constants.js';
import { canvas, gameOverElement, gaugeElement } from './renderer.js';

const GAUGE_GAP = 4; // ゲージとフィールドの間隔（px）

// 画面サイズに合わせてブロックサイズを決め、フィールドを中央に配置する
export function doLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 縦横それぞれの制約から収まる最大サイズを求める
    const maxBlockSizeX = Math.floor((w * 0.9) / WIDTH);
    const maxBlockSizeY = Math.floor((h * 0.85) / HEIGHT);
    setBlockSize(Math.max(MIN_BLOCK_SIZE, Math.min(MAX_BLOCK_SIZE, maxBlockSizeX, maxBlockSizeY)));

    const canvasWidth = BLOCK_SIZE * WIDTH;
    const canvasHeight = BLOCK_SIZE * HEIGHT;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    Object.assign(gameOverElement.style, {
        width: `${canvasWidth}px`,
        height: `${canvasHeight}px`,
        fontSize: `${BLOCK_SIZE}px`
    });

    // 枠線を含めたサイズで中央揃え
    const left = (w - canvas.offsetWidth) * 0.5;
    const top = (h - canvas.offsetHeight) * 0.5;
    for (const el of [canvas, gameOverElement]) {
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    // ゲージはフィールドの真上に、描画領域と同じ幅で置く
    const gaugeHeight = Math.max(6, Math.round(BLOCK_SIZE / 3));
    Object.assign(gaugeElement.style, {
        left: `${left + canvas.clientLeft}px`,
        top: `${Math.max(0, top - gaugeHeight - GAUGE_GAP)}px`,
        width: `${canvasWidth}px`,
        height: `${gaugeHeight}px`
    });
}

import { WIDTH, HEIGHT, BLOCK_SIZE, MIN_BLOCK_SIZE, MAX_BLOCK_SIZE, setBlockSize } from './constants.js';
import { canvas, gameOverElement } from './renderer.js';

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
        lineHeight: `${canvasHeight}px`,
        fontSize: `${BLOCK_SIZE}px`
    });

    // 枠線を含めたサイズで中央揃え
    const left = `${(w - canvas.offsetWidth) * 0.5}px`;
    const top = `${(h - canvas.offsetHeight) * 0.5}px`;
    for (const el of [canvas, gameOverElement]) {
        el.style.left = left;
        el.style.top = top;
    }
}

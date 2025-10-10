import { WIDTH, HEIGHT, BLOCK_SIZE, setBlockSize } from './constants.js';
import { gameState } from './game.js';
import { canvas, g, game_over } from './renderer.js';

// 中央レイアウト処理とスケーリング
export function doLayout() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // モバイルデバイスの判定
    gameState.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // 画面サイズに基づいて最適なブロックサイズを計算
    // 縦横それぞれの制約から最適なサイズを決める
    const maxBlockSizeX = Math.floor((w * 0.9) / WIDTH);
    const maxBlockSizeY = Math.floor((h * 0.85) / HEIGHT);

    // 最小20px、最大60pxの範囲でブロックサイズを決定
    const newBlockSize = Math.max(20, Math.min(60, Math.min(maxBlockSizeX, maxBlockSizeY)));
    setBlockSize(newBlockSize);

    // キャンバスサイズを更新
    const canvasWidth = BLOCK_SIZE * WIDTH;
    const canvasHeight = BLOCK_SIZE * HEIGHT;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // GAME OVERメッセージのサイズも更新
    game_over.style.width = `${canvasWidth}px`;
    game_over.style.height = `${canvasHeight}px`;
    game_over.style.lineHeight = `${canvasHeight}px`;
    game_over.style.fontSize = `${BLOCK_SIZE}px`;

    // スケーリングは不要（既に適切なサイズに調整済み）
    gameState.currentScale = 1;
    canvas.style.transform = 'none';
    game_over.style.transform = 'none';

    // 中央揃え（borderの32px分を考慮）
    const totalWidth = canvasWidth + 32;
    const totalHeight = canvasHeight + 32;
    canvas.style.left = `${(w - totalWidth) * 0.5}px`;
    canvas.style.top = `${(h - totalHeight) * 0.5}px`;
    game_over.style.left = `${(w - totalWidth) * 0.5}px`;
    game_over.style.top = `${(h - totalHeight) * 0.5}px`;
}
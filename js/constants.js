// ブロックの状態
export const NEUTRAL = 0; // 静止状態
export const EXTINCT = 1; // 発火中
export const VANISH = 2; // 消滅中
export const FALLING = 3; // 落下中
export const MOVEDOWN = 4; // 落下完了
export const SWAPPING_R = 5; // 入れ替え中
export const SWAPPING_L = 6; // 入れ替え中
export const SWAPPED = 7; // 入れ替え完了
export const REVITATE = 8; // 浮遊中
export const CHECK_FLOOR = 9; // 浮遊終了

// 寸法
export const WIDTH = 6;
export const HEIGHT = 12;
export let BLOCK_SIZE = 30; // 動的に変更可能にする
export const NUM = WIDTH * HEIGHT;

// 遷移フレーム数
export const SAWP_FRAME = 4;
export const FALL_FRAME = 8;
export const VANISH_DELAY_FRAME = 6;
export const VANISH_FRAME = 20;

// 見た目情報
export const RELIEF = ['♥', '●', '▼', '◆', '★', '▲'];
export const LIGHT_COLORS = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(128,0,128)', 'rgb(255,255,0)', 'rgb(0,255,255)'];
export const COLORS = ['rgb(192,0,0)', 'rgb(0,192,0)', 'rgb(0,0,192)', 'rgb(96,0,96)', 'rgb(192,192,0)', 'rgb(0,192,192)'];
export const DARK_COLORS = ['rgb(128,0,0)', 'rgb(0,128,0)', 'rgb(0,0,128)', 'rgb(64,0,64)', 'rgb(128,128,0)', 'rgb(0,128,128)'];

// ブロックサイズを更新する関数
export function setBlockSize(size) {
    BLOCK_SIZE = size;
}
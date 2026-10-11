// ブロックの状態
export const NEUTRAL = 0; // 静止状態
export const EXTINCT = 1; // 発火中
export const VANISH = 2; // 消滅中
export const FALLING = 3; // 落下中
export const MOVEDOWN = 4; // 落下完了
export const SWAPPING_R = 5; // 入れ替え中（右側）
export const SWAPPING_L = 6; // 入れ替え中（左側）
export const SWAPPED = 7; // 入れ替え完了
export const LEVITATE = 8; // 浮遊中
export const CHECK_FLOOR = 9; // 浮遊終了

// ブロックの種類
export const EMPTY = -1; // 空きマス
export const COLOR_COUNT = 6;

// 寸法
export const WIDTH = 6;
export const HEIGHT = 12;
export const NUM = WIDTH * HEIGHT;
export let BLOCK_SIZE = 30; // 画面サイズに応じて setBlockSize で変更する
export const MIN_BLOCK_SIZE = 20;
export const MAX_BLOCK_SIZE = 60;

// 遷移フレーム数
export const SWAP_FRAME = 4;
export const FALL_FRAME = 8;
export const EXTINCT_FRAME = 50;
export const VANISH_DELAY_FRAME = 6;
export const VANISH_FRAME = 20;
export const LEVITATE_FRAME = 8;

// せり上がり
export const INITIAL_RAISE_TIME = 600; // 1段せり上がるまでのフレーム数（初期値）
export const MIN_RAISE_TIME = 40; // 1段せり上がるまでのフレーム数（下限）
export const RAISE_BOOST = 20; // 加速中に1フレームで進むせり上がり量

// ゲームループ
export const FRAME_MS = 16; // 1フレームの長さ（ミリ秒）

// 見た目情報
export const RELIEF = ['♥', '●', '▼', '◆', '★', '▲'];
export const LIGHT_COLORS = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(128,0,128)', 'rgb(255,255,0)', 'rgb(0,255,255)'];
export const COLORS = ['rgb(192,0,0)', 'rgb(0,192,0)', 'rgb(0,0,192)', 'rgb(96,0,96)', 'rgb(192,192,0)', 'rgb(0,192,192)'];
export const DARK_COLORS = ['rgb(128,0,0)', 'rgb(0,128,0)', 'rgb(0,0,128)', 'rgb(64,0,64)', 'rgb(128,128,0)', 'rgb(0,128,128)'];

// ブロックサイズを更新する
export function setBlockSize(size) {
    BLOCK_SIZE = size;
}

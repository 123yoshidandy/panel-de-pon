// ===== 盤面 =====
export const WIDTH = 6;
export const HEIGHT = 12;
export let BLOCK_SIZE = 30; // 1マスの大きさ（px）。画面サイズに応じて setBlockSize で変える
export const MIN_BLOCK_SIZE = 20;
export const MAX_BLOCK_SIZE = 60;

// ===== パネルの動き（フレーム数） =====
export const SWAP_FRAMES = 4; // 入れ替えにかかる時間
export const HOVER_FRAMES = 8; // 空中へ入れ替えたパネルが、落ち始めるまで浮いている時間
export const FALL_STEP_FRAMES = 8; // 1マス落ちるのにかかる時間
export const FLASH_FRAMES = 50; // そろったパネルが光っている時間
export const POP_START_FRAMES = 20; // 光り終わってから、最初のパネルが弾けるまで
export const POP_INTERVAL_FRAMES = 6; // パネルが1つずつ弾けていく間隔
export const LAND_BOUNCE_FRAMES = 10; // 着地したパネルが弾む時間（見た目だけ）

// ===== せり上がり =====
export const MIN_RAISE_TIME = 40; // 1段せり上がるまでのフレーム数（下限）
export const RAISE_BOOST = 20; // 長押しで加速している間、1フレームで進むせり上がり量

// ===== お邪魔ブロック =====
export const GARBAGE_GAUGE_MAX = 720; // ゲージが満タンになる（お邪魔ブロックが降る）までのフレーム数
export const GARBAGE_GAUGE_WARNING = 0.75; // ゲージの警告表示を始める割合
export const GAUGE_REDUCE_PER_COMBO = 60; // 同時消しで3個を超えた1個ごとにゲージを減らす量
export const GAUGE_REDUCE_PER_CHAIN = 120; // n連鎖目で (n - 1) × この量だけゲージを減らす
export const GARBAGE_MIN_WIDTH = 3;
export const GARBAGE_MAX_WIDTH = 6;
export const GARBAGE_CLEAR_FRAMES = 60; // 消去が始まってから、一番下の段がパネルに変わるまで
export const THAW_FRAMES = 45; // お邪魔ブロックから変わったパネルが、落ち始めるまで止まっている時間

// ===== 連鎖・同時消し =====
export const POPUP_FRAMES = 60; // 連鎖数・同時消し数を表示する時間
export const MIN_COMBO = 4; // 同時消しとして扱う最小の個数

// ===== 対戦 =====
export const VERSUS_GARBAGE_DELAY = 60; // 送られてきたお邪魔ブロックが降り始めるまでのフレーム数
export const SNAPSHOT_INTERVAL = 12; // 相手に自分のフィールドの様子を送る間隔（フレーム数）

// ===== 平滑化 =====
export const FLATTEN_WAIT_FRAMES = 60; // 盤面が動いている間に要求されたとき、静止するまで待つ最大フレーム数
export const FLATTEN_SLIDE_FRAMES = 4; // 移るパネルが横に1マス進むフレーム数
export const FLATTEN_DROP_FRAMES = 3; // 移るパネルが1マス落ちるフレーム数
export const SHAKE_FRAMES = 16; // 平滑化でフィールドが揺れるフレーム数

// ===== ゲームループ =====
export const FRAME_MS = 16; // 1フレームの長さ（ミリ秒）

// ===== 見た目 =====
// パネルの色と記号（最後の色は難易度「むずかしい」でだけ使う）
// base: 板の色、light: 板の明るいところと記号の色、deep: 板の暗いところと記号の縁
export const PANEL_STYLES = [
    { name: 'red', base: '#e8304a', light: '#ffb0bc', deep: '#9c1426', mark: 'heart' },
    { name: 'green', base: '#2fb84a', light: '#b4f2bf', deep: '#16772a', mark: 'circle' },
    { name: 'purple', base: '#9a46d8', light: '#e2c2fb', deep: '#5e1f92', mark: 'diamond' },
    { name: 'yellow', base: '#f2be12', light: '#fff2ac', deep: '#a87a00', mark: 'star' },
    { name: 'cyan', base: '#1db4dc', light: '#b2eefc', deep: '#0b6f8c', mark: 'triangle' },
    { name: 'blue', base: '#3456d6', light: '#bcc9fb', deep: '#182f8a', mark: 'triangleDown' }
];
export const GARBAGE_STYLE = { base: '#8f88b8', light: '#d4cfee', deep: '#4f4878' };
export const CHAIN_COLOR = '#ff5c8a';
export const COMBO_COLOR = '#3fa9f5';

// 1マスの大きさを変える
export function setBlockSize(size) {
    BLOCK_SIZE = size;
}

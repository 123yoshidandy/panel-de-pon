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
export const HANG = 10; // お邪魔ブロックから変化した直後の静止中

// ブロックの種類
export const EMPTY = -1; // 空きマス
export const GARBAGE = -2; // お邪魔ブロック
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
export const MIN_RAISE_TIME = 40; // 1段せり上がるまでのフレーム数（下限）
export const RAISE_BOOST = 20; // 加速中に1フレームで進むせり上がり量

// お邪魔ブロック
export const GARBAGE_GAUGE_MAX = 720; // ゲージが満タンになる（お邪魔ブロックが降る）までのフレーム数
export const GARBAGE_GAUGE_WARNING = 0.75; // ゲージの警告表示を始める割合
export const GAUGE_REDUCE_PER_COMBO = 60; // 同時消しで3個を超えた1個ごとにゲージを減らす量
export const GAUGE_REDUCE_PER_CHAIN = 120; // n連鎖目で (n - 1) × この量だけゲージを減らす
export const GARBAGE_MIN_WIDTH = 3;
export const GARBAGE_MAX_WIDTH = 6;
export const GARBAGE_CLEAR_FRAME = 60; // 消去開始からブロックに変わるまでのフレーム数
export const GARBAGE_HANG_FRAME = 45; // ブロックに変わってから落下を始めるまでのフレーム数

// 連鎖・同時消し
export const POPUP_FRAME = 60; // 連鎖数・同時消し数を表示するフレーム数
export const MIN_COMBO = 4; // 同時消しとして扱う最小の個数

// 対戦
export const VERSUS_GARBAGE_DELAY = 60; // 送られてきたお邪魔ブロックが降り始めるまでのフレーム数
export const SNAPSHOT_INTERVAL = 12; // 相手に自分のフィールドの様子を送る間隔（フレーム数）

// 平滑化
export const FLATTEN_WAIT_FRAME = 60; // 盤面が動いている間に要求されたとき、静止するまで待つ最大フレーム数
export const FLATTEN_HORIZONTAL_FRAME = 4; // 移動するブロックが横に1マス進むフレーム数
export const FLATTEN_VERTICAL_FRAME = 3; // 移動するブロックが上下に1マス進むフレーム数
export const SHAKE_FRAME = 16; // 平滑化でフィールドが揺れるフレーム数

// ゲームループ
export const FRAME_MS = 16; // 1フレームの長さ（ミリ秒）

// 見た目情報
export const RELIEF = ['♥', '●', '▼', '◆', '★', '▲'];
export const LIGHT_COLORS = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(128,0,128)', 'rgb(255,255,0)', 'rgb(0,255,255)'];
export const COLORS = ['rgb(192,0,0)', 'rgb(0,192,0)', 'rgb(0,0,192)', 'rgb(96,0,96)', 'rgb(192,192,0)', 'rgb(0,192,192)'];
export const DARK_COLORS = ['rgb(128,0,0)', 'rgb(0,128,0)', 'rgb(0,0,128)', 'rgb(64,0,64)', 'rgb(128,128,0)', 'rgb(0,128,128)'];
export const GARBAGE_COLOR = 'rgb(112,112,144)';
export const GARBAGE_LIGHT_COLOR = 'rgb(176,176,208)';
export const GARBAGE_DARK_COLOR = 'rgb(64,64,88)';
export const CHAIN_COLOR = 'rgb(224,32,32)';
export const COMBO_COLOR = 'rgb(32,96,224)';

// ブロックサイズを更新する
export function setBlockSize(size) {
    BLOCK_SIZE = size;
}

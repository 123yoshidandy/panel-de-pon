/**
 * CPU 対戦の CPU（DOM に依存しない）
 *
 * 盤面を見て、入れ替えで消せる手を探し、人と同じ操作（パネルをつかむ・ドラッグ・離す）で動かす。
 * - 手を決めるまでの間と、つかむ位置までカーソルを動かす間を置いて、人が操作できる速さにする
 * - 先の連鎖を組む手は探さない。消えたあとに続けて消える連鎖だけを数える（強すぎないように）
 * - ときどき、いちばん良い手ではない消せる手を選ぶ
 * - 乱数はゲームと分け、シードから作った CPU 専用のものを使う（同じシードなら同じ試合になる）
 */

import { WIDTH, HEIGHT, BLOCK_SIZE, MANUAL_RAISE_FRAMES } from './constants.js';
import { getRaiseOffset } from './game.js';
import { createRandom } from './random.js';

// 強さ。think: 次の手を決めるまでの間（フレーム数の範囲）、perCell: カーソルを1マス動かす間、
// focus: 手を探す範囲（カーソルの段から上下に何段まで見るか）、mistake: いちばん良い手でない手を選ぶ割合、
// chain: 消えたあとに続く連鎖を見込むか、raise: 盤面が低いときにせり上げるか
export const CPU_LEVELS = {
    practice: { think: [70, 120], perCell: 6, focus: 1, mistake: 0.5, chain: false, raise: false },
    normal: { think: [40, 75], perCell: 4, focus: 2, mistake: 0.3, chain: true, raise: true },
    hard: { think: [22, 42], perCell: 3, focus: HEIGHT, mistake: 0.12, chain: true, raise: true }
};

const CPU_SEED_SALT = 0x2f6b9a1d; // ゲームの乱数と分けるため、シードに混ぜる値
const MAX_REACH = 3; // 1回の操作でパネルを運ぶ列数の上限
const HOLD_LIMIT = 40; // つかんだパネルを運びきれないとき、離すまでのフレーム数
const DANGER_HEIGHT = 9; // 一番高い列がこの段数を超えたら、消せなくても低い列へ移す手を使う
const LOW_HEIGHT = 6; // 一番高い列がこの段数より低ければ、せり上げる
const CHAIN_SCORE = 8; // 連鎖1つの値打ち（消える1個を1とする）
const MAX_CASCADE = 6;

const EMPTY = -1; // 空き
const BLOCK = -2; // 動かせないもの（お邪魔ブロック・消えている途中や落ちているパネル）

// 盤面を色の表にする。airborne は、浮いている・落ちているパネルのマス（その下の列には入れ替えで入れない）
function readBoard(state) {
    const board = state.grid.map(row => row.map(item => {
        if (item === null) return EMPTY;
        return item.kind === 'panel' && item.phase === 'idle' ? item.color : BLOCK;
    }));
    for (const { x, y } of state.swaps) board[y][x] = board[y][x + 1] = BLOCK;
    const airborne = state.grid.map(row => row.map(item => item?.kind === 'panel' && (item.phase === 'hover' || item.phase === 'fall')));
    return { board, airborne };
}

const copy = (board) => board.map(row => [...row]);

// パネルを下へ詰める（動かせないものは床として扱う）
function settle(board) {
    for (let x = 0; x < WIDTH; ++x) {
        let floor = HEIGHT - 1;
        for (let y = HEIGHT - 1; y >= 0; --y) {
            const cell = board[y][x];
            if (cell === BLOCK) {
                floor = y - 1;
            } else if (cell >= 0) {
                board[y][x] = EMPTY;
                board[floor][x] = cell;
                floor--;
            }
        }
    }
}

// 縦か横に3つ以上そろっているマス（y * WIDTH + x の集合）
function findMatches(board) {
    const marked = new Set();
    const scan = (length, cellAt) => {
        let run = [];
        for (let i = 0; i <= length; ++i) {
            const [x, y] = cellAt(i) ?? [];
            const color = i < length ? board[y][x] : EMPTY;
            if (color >= 0 && run.length && board[run[0][1]][run[0][0]] === color) {
                run.push([x, y]);
                continue;
            }
            if (run.length >= 3) run.forEach(([rx, ry]) => marked.add(ry * WIDTH + rx));
            run = color >= 0 ? [[x, y]] : [];
        }
    };
    for (let y = 0; y < HEIGHT; ++y) scan(WIDTH, i => (i < WIDTH ? [i, y] : null));
    for (let x = 0; x < WIDTH; ++x) scan(HEIGHT, i => (i < HEIGHT ? [x, i] : null));
    return marked;
}

// 消える数と連鎖数を数える（chain が false なら、最初に消える分だけ）
function evaluate(board, chain) {
    let cleared = 0;
    let chains = 0;
    for (let step = 0; step < MAX_CASCADE; ++step) {
        const marked = findMatches(board);
        if (marked.size === 0) break;
        cleared += marked.size;
        chains++;
        if (!chain) break;
        for (const i of marked) board[Math.floor(i / WIDTH)][i % WIDTH] = EMPTY;
        settle(board);
    }
    return { cleared, chains };
}

function columnHeights(board) {
    return Array.from({ length: WIDTH }, (_, x) => {
        let y = 0;
        while (y < HEIGHT && board[y][x] === EMPTY) y++;
        return HEIGHT - y;
    });
}

// (x, y) のパネルを tx の列へ運んだあとの盤面。運べなければ null。
// 下が空いたマスへ入ると、パネルはそこで落ちてしまうので、そこまでにする
function simulateMove(board, airborne, x, y, tx) {
    const dir = Math.sign(tx - x);
    if (airborne[y - 1][x]) return null;
    const next = copy(board);
    let at = x;
    while (at !== tx) {
        const to = at + dir;
        if (next[y][to] === BLOCK || airborne[y - 1][to]) return null;
        [next[y][at], next[y][to]] = [next[y][to], next[y][at]];
        at = to;
        if (y < HEIGHT - 1 && next[y + 1][at] === EMPTY) break;
    }
    return { board: next, to: at };
}

// 次の手を選ぶ。{ x, y, tx } か、見ている範囲（カーソルの段 focusY から上下 config.focus 段）に良い手がなければ null
function chooseMove(state, config, random, focusY) {
    const { board, airborne } = readBoard(state);
    const before = Math.max(...columnHeights(board));
    const moves = [];
    const seen = new Set();
    // 最上段のパネルはつかめない（game.js の applyPointerActions）
    for (let y = Math.max(1, focusY - config.focus); y <= Math.min(HEIGHT - 1, focusY + config.focus); ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            if (board[y][x] < 0) continue;
            for (let tx = x - MAX_REACH; tx <= x + MAX_REACH; ++tx) {
                if (tx === x || tx < 0 || tx >= WIDTH) continue;
                const result = simulateMove(board, airborne, x, y, tx);
                if (!result || seen.has(`${x},${y},${result.to}`)) continue;
                seen.add(`${x},${y},${result.to}`);
                settle(result.board);
                const { cleared, chains } = evaluate(result.board, config.chain);
                let score = cleared ? cleared + (chains - 1) * CHAIN_SCORE : 0;
                // 高く積み上がっているときは、消せなくても一番高い列を低くする手を使う
                if (!cleared && before > DANGER_HEIGHT) {
                    score = (before - Math.max(...columnHeights(result.board))) * 0.5;
                }
                // 遠くへ運ぶ手より、近い手を少しだけ選びやすくする
                if (score > 0) moves.push({ x, y, tx: result.to, score: score - Math.abs(result.to - x) * 0.1 });
            }
        }
    }
    if (moves.length === 0) return null;
    if (random() < config.mistake) return moves[Math.floor(random() * moves.length)];
    const best = Math.max(...moves.map(move => move.score));
    const candidates = moves.filter(move => move.score === best);
    return candidates[Math.floor(random() * candidates.length)];
}

// パネルが今どのマスにあるか（せり上がりや入れ替えで動くので、毎回探す）
function locate(state, panel) {
    for (let y = 0; y < HEIGHT; ++y) {
        const x = state.grid[y].indexOf(panel);
        if (x >= 0) return { x, y };
    }
    return null;
}

const cellPoint = (state, x, y) => ({ px: (x + 0.5) * BLOCK_SIZE, py: (y + 0.5) * BLOCK_SIZE - getRaiseOffset(state) });

// CPU を作る。step(state) を毎フレーム呼び、返した入力で updateGame を進める
export function createCpu({ seed = 0, level = 'normal' } = {}) {
    const config = CPU_LEVELS[level] ?? CPU_LEVELS.normal;
    const random = createRandom((seed ^ CPU_SEED_SALT) >>> 0);
    const between = ([min, max]) => min + Math.floor(random() * (max - min + 1));
    let wait = between(config.think);
    let cursor = { x: 2, y: HEIGHT / 2 };
    let plan = null; // { panel, tx, travel, held }（held はつかんでからのフレーム数。つかむ前は null）
    let raising = 0;

    const rest = (scale = 1) => {
        plan = null;
        wait = Math.max(1, Math.round(between(config.think) * scale));
    };

    return {
        step(state) {
            const input = { raise: false, flatten: false, actions: [] };

            // つかんで運んでいる：運び終えたか、見失ったら離す
            if (plan?.held !== null && plan?.held !== undefined) {
                const position = locate(state, plan.panel);
                if (!position || position.x === plan.tx || ++plan.held > HOLD_LIMIT || plan.panel.phase === 'clear') {
                    input.actions.push({ type: 'release' });
                    rest();
                }
                return input;
            }

            // つかむパネルへカーソルを動かしている
            if (plan) {
                if (--plan.travel > 0) return input;
                const position = locate(state, plan.panel);
                if (!position || position.y < 1 || plan.panel.phase !== 'idle') {
                    rest(0.3);
                    return input;
                }
                input.actions.push(
                    { type: 'touch', ...cellPoint(state, position.x, position.y) },
                    { type: 'drag', ...cellPoint(state, plan.tx, position.y) }
                );
                plan.held = 0;
                cursor = { x: plan.tx, y: position.y };
                return input;
            }

            if (raising > 0) {
                raising--;
                input.raise = true;
                return input;
            }
            if (--wait > 0) return input;

            const move = chooseMove(state, config, random, cursor.y);
            if (move) {
                const distance = Math.abs(move.x - cursor.x) + Math.abs(move.y - cursor.y);
                plan = { panel: state.grid[move.y][move.x], tx: move.tx, travel: 1 + distance * config.perCell, held: null };
                return input;
            }
            // 見ている範囲に消せる手がない。盤面が低ければせり上げてパネルを増やし、そうでなければ別の段に目を移す
            const { board } = readBoard(state);
            const top = HEIGHT - Math.max(...columnHeights(board));
            if (config.raise && HEIGHT - top < LOW_HEIGHT && state.clears.length === 0) {
                raising = MANUAL_RAISE_FRAMES;
            }
            cursor = { x: cursor.x, y: top + Math.floor(random() * Math.max(1, HEIGHT - top)) };
            rest(0.5);
            return input;
        }
    };
}

/**
 * ゲームの進行（DOM に依存しない）
 *
 * 盤面 grid[y][x] には、空き（null）・パネル・お邪魔ブロックのどれかが入る（y = 0 が一番上）。
 * パネルは「動き」（phase）を1つだけ持つ:
 *   idle（止まっている）/ swap（入れ替え中）/ hover（空中で少し浮いている）/ fall（落ちている）
 *   / clear（そろって消えていく途中）/ thaw（お邪魔ブロックから変わった直後で止まっている）
 * 入れ替え中のマスの組と、そろって消えていくかたまりは、パネルとは別に一覧で持つ。
 */

import {
    WIDTH, HEIGHT, BLOCK_SIZE,
    SWAP_FRAMES, HOVER_FRAMES, FALL_STEP_FRAMES, FLASH_FRAMES, POP_START_FRAMES, POP_INTERVAL_FRAMES,
    LAND_BOUNCE_FRAMES, MIN_RAISE_TIME, RAISE_BOOST,
    GARBAGE_GAUGE_MAX, GAUGE_REDUCE_PER_COMBO, GAUGE_REDUCE_PER_CHAIN, GARBAGE_MIN_WIDTH, GARBAGE_MAX_WIDTH,
    GARBAGE_CLEAR_FRAMES, THAW_FRAMES, POPUP_FRAMES, MIN_COMBO, VERSUS_GARBAGE_DELAY,
    FLATTEN_WAIT_FRAMES, FLATTEN_SLIDE_FRAMES, FLATTEN_DROP_FRAMES, SHAKE_FRAMES
} from './constants.js';
import { DEFAULT_SETTINGS, getChoice, isGarbageEnabled } from './settings.js';
import { createRandom } from './random.js';

export const IDLE = 'idle';
export const SWAP = 'swap';
export const HOVER = 'hover';
export const FALL = 'fall';
export const CLEAR = 'clear';
export const THAW = 'thaw';

export const gameState = {
    settings: DEFAULT_SETTINGS, // 難易度など（settings.js）
    mode: 'solo', // 'solo'（ひとりで遊ぶ） | 'versus'（対戦）
    random: Math.random, // パネルの並び用の乱数（対戦では相手と同じシード）
    miscRandom: Math.random, // お邪魔ブロックの位置などその他の乱数
    colorCount: 5,
    grid: [], // grid[y][x]: null | パネル | お邪魔ブロック
    next: [], // 次にせり上がってくる段の色
    swaps: [], // 入れ替え中のマスの組 { x, y, t }（x と x + 1）
    clears: [], // そろって消えていくかたまり { cells: [{ x, y, panel }], t }
    garbages: [], // お邪魔ブロック { kind, x, y（一番上の段）, width, height, falling, clearing, t }
    garbageGauge: 0, // GARBAGE_GAUGE_MAX まで溜まるとお邪魔ブロックが降る（ひとりで遊ぶとき）
    incoming: [], // 対戦相手から送られてきて、まだ降っていないお邪魔ブロック { width, height, wait }
    chain: 1, // 今の連鎖数
    maxChain: 1,
    popups: [], // 連鎖数・同時消し数の表示 { x, y, kind: 'chain' | 'combo', value, t }
    events: [], // このフレームで起きた出来事（効果音用）{ type, ... }
    touched: null, // つかんでいるパネル { x, y, panel, targetX }（targetX は指のある列）
    counter: 0, // 経過フレーム数
    raiseCount: 0, // せり上がりの進み具合（raiseTime で1段）
    raiseTime: 600,
    flattenRequest: 0, // 平滑化を待っている残りフレーム数（0 なら要求なし）
    flattenMoves: [], // 平滑化で移っているパネル { color, fromX, fromY, toX, toY, duration }
    flattenFrame: 0, // 平滑化の移動が始まってからのフレーム数
    shakeFrame: 0 // 平滑化でフィールドが揺れる残りフレーム数
};

const emit = (type, props = {}) => gameState.events.push({ type, ...props });
const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

// ===== マスとパネル =====

const inField = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const at = (x, y) => (inField(x, y) ? gameState.grid[y][x] : undefined);
const put = (x, y, item) => { gameState.grid[y][x] = item; };
const isPanel = (item) => item?.kind === 'panel';
const isAirborne = (item) => isPanel(item) && (item.phase === HOVER || item.phase === FALL);

function newPanel(color, phase = IDLE) {
    return { kind: 'panel', color, phase, t: 0, dir: 0, chainable: false, bounce: 0, group: null, popAt: 0 };
}

function setPhase(panel, phase) {
    panel.phase = phase;
    panel.t = 0;
}

// 入れ替えの途中で空いている（空きが動いている）マスか
const isSwapping = (x, y) => gameState.swaps.some(s => s.y === y && (s.x === x || s.x + 1 === x));

// 落ちてきたものが入れる空きマスか
const isOpen = (x, y) => inField(x, y) && at(x, y) === null && !isSwapping(x, y);

// (x, y) のパネルの下が埋まっているか（一番下の段か、下に止まっているものがある）
function isSupported(x, y) {
    if (y === HEIGHT - 1) return true;
    const below = at(x, y + 1);
    return !isOpen(x, y + 1) && below?.phase !== FALL;
}

// exclude 以外の色を1つ選ぶ（exclude が -1 ならどの色でもよい）
function pickColor(random, exclude = -1) {
    const n = exclude < 0 ? gameState.colorCount : gameState.colorCount - 1;
    const color = Math.floor(random() * n);
    return exclude >= 0 && color >= exclude ? color + 1 : color;
}

const colorAt = (x, y) => (isPanel(at(x, y)) ? at(x, y).color : -1);

// せり上がりによる表示上の Y のずれ（px）
export function getRaiseOffset(state = gameState) {
    return Math.floor(BLOCK_SIZE * state.raiseCount / state.raiseTime);
}

// ===== 開始 =====

// 次にせり上がってくる段を決める。下の2段が同じ色の列ではその色を避け、隣どうしも同じ色にしない
function prepareNextRow() {
    for (let x = 0; x < WIDTH; ++x) {
        const bottom = colorAt(x, HEIGHT - 1);
        const avoid = bottom >= 0 && bottom === colorAt(x, HEIGHT - 2) ? bottom : -1;
        let color;
        do {
            color = pickColor(gameState.random, avoid);
        } while (x > 0 && color === gameState.next[x - 1]);
        gameState.next[x] = color;
    }
}

// 開始時の盤面。下半分を、3つ並ばないように埋める
function fillStartingRows() {
    for (let y = HEIGHT / 2; y < HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            let color;
            do {
                color = pickColor(gameState.random);
            } while ((colorAt(x - 1, y) === color && colorAt(x - 2, y) === color)
                || (colorAt(x, y - 1) === color && colorAt(x, y - 2) === color));
            put(x, y, newPanel(color));
        }
    }
}

// ゲームを始める。対戦では mode: 'versus' と、相手と同じ seed を渡す
export function resetGame(settings = gameState.settings, { mode = 'solo', seed } = {}) {
    const difficulty = getChoice(settings, 'difficulty');
    Object.assign(gameState, {
        settings,
        mode,
        random: seed === undefined ? Math.random : createRandom(seed),
        miscRandom: seed === undefined ? Math.random : createRandom(seed ^ 0x5bd1e995),
        colorCount: difficulty.colorCount,
        grid: Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null)),
        next: Array(WIDTH).fill(0),
        swaps: [],
        clears: [],
        garbages: [],
        garbageGauge: 0,
        incoming: [],
        chain: 1,
        maxChain: 1,
        popups: [],
        events: [],
        touched: null,
        counter: 0,
        raiseCount: 0,
        raiseTime: difficulty.raiseTime,
        flattenRequest: 0,
        flattenMoves: [],
        flattenFrame: 0,
        shakeFrame: 0
    });
    fillStartingRows();
    prepareNextRow();
}

// テスト用：盤面を文字列で並べる（下の段が配列の最後。'0'〜'5' が色、'.' が空き）
export function loadRows(rows) {
    gameState.grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill(null));
    rows.forEach((row, i) => {
        const y = HEIGHT - rows.length + i;
        [...row].forEach((ch, x) => { if (ch !== '.') put(x, y, newPanel(Number(ch))); });
    });
    gameState.swaps = [];
    gameState.clears = [];
    gameState.garbages = [];
}

// ===== 入れ替え =====

// (x, y) と (x + 1, y) の中身を入れ替える。入れ替えられなければ何もしない
function trySwap(x, y) {
    if (!inField(x, y) || !inField(x + 1, y)) return;
    const left = at(x, y);
    const right = at(x + 1, y);
    const movable = (item) => item === null || (isPanel(item) && item.phase === IDLE);
    if (!movable(left) || !movable(right) || (left === null && right === null)) return;
    if (isSwapping(x, y) || isSwapping(x + 1, y)) return;
    // 真上から落ちてくるパネルがある列には入れない
    if (isAirborne(at(x, y - 1)) || isAirborne(at(x + 1, y - 1))) return;

    put(x, y, right);
    put(x + 1, y, left);
    // dir は動いてきた向きの逆（描画で、元の位置から滑らせるため）
    if (right) Object.assign(right, { phase: SWAP, t: 0, dir: 1 });
    if (left) Object.assign(left, { phase: SWAP, t: 0, dir: -1 });
    gameState.swaps.push({ x, y, t: 0 });
    emit('swap');
}

function advanceSwaps() {
    for (const swap of gameState.swaps) swap.t++;
    const done = gameState.swaps.filter(swap => swap.t >= SWAP_FRAMES);
    gameState.swaps = gameState.swaps.filter(swap => swap.t < SWAP_FRAMES);
    for (const { x, y } of done) {
        for (const item of [at(x, y), at(x + 1, y)]) {
            if (isPanel(item) && item.phase === SWAP) {
                setPhase(item, IDLE);
                item.dir = 0;
            }
        }
        // 空中へ動かしたパネルは少し浮いてから落ちる
        for (const cx of [x, x + 1]) {
            const item = at(cx, y);
            if (isPanel(item) && item.phase === IDLE && isOpen(cx, y + 1)) setPhase(item, HOVER);
        }
    }
}

// ===== 消去 =====

// そろったパネルを探し、1つのかたまりとして消し始める。消し始めたパネルの数を返す
function findMatches() {
    const color = (x, y) => (isPanel(at(x, y)) && at(x, y).phase === IDLE ? at(x, y).color : -1);
    const marked = new Set();
    const markRun = (cells) => { if (cells.length >= 3) cells.forEach(([x, y]) => marked.add(y * WIDTH + x)); };
    for (let y = 0; y < HEIGHT; ++y) {
        let run = [];
        for (let x = 0; x <= WIDTH; ++x) {
            const c = x < WIDTH ? color(x, y) : -1;
            if (c >= 0 && run.length && color(...run[0]) === c) {
                run.push([x, y]);
            } else {
                markRun(run);
                run = c >= 0 ? [[x, y]] : [];
            }
        }
    }
    for (let x = 0; x < WIDTH; ++x) {
        let run = [];
        for (let y = 0; y <= HEIGHT; ++y) {
            const c = y < HEIGHT ? color(x, y) : -1;
            if (c >= 0 && run.length && color(...run[0]) === c) {
                run.push([x, y]);
            } else {
                markRun(run);
                run = c >= 0 ? [[x, y]] : [];
            }
        }
    }
    if (marked.size === 0) return 0;

    // 左上から順に弾けるよう、上の段・左の列から並べる
    const cells = [...marked].sort((a, b) => a - b).map(i => {
        const x = i % WIDTH;
        const y = Math.floor(i / WIDTH);
        return { x, y, panel: at(x, y) };
    });
    const group = { cells, t: 0 };
    const isChain = cells.some(({ panel }) => panel.chainable);
    cells.forEach(({ panel }, index) => {
        setPhase(panel, CLEAR);
        panel.group = group;
        panel.popAt = FLASH_FRAMES + POP_START_FRAMES + index * POP_INTERVAL_FRAMES;
        panel.chainable = false;
    });
    gameState.clears.push(group);

    // 消えるパネルに接しているお邪魔ブロックも消し始める
    for (const { x, y } of cells) {
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            const item = at(nx, ny);
            if (item?.kind === 'garbage') startClearingGarbage(item);
        }
    }

    const count = cells.length;
    const top = cells[0]; // 一番上（同じ段なら一番左）のパネルの位置に数字を出す
    if (isChain) {
        gameState.chain++;
        gameState.maxChain = Math.max(gameState.maxChain, gameState.chain);
    }
    const isCombo = count >= MIN_COMBO;
    if (isCombo) {
        gameState.popups.push({ x: top.x, y: top.y, kind: 'combo', value: count, t: 0 });
        emit('combo', { value: count });
    }
    if (isChain) {
        gameState.popups.push({ x: top.x, y: isCombo ? top.y - 1 : top.y, kind: 'chain', value: gameState.chain, t: 0 });
        emit('chain', { value: gameState.chain });
    }
    reduceGarbageGauge(count, isChain ? gameState.chain : 1);
    if (gameState.mode === 'versus') attack(comboAttack(count));
    return count;
}

// 消えていくかたまりを進める。全部弾けたら盤面から取り除き、上に載っていたパネルを連鎖の候補にする
function advanceClears() {
    for (const group of gameState.clears) {
        group.t++;
        group.cells.forEach(({ panel }, index) => {
            if (group.t === panel.popAt) emit('pop', { index });
        });
    }
    const finished = gameState.clears.filter(group => group.t >= group.cells.at(-1).panel.popAt + POP_INTERVAL_FRAMES);
    gameState.clears = gameState.clears.filter(group => !finished.includes(group));
    for (const group of finished) {
        for (const { x, y } of group.cells) put(x, y, null);
        for (const { x, y } of group.cells) {
            for (let above = y - 1; above >= 0; --above) {
                const item = at(x, above);
                if (item?.kind === 'garbage') break;
                if (isPanel(item) && item.phase !== CLEAR) item.chainable = true;
            }
        }
    }
}

// 消えるパネルの見た目の状態。flash は光っている間 true、popped は弾けたあと true
export function clearProgress(panel) {
    const t = panel.group?.t ?? 0;
    return { flash: t < FLASH_FRAMES, popped: t >= panel.popAt, t };
}

// ===== 落下 =====

// 列ごとに下から、パネルを浮かせる・落とす・着地させる
function advanceGravity() {
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = HEIGHT - 1; y >= 0; --y) {
            const panel = at(x, y);
            if (!isPanel(panel)) continue;
            if (panel.bounce > 0) panel.bounce--;
            switch (panel.phase) {
                case IDLE:
                    // 下が空いた、または下のパネルが落ち始めたら一緒に落ちる
                    if (isOpen(x, y + 1)) {
                        setPhase(panel, FALL);
                    } else if (at(x, y + 1)?.phase === FALL) {
                        setPhase(panel, FALL);
                        panel.t = at(x, y + 1).t;
                    }
                    break;
                case HOVER:
                    if (++panel.t >= HOVER_FRAMES) setPhase(panel, isOpen(x, y + 1) ? FALL : IDLE);
                    break;
                case THAW:
                    if (++panel.t >= THAW_FRAMES) setPhase(panel, IDLE);
                    break;
                case FALL:
                    if (++panel.t < FALL_STEP_FRAMES) break;
                    if (isOpen(x, y + 1)) {
                        put(x, y + 1, panel);
                        put(x, y, null);
                        panel.t = 0;
                        // さらに下が埋まっていれば、ここで着地する（下のパネルに重ねて描かないように）
                        if (!isOpen(x, y + 2) && at(x, y + 2)?.phase !== FALL) land(panel);
                    } else {
                        land(panel);
                    }
                    break;
            }
        }
    }
}

function land(panel) {
    setPhase(panel, IDLE);
    panel.bounce = LAND_BOUNCE_FRAMES;
}

// パネルの描画上のずれ（マス単位）。入れ替え中は元の位置から滑らせ、落下中は下へずらす
export function panelOffset(panel) {
    if (panel.phase === SWAP) return { dx: panel.dir * (1 - panel.t / SWAP_FRAMES), dy: 0 };
    if (panel.phase === FALL) return { dx: 0, dy: panel.t / FALL_STEP_FRAMES };
    return { dx: 0, dy: 0 };
}

// ===== 連鎖 =====

// 着地して消えなかったパネルを連鎖の候補から外す。候補も消える途中のものもなくなったら連鎖は終わり
function settleChain() {
    let chainContinues = gameState.clears.length > 0 || gameState.garbages.some(garbage => garbage.clearing);
    for (let y = 0; y < HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            const panel = at(x, y);
            if (!isPanel(panel) || !panel.chainable) continue;
            if (panel.phase === IDLE && isSupported(x, y)) panel.chainable = false;
            chainContinues ||= panel.chainable;
        }
    }
    if (!chainContinues) {
        // 連鎖が終わったら、連鎖数に応じたお邪魔ブロックを相手に送る
        if (gameState.mode === 'versus') attack(chainAttack(gameState.chain));
        gameState.chain = 1;
    }
    for (const popup of gameState.popups) popup.t++;
    gameState.popups = gameState.popups.filter(popup => popup.t < POPUP_FRAMES);
}

// 同時消し・連鎖に応じてお邪魔ブロックのゲージを減らす
function reduceGarbageGauge(count, chain) {
    const reduction = Math.max(0, count - (MIN_COMBO - 1)) * GAUGE_REDUCE_PER_COMBO
        + (chain - 1) * GAUGE_REDUCE_PER_CHAIN;
    gameState.garbageGauge = Math.max(0, gameState.garbageGauge - reduction);
}

// ===== お邪魔ブロック =====

const garbageColumns = (garbage) => Array.from({ length: garbage.width }, (_, i) => garbage.x + i);

// 段 y が、お邪魔ブロックの幅いっぱい空いているか
const rowIsOpen = (garbage, y) => garbageColumns(garbage).every(x => isOpen(x, y));

const canGarbageFall = (garbage) => garbage.y + garbage.height < HEIGHT && rowIsOpen(garbage, garbage.y + garbage.height);

// 上から幅 width・高さ height のお邪魔ブロックを出す。上が空いている段数しか置けないので、置けた段数を返す
function spawnGarbage(width, height) {
    const x = Math.floor(gameState.miscRandom() * (WIDTH - width + 1));
    const garbage = { kind: 'garbage', x, y: 0, width, height: 0, falling: false, clearing: false, t: 0 };
    while (garbage.height < height && rowIsOpen(garbage, garbage.height)) garbage.height++;
    if (garbage.height === 0) return 0;
    for (let y = 0; y < garbage.height; ++y) {
        for (const cx of garbageColumns(garbage)) put(cx, y, garbage);
    }
    // 出たフレームから落とし始めて、最上段に居座ったままのせり上がりを防ぐ
    garbage.falling = canGarbageFall(garbage);
    gameState.garbages.push(garbage);
    return garbage.height;
}

// 消去を始め、接しているお邪魔ブロックにも広げる
function startClearingGarbage(garbage) {
    if (garbage.clearing || garbage.falling) return;
    garbage.clearing = true;
    garbage.t = 0;
    const { x, y, width, height } = garbage;
    const around = [];
    for (let row = y; row < y + height; ++row) around.push([x - 1, row], [x + width, row]);
    for (let col = x; col < x + width; ++col) around.push([col, y - 1], [col, y + height]);
    for (const [nx, ny] of around) {
        const item = at(nx, ny);
        if (item?.kind === 'garbage') startClearingGarbage(item);
    }
}

// 一番下の段をパネルに変える（残りの段は1段低いお邪魔ブロックとして残る）。変わったパネルは少し止まってから落ちる
function thawBottomRow(garbage) {
    const y = garbage.y + garbage.height - 1;
    for (const x of garbageColumns(garbage)) {
        const panel = newPanel(Math.floor(gameState.miscRandom() * gameState.colorCount), THAW);
        panel.chainable = true; // 変わったパネルが消えれば連鎖になる
        put(x, y, panel);
    }
    garbage.height--;
    garbage.clearing = false;
    garbage.t = 0;
    if (garbage.height === 0) gameState.garbages.splice(gameState.garbages.indexOf(garbage), 1);
}

function moveGarbageDown(garbage) {
    for (const x of garbageColumns(garbage)) {
        put(x, garbage.y + garbage.height, garbage);
        put(x, garbage.y, null);
    }
    garbage.y++;
}

function advanceGarbages() {
    // 下にあるものから動かす
    const ordered = [...gameState.garbages].sort((a, b) => (b.y + b.height) - (a.y + a.height));
    for (const garbage of ordered) {
        if (garbage.clearing) {
            if (++garbage.t >= GARBAGE_CLEAR_FRAMES) thawBottomRow(garbage);
            continue;
        }
        if (garbage.falling && ++garbage.t >= FALL_STEP_FRAMES) {
            moveGarbageDown(garbage);
            garbage.falling = false;
            if (!canGarbageFall(garbage)) emit('land');
        }
        if (!garbage.falling && canGarbageFall(garbage)) {
            garbage.falling = true;
            garbage.t = 0;
        }
    }

    if (gameState.mode === 'versus') {
        dropIncomingGarbage();
        return;
    }
    // ひとりで遊ぶとき：ゲージが満タンになったら降らせる（置けなければ満タンのまま待つ）
    if (!isGarbageEnabled(gameState.settings)) return;
    const rate = getChoice(gameState.settings, 'difficulty').gaugeRate;
    gameState.garbageGauge = Math.min(gameState.garbageGauge + rate, GARBAGE_GAUGE_MAX);
    if (gameState.garbageGauge >= GARBAGE_GAUGE_MAX) {
        const width = GARBAGE_MIN_WIDTH + Math.floor(gameState.miscRandom() * (GARBAGE_MAX_WIDTH - GARBAGE_MIN_WIDTH + 1));
        if (spawnGarbage(width, 1)) gameState.garbageGauge = 0;
    }
}

// お邪魔ブロックの描画上の Y のずれ（マス単位）
export function garbageOffset(garbage) {
    return garbage.falling ? garbage.t / FALL_STEP_FRAMES : 0;
}

// ===== 対戦 =====

// 同時消しで送るお邪魔ブロック。幅の合計は「消した数 - 1」で、横幅を超える分は複数に分ける
export function comboAttack(count) {
    if (count < MIN_COMBO) return [];
    const total = count - 1;
    const pieces = Math.ceil(total / WIDTH);
    return Array.from({ length: pieces }, (_, i) => ({
        width: Math.floor(total / pieces) + (i < total % pieces ? 1 : 0),
        height: 1
    })).sort((a, b) => a.width - b.width);
}

// 連鎖で送るお邪魔ブロック。横いっぱいで「連鎖数 - 1」段
export function chainAttack(chain) {
    return chain >= 2 ? [{ width: WIDTH, height: Math.min(chain - 1, HEIGHT - 1) }] : [];
}

// 攻撃する。まず自分に送られてきているお邪魔ブロックをマス数で打ち消し（相殺）、残りを相手に送る
function attack(pieces) {
    const sent = [];
    for (const piece of pieces) {
        const total = piece.width * piece.height;
        let power = total;
        while (power > 0 && gameState.incoming.length > 0) {
            const target = gameState.incoming[0];
            const cells = target.width * target.height;
            if (power >= cells) {
                gameState.incoming.shift();
                power -= cells;
            } else {
                // 一部だけ打ち消す（段のあるものは段を、1段のものは幅を減らす）
                if (target.height > 1) target.height -= Math.ceil(power / target.width);
                else target.width -= power;
                power = 0;
            }
        }
        if (power === total) {
            sent.push({ ...piece });
        } else if (power > 0) {
            sent.push(piece.height > 1
                ? { width: piece.width, height: Math.ceil(power / piece.width) }
                : { width: power, height: 1 });
        }
    }
    if (sent.length) emit('attack', { pieces: sent });
}

// 相手から送られてきたお邪魔ブロックを受け取る（すぐには降らず、予告として溜まる）
export function receiveGarbage(pieces) {
    for (const { width, height } of pieces) {
        gameState.incoming.push({ width: clamp(width, 1, WIDTH), height: clamp(height, 1, HEIGHT - 1), wait: 0 });
    }
}

// 送られてきたお邪魔ブロックを降らせる。届いてから少し待ち、自分が連鎖している間は降らせない
function dropIncomingGarbage() {
    for (const piece of gameState.incoming) piece.wait++;
    const next = gameState.incoming[0];
    if (!next || next.wait < VERSUS_GARBAGE_DELAY || gameState.chain > 1) return;
    const placed = spawnGarbage(next.width, next.height);
    if (placed === next.height) gameState.incoming.shift();
    else next.height -= placed; // 上が空いていない分は、次の機会に降らせる
}

// 対戦相手の画面に表示する、自分のフィールドの様子
//   cells: 各マスを1文字で（'0'〜'5' が色、'.' が空き。お邪魔ブロックは garbages で送る）
export function getSnapshot() {
    let cells = '';
    for (let y = 0; y < HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            const item = at(x, y);
            const visible = isPanel(item) && !(item.phase === CLEAR && clearProgress(item).popped);
            cells += visible ? String(item.color) : '.';
        }
    }
    return {
        cells,
        next: gameState.next.join(''),
        garbages: gameState.garbages.map(g => [g.x, g.y, g.width, g.height, g.clearing ? 1 : 0]),
        raise: Math.round(gameState.raiseCount / gameState.raiseTime * 100) / 100,
        incoming: gameState.incoming.map(p => [p.width, p.height]),
        chain: gameState.chain
    };
}

// ===== 操作 =====

// キャンバス上の座標（px）をマスの座標に変える
function pointToCell(px, py) {
    return { x: Math.floor(px / BLOCK_SIZE), y: Math.floor((py + getRaiseOffset()) / BLOCK_SIZE) };
}

// マウス・タッチの操作を反映する
function applyPointerActions(actions) {
    for (const action of actions) {
        if (action.type === 'touch') {
            // 押したパネルをつかむ（最上段はつかめない）
            const { x, y } = pointToCell(action.px, action.py);
            const item = y >= 1 ? at(x, y) : undefined;
            gameState.touched = isPanel(item) ? { x, y, panel: item, targetX: x } : null;
        } else if (action.type === 'drag' && gameState.touched) {
            gameState.touched.targetX = clamp(Math.floor(action.px / BLOCK_SIZE), 0, WIDTH - 1);
        } else if (action.type === 'release') {
            gameState.touched = null;
        }
    }
}

// つかんでいるパネルを、指のある列へ1マスずつ入れ替えながら運ぶ
function followDrag() {
    const touched = gameState.touched;
    if (!touched) return;
    // 入れ替えるとパネルは隣のマスへ移るので、同じ段の左右から探し直す
    const dx = [0, 1, -1].find(d => at(touched.x + d, touched.y) === touched.panel);
    if (dx === undefined || touched.panel.phase === CLEAR) {
        gameState.touched = null; // 消えた・落ちたなどで見失ったら離す
        return;
    }
    touched.x += dx;
    if (touched.targetX === touched.x || touched.panel.phase !== IDLE) return;
    trySwap(touched.targetX > touched.x ? touched.x : touched.x - 1, touched.y);
}

// ===== 平滑化 =====

// 盤面が止まっているか（消去・落下・入れ替えなどの途中でなく、浮いているパネルもない）
function isSettled() {
    if (gameState.swaps.length || gameState.clears.length) return false;
    if (gameState.garbages.some(garbage => garbage.falling || garbage.clearing)) return false;
    for (let y = 0; y < HEIGHT; ++y) {
        for (let x = 0; x < WIDTH; ++x) {
            const item = at(x, y);
            if (isPanel(item) && (item.phase !== IDLE || isOpen(x, y + 1))) return false;
        }
    }
    return true;
}

// 台を揺らしたように、各列の上から最初に現れるパネルのかたまりを隣の列へずらして落とす。
// 一番上がお邪魔ブロックの列でも、その下のパネルが横へ抜け出してずれる。
// ずれる先は隣の列の同じ高さの空きマスで、お邪魔ブロックなどには重ならない。
// ずれるのは、ずれる先から下に続く空きマス数の半分（切り上げ）で、かたまりのまま順番を保って移る。
// 左右とも空いていれば空きの多いほうへ、同じならランダムにずれる。受け取った列は渡さず、渡した列は受け取らない。
// 盤面はすぐに移動後の状態にし、移動の様子（横移動→落下）を表す一覧を返す
function shakeBoard() {
    const topRun = (x) => {
        let top = 0;
        while (top < HEIGHT && !isPanel(at(x, top))) top++;
        let length = 0;
        while (top + length < HEIGHT && isPanel(at(x, top + length))) length++;
        return { top, length };
    };
    const openBelow = (x, y) => {
        let n = 0;
        while (y + n < HEIGHT && at(x, y + n) === null) n++;
        return n;
    };

    const gave = Array(WIDTH).fill(false);
    const received = Array(WIDTH).fill(false);
    const moves = [];
    // かたまりが高い位置にある列から順に決める
    const order = [...Array(WIDTH).keys()].sort((a, b) => topRun(a).top - topRun(b).top);
    for (const from of order) {
        const run = topRun(from);
        if (received[from] || run.length === 0) continue;
        const candidates = [from - 1, from + 1]
            .filter(to => to >= 0 && to < WIDTH && !gave[to] && !received[to])
            .map(to => ({ to, free: openBelow(to, run.top) }))
            .filter(c => c.free > 0);
        if (candidates.length === 0) continue;
        let choice = candidates[0];
        if (candidates.length === 2) {
            const [l, r] = candidates;
            choice = l.free !== r.free ? (l.free > r.free ? l : r) : candidates[Math.floor(gameState.miscRandom() * 2)];
        }
        const count = Math.min(Math.ceil(choice.free / 2), run.length);
        gave[from] = received[choice.to] = true;

        // 上の count 個を、順番を保ったまま隣の列に積む
        const drop = choice.free - count;
        for (let i = count - 1; i >= 0; --i) {
            const fromY = run.top + i;
            const toY = fromY + drop;
            const panel = at(from, fromY);
            put(choice.to, toY, panel);
            put(from, fromY, null);
            panel.chainable = false;
            moves.push({
                color: panel.color, fromX: from, fromY, toX: choice.to, toY,
                duration: FLATTEN_SLIDE_FRAMES + drop * FLATTEN_DROP_FRAMES
            });
        }
    }
    return moves;
}

// 平滑化で移っているパネルの位置（マス単位）。着いていれば null を返す
export function flattenMovePosition(move, frame) {
    if (frame >= move.duration) return null;
    if (frame < FLATTEN_SLIDE_FRAMES) {
        return { x: move.fromX + (move.toX - move.fromX) * frame / FLATTEN_SLIDE_FRAMES, y: move.fromY };
    }
    return { x: move.toX, y: move.fromY + (frame - FLATTEN_SLIDE_FRAMES) / FLATTEN_DROP_FRAMES };
}

// 平滑化の要求を処理する。盤面が動いている間は止まるまで待つ
function handleFlatten(requested) {
    if (requested) gameState.flattenRequest = FLATTEN_WAIT_FRAMES;
    if (gameState.flattenRequest === 0) return;
    if (!isSettled()) {
        gameState.flattenRequest--;
        return;
    }
    gameState.flattenMoves = shakeBoard();
    gameState.flattenFrame = 0;
    gameState.flattenRequest = 0;
    gameState.shakeFrame = SHAKE_FRAMES;
    if (gameState.flattenMoves.length) emit('swap');
}

// ===== せり上がり =====

// 全体を1段せり上げる。せり上げる前に上の2段に何かあればゲームオーバーで true を返す
function raiseRow() {
    const gameOver = gameState.grid[0].some(Boolean) || gameState.grid[1].some(Boolean);
    gameState.grid.shift();
    gameState.grid.push(gameState.next.map(color => newPanel(color)));
    prepareNextRow();
    for (const garbage of gameState.garbages) garbage.y--;
    for (const swap of gameState.swaps) swap.y--;
    for (const group of gameState.clears) group.cells.forEach(cell => { cell.y--; });
    for (const popup of gameState.popups) popup.y--;
    if (gameState.touched && --gameState.touched.y < 1) gameState.touched = null;
    return gameOver;
}

// ===== 1フレーム =====

// ゲームを1フレーム進める。input は { raise, flatten, actions }。ゲームオーバーなら true を返す
export function updateGame(input) {
    gameState.events = [];
    if (gameState.shakeFrame > 0) gameState.shakeFrame--;
    if (gameState.flattenMoves.length) {
        // 平滑化で移っている間は、ほかの動きとせり上がりを止める
        if (++gameState.flattenFrame >= Math.max(...gameState.flattenMoves.map(move => move.duration))) {
            gameState.flattenMoves = [];
            emit('land');
        }
        applyPointerActions(input.actions);
        gameState.counter++;
        return false;
    }

    advanceSwaps();
    advanceClears();
    advanceGravity();
    advanceGarbages();
    const cleared = findMatches();
    if (cleared) gameState.raiseTime = Math.max(gameState.raiseTime - cleared, MIN_RAISE_TIME);
    settleChain();

    handleFlatten(input.flatten);
    applyPointerActions(input.actions);
    followDrag();

    // 消えている途中・お邪魔ブロックが動いている間・変わったパネルが止まっている間はせり上げない
    const busy = cleared > 0 || gameState.clears.length > 0
        || gameState.garbages.some(garbage => garbage.falling || garbage.clearing)
        || gameState.grid.some(row => row.some(item => isPanel(item) && item.phase === THAW));
    if (!busy) gameState.raiseCount += input.raise ? RAISE_BOOST : 1;
    if (gameState.raiseCount >= gameState.raiseTime) {
        gameState.raiseCount = 0;
        if (raiseRow()) return true;
    }

    gameState.counter++;
    return false;
}

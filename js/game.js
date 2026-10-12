import {
    WIDTH, HEIGHT, NUM, BLOCK_SIZE, EMPTY, GARBAGE,
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, LEVITATE, CHECK_FLOOR, HANG,
    FALL_FRAME, VANISH_FRAME, VANISH_DELAY_FRAME, MIN_RAISE_TIME, RAISE_BOOST,
    GARBAGE_GAUGE_MAX, GARBAGE_MIN_WIDTH, GARBAGE_MAX_WIDTH, GARBAGE_CLEAR_FRAME,
    GAUGE_REDUCE_PER_COMBO, GAUGE_REDUCE_PER_CHAIN, POPUP_FRAME, MIN_COMBO, VERSUS_GARBAGE_DELAY,
    FLATTEN_WAIT_FRAME, FLATTEN_HORIZONTAL_FRAME, FLATTEN_VERTICAL_FRAME, SHAKE_FRAME
} from './constants.js';
import { Block } from './Block.js';
import { DEFAULT_SETTINGS, getChoice, isGarbageEnabled } from './settings.js';
import { createRandom } from './random.js';

// ゲーム状態
export const gameState = {
    settings: DEFAULT_SETTINGS, // 難易度設定（settings.js）
    mode: 'solo', // 'solo'（ひとりで遊ぶ） | 'versus'（対戦）
    random: Math.random, // ブロックの並び用の乱数（対戦では相手と同じシード）
    miscRandom: Math.random, // お邪魔ブロックの位置などその他の乱数
    touched: null, // つかんでいるブロック { x, y, block, targetX }（targetX は指のある列）
    counter: 0,
    raiseCount: 0,
    raiseTime: getChoice(DEFAULT_SETTINGS, 'difficulty').raiseTime,
    colorCount: getChoice(DEFAULT_SETTINGS, 'difficulty').colorCount, // ブロックの色数
    blocks: [],
    next: [],
    garbages: [], // お邪魔ブロック { x, y（一番上の段）, width, height, falling, clearing, count }
    garbageGauge: 0, // GARBAGE_GAUGE_MAX まで溜まるとお邪魔ブロックが降る（ひとりで遊ぶとき）
    incoming: [], // 対戦相手から送られてきて、まだ降っていないお邪魔ブロック { width, height, wait }
    chain: 1, // 現在の連鎖数
    maxChain: 1,
    popups: [], // 連鎖数・同時消し数の表示 { x, y, kind: 'chain' | 'combo', value, count }
    events: [], // このフレームで起きた出来事（効果音用）{ type, ... }
    flattenRequest: 0, // 平滑化を待っている残りフレーム数（0 なら要求なし）
    flattenMoves: [], // 平滑化で移動中のブロック { type, fromX, fromY, toX, toY, duration }
    flattenFrame: 0, // 平滑化の移動が始まってからのフレーム数
    shakeFrame: 0 // 平滑化でフィールドが揺れる残りフレーム数
};

const emit = (type, props = {}) => gameState.events.push({ type, ...props });

const inField = (x, y) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
const blockAt = (x, y) => gameState.blocks[x + y * WIDTH];
const setBlockAt = (x, y, b) => { gameState.blocks[x + y * WIDTH] = b; };
const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

// せり上がりによる表示上のYオフセット量
export function getRaiseOffset(state) {
    return Math.floor(BLOCK_SIZE * state.raiseCount / state.raiseTime);
}

// 予告ブロックを生成
function genNext() {
    for (let x = 0; x < WIDTH; ++x) {
        // 最下段2つが同色なら、その色は出さない（ポップしたときに勝手に消えないように）
        let exclude = blockAt(x, HEIGHT - 1).type;
        if (exclude !== blockAt(x, HEIGHT - 2).type) {
            exclude = EMPTY;
        }
        do {
            gameState.next[x] = Math.floor(gameState.random() * (exclude < 0 ? gameState.colorCount : gameState.colorCount - 1));
            if (gameState.next[x] >= exclude && exclude >= 0) gameState.next[x]++;
        } while (x && gameState.next[x - 1] === gameState.next[x]);
    }
}

// ゲーム初期化。対戦では mode: 'versus' と、相手と共通の seed を渡す
export function resetGame(settings = gameState.settings, { mode = 'solo', seed } = {}) {
    gameState.settings = settings;
    gameState.mode = mode;
    gameState.colorCount = getChoice(settings, 'difficulty').colorCount;
    gameState.random = seed === undefined ? Math.random : createRandom(seed);
    gameState.miscRandom = seed === undefined ? Math.random : createRandom(seed ^ 0x9E3779B9);
    gameState.blocks = Array.from({ length: NUM }, () => new Block());
    gameState.next = Array(WIDTH);

    // 下半分を埋める。開始直後に勝手に消えないよう、左と上の2つと同色にならない色を選ぶ
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = HEIGHT >> 1; y < HEIGHT; ++y) {
            let color;
            do {
                color = Math.floor(gameState.random() * gameState.colorCount);
            } while ((x >= 2 && color === blockAt(x - 1, y).type && color === blockAt(x - 2, y).type) ||
                (y >= 2 && color === blockAt(x, y - 1).type && color === blockAt(x, y - 2).type));
            blockAt(x, y).type = color;
        }
    }
    genNext();

    gameState.touched = null;
    gameState.garbages = [];
    gameState.garbageGauge = 0;
    gameState.incoming = [];
    gameState.chain = 1;
    gameState.maxChain = 1;
    gameState.popups = [];
    gameState.events = [];
    gameState.flattenRequest = 0;
    gameState.flattenMoves = [];
    gameState.flattenFrame = 0;
    gameState.shakeFrame = 0;
    gameState.counter = 0;
    gameState.raiseCount = 0;
    gameState.raiseTime = getChoice(settings, 'difficulty').raiseTime;
}

// (x, y) から右と下に3つ以上つながっていれば発火させ、発火させた数を返す
function judge(x, y) {
    const b = blockAt(x, y);
    if (!b.isConnectable()) return 0;
    const scan = (dx, dy) => {
        let num = 0;
        for (let sx = x + dx, sy = y + dy; sx < WIDTH && sy < HEIGHT; sx += dx, sy += dy) {
            const d = blockAt(sx, sy);
            if (b.type !== d.type || !d.isConnectable()) break;
            num++;
        }
        return num;
    };
    let num = 0;
    const right = scan(1, 0);
    if (right + 1 >= 3) {
        num += right + 1;
        for (let i = x; i <= x + right; ++i) {
            blockAt(i, y).setState(EXTINCT);
        }
    }
    const down = scan(0, 1);
    if (down + 1 >= 3) {
        num += down + 1;
        for (let i = y; i <= y + down; ++i) {
            blockAt(x, i).setState(EXTINCT);
        }
    }
    return num;
}

// 各ブロックの状態を進め、落下・入れ替えを反映する。せり上がりを止めるべきなら true を返す
function updateBlocks() {
    let stopRaise = false;
    for (let x = 0; x < WIDTH; ++x) {
        // 落下が下から順に伝わるよう、下の段から処理する
        for (let y = HEIGHT - 1; y >= 0; --y) {
            let b = blockAt(x, y);
            if (b.type === GARBAGE) continue; // お邪魔ブロックは updateGarbages で処理する
            const prevState = b.state;
            b.update();
            if (b.state === VANISH && b.count === VANISH_FRAME + b.vanishIndex * VANISH_DELAY_FRAME + 1) {
                emit('pop', { index: b.vanishIndex }); // 見た目の上で消えた瞬間
            }
            if (prevState === VANISH && b.isEmpty()) {
                // 消えたブロックの上に積まれていたブロックは、落ちて消えれば連鎖になる
                b.chain = false;
                for (let above = y - 1; above >= 0 && blockAt(x, above).type !== GARBAGE; --above) {
                    if (blockAt(x, above).isColor()) blockAt(x, above).chain = true;
                }
            }
            let fallCheck = HEIGHT; // この段の下が空いていれば、その上のブロックを落とす
            if (b.state === MOVEDOWN) {
                // 1マス下へ移動
                b.setState(NEUTRAL);
                Object.assign(blockAt(x, y + 1), b);
                b.type = EMPTY;
                b.chain = false;
                fallCheck = y + 2;
            } else if (b.state === SWAPPED) {
                // 左右のブロックを実際に入れ替える
                const o = blockAt(x + 1, y);
                b.setState(LEVITATE);
                o.setState(LEVITATE);
                setBlockAt(x + 1, y, b);
                setBlockAt(x, y, o);
                b = o;
            } else if (b.state === CHECK_FLOOR) {
                b.setState(NEUTRAL);
                fallCheck = y + 1;
            }
            if (b.state === LEVITATE) {
                const below = blockAt(x, y + 1);
                if (!below || !below.isVacancy()) b.setState(NEUTRAL);
            }
            if (fallCheck < HEIGHT) {
                if (blockAt(x, fallCheck).isVacancy()) blockAt(x, fallCheck - 1).setState(FALLING);
            } else if (y > 0 && b.isVacancy()) {
                const above = blockAt(x, y - 1);
                if (above.isColor() && above.state === NEUTRAL) above.setState(FALLING);
            }
            // 発火中、またはお邪魔ブロックから変化した直後の静止中
            stopRaise ||= b.state === EXTINCT || b.state === HANG;
        }
    }
    return stopRaise;
}

// 消滅判定。発火させた数を返す
function detectMatches() {
    let extinctCount = 0;
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            extinctCount += judge(x, y);
        }
    }
    if (extinctCount) {
        // 左上から順に消えていくようディレイ値を設定
        let vanishIndex = 0;
        for (const b of gameState.blocks) {
            if (b.state === EXTINCT && b.count === 0) {
                b.vanishIndex = vanishIndex++;
                b.vanishNum = extinctCount;
            }
        }
        let isChain = false;
        let ignited = 0; // このフレームで発火したブロック数（同時消し数）
        let top = null; // 発火したブロックのうち最も上のもの（連鎖数の表示位置）
        for (let x = 0; x < WIDTH; ++x) {
            for (let y = 0; y < HEIGHT; ++y) {
                const b = blockAt(x, y);
                if (b.state !== EXTINCT || b.count !== 0) continue;
                isChain ||= b.chain;
                ignited++;
                if (!top || y < top.y) top = { x, y };
                // 発火したブロックに接しているお邪魔ブロックを消去する
                for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
                    const garbage = inField(nx, ny) && blockAt(nx, ny).garbage;
                    if (garbage) startClearingGarbage(garbage);
                }
            }
        }
        if (isChain) {
            gameState.chain++;
            gameState.maxChain = Math.max(gameState.maxChain, gameState.chain);
        }
        const isCombo = ignited >= MIN_COMBO;
        if (isCombo) {
            gameState.popups.push({ ...top, kind: 'combo', value: ignited, count: 0 });
            emit('combo', { value: ignited });
        }
        if (isChain) {
            emit('chain', { value: gameState.chain });
            // 同時消しと重なったら連鎖数をその上に出す
            gameState.popups.push({ x: top.x, y: isCombo ? top.y - 1 : top.y, kind: 'chain', value: gameState.chain, count: 0 });
        }
        reduceGarbageGauge(ignited, isChain ? gameState.chain : 1);
        if (gameState.mode === 'versus') attack(comboAttack(ignited));
    }
    return extinctCount;
}

// 同時消し・連鎖に応じてお邪魔ブロックのゲージを減らす
function reduceGarbageGauge(ignited, chain) {
    const reduction = Math.max(0, ignited - (MIN_COMBO - 1)) * GAUGE_REDUCE_PER_COMBO
        + (chain - 1) * GAUGE_REDUCE_PER_CHAIN;
    gameState.garbageGauge = Math.max(0, gameState.garbageGauge - reduction);
}

// 連鎖フラグの解除と連鎖の終了判定、連鎖数表示の更新
function updateChain() {
    let chainContinues = gameState.garbages.some(garbage => garbage.clearing);
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = blockAt(x, y);
            if (b.chain) {
                // 着地して消えなかった、または発火したブロックはフラグを外す
                const below = blockAt(x, y + 1);
                const landed = b.state === NEUTRAL && (!below || !below.isVacancy());
                if (landed || b.state === EXTINCT) b.chain = false;
            }
            chainContinues ||= b.chain || b.state === EXTINCT || b.state === VANISH;
        }
    }
    if (!chainContinues) {
        // 連鎖が終わったら、連鎖数に応じたお邪魔ブロックを相手に送る
        if (gameState.mode === 'versus') attack(chainAttack(gameState.chain));
        gameState.chain = 1;
    }

    for (const popup of gameState.popups) popup.count++;
    gameState.popups = gameState.popups.filter(popup => popup.count < POPUP_FRAME);
}

// お邪魔ブロックの段 row（0 が一番上の段）のマス
function garbageRow(garbage, row) {
    return Array.from({ length: garbage.width }, (_, i) => blockAt(garbage.x + i, garbage.y + row));
}

// 幅全体の真下が空いていれば落下できる
function canGarbageFall(garbage) {
    const below = garbage.y + garbage.height;
    return below < HEIGHT && garbageRow(garbage, garbage.height).every(b => b.isEmpty() && b.state === NEUTRAL);
}

// 上の段から幅 width、高さ height のお邪魔ブロックを出現させる。
// 上が空いている段数しか置けないので、置けた段数を返す（0 なら置けなかった）
function spawnGarbage(width, height) {
    const x = Math.floor(gameState.miscRandom() * (WIDTH - width + 1));
    const garbage = { x, y: 0, width, height: 0, falling: false, clearing: false, count: 0 };
    while (garbage.height < height
        && garbageRow(garbage, garbage.height).every(b => b.isEmpty() && b.state === NEUTRAL)) {
        garbage.height++;
    }
    if (garbage.height === 0) return 0;
    for (let row = 0; row < garbage.height; ++row) {
        for (const b of garbageRow(garbage, row)) {
            b.type = GARBAGE;
            b.garbage = garbage;
        }
    }
    // 出現したフレームから落下中にして、最上段に居座ったままのせり上がりを防ぐ
    garbage.falling = canGarbageFall(garbage);
    gameState.garbages.push(garbage);
    return garbage.height;
}

// 消去を開始し、接しているお邪魔ブロックにも連鎖させる
function startClearingGarbage(garbage) {
    if (garbage.clearing || garbage.falling) return;
    garbage.clearing = true;
    garbage.count = 0;

    const { x, y, width, height } = garbage;
    const neighbors = [];
    for (let j = y; j < y + height; ++j) {
        neighbors.push([x - 1, j], [x + width, j]);
    }
    for (let i = x; i < x + width; ++i) {
        neighbors.push([i, y - 1], [i, y + height]);
    }
    for (const [nx, ny] of neighbors) {
        const other = inField(nx, ny) && blockAt(nx, ny).garbage;
        if (other) startClearingGarbage(other);
    }
}

// お邪魔ブロックの一番下の段を通常のブロックに変える（残りの段は1段低いお邪魔ブロックとして残る）。
// 変化したブロックはしばらく静止してから落下する
function convertGarbage(garbage) {
    for (const b of garbageRow(garbage, garbage.height - 1)) {
        b.type = Math.floor(gameState.miscRandom() * gameState.colorCount);
        b.garbage = null;
        b.chain = true; // 変化したブロックが消えれば連鎖になる
        b.setState(HANG);
    }
    if (--garbage.height > 0) {
        garbage.clearing = false;
        garbage.count = 0;
    } else {
        gameState.garbages.splice(gameState.garbages.indexOf(garbage), 1);
    }
}

// お邪魔ブロックを1段下へ動かす（各列で、真下の空きマスを一番上へ回す）
function moveGarbageDown(garbage) {
    for (let i = 0; i < garbage.width; ++i) {
        const x = garbage.x + i;
        const below = blockAt(x, garbage.y + garbage.height);
        for (let y = garbage.y + garbage.height - 1; y >= garbage.y; --y) {
            setBlockAt(x, y + 1, blockAt(x, y));
        }
        setBlockAt(x, garbage.y, below);
    }
    garbage.y++;
}

// お邪魔ブロックの出現・落下・消去を進める
function updateGarbages() {
    // 下にあるものから落とす
    const garbages = [...gameState.garbages].sort((a, b) => (b.y + b.height) - (a.y + a.height));
    for (const garbage of garbages) {
        if (garbage.clearing) {
            if (++garbage.count >= GARBAGE_CLEAR_FRAME) convertGarbage(garbage);
            continue;
        }
        if (garbage.falling && ++garbage.count >= FALL_FRAME) {
            moveGarbageDown(garbage);
            garbage.falling = false;
            if (!canGarbageFall(garbage)) emit('land');
        }
        if (!garbage.falling && canGarbageFall(garbage)) {
            garbage.falling = true;
            garbage.count = 0;
        }
    }

    if (gameState.mode === 'versus') {
        dropIncomingGarbage();
        return;
    }

    // ゲージが満タンになったら降らせる（置けなければ満タンのまま待つ）
    if (!isGarbageEnabled(gameState.settings)) return;
    const rate = getChoice(gameState.settings, 'difficulty').gaugeRate;
    gameState.garbageGauge = Math.min(gameState.garbageGauge + rate, GARBAGE_GAUGE_MAX);
    if (gameState.garbageGauge >= GARBAGE_GAUGE_MAX) {
        const width = GARBAGE_MIN_WIDTH + Math.floor(gameState.miscRandom() * (GARBAGE_MAX_WIDTH - GARBAGE_MIN_WIDTH + 1));
        if (spawnGarbage(width, 1)) gameState.garbageGauge = 0;
    }
}

// ===== 対戦 =====

// 同時消しで送るお邪魔ブロック。幅の合計は「消した数 - 1」で、横幅を超える分は複数に分ける
export function comboAttack(ignited) {
    if (ignited < MIN_COMBO) return [];
    const total = ignited - 1;
    const count = Math.ceil(total / WIDTH);
    return Array.from({ length: count }, (_, i) => ({
        width: Math.floor(total / count) + (i < total % count ? 1 : 0),
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
        let power = piece.width * piece.height;
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
        if (power === piece.width * piece.height) {
            sent.push({ ...piece });
        } else if (power > 0) {
            // 打ち消しきれなかった分を送る
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

// キャンバス上の座標（px）をマスの座標に変換
function pointToCell(px, py) {
    return {
        x: Math.floor(px / BLOCK_SIZE),
        y: Math.floor((py + getRaiseOffset(gameState)) / BLOCK_SIZE)
    };
}

// マウス・タッチ操作を反映する
function applyPointerActions(actions) {
    for (const action of actions) {
        switch (action.type) {
            case 'touch': {
                // 押したブロックをつかむ（最上段はつかめない）
                const cell = pointToCell(action.px, action.py);
                const valid = cell.x >= 0 && cell.x < WIDTH && cell.y >= 1 && cell.y < HEIGHT;
                const block = valid && blockAt(cell.x, cell.y);
                gameState.touched = block && block.isColor() ? { ...cell, block, targetX: cell.x } : null;
                break;
            }
            case 'drag':
                if (gameState.touched) {
                    gameState.touched.targetX = clamp(Math.floor(action.px / BLOCK_SIZE), 0, WIDTH - 1);
                }
                break;
            case 'release':
                gameState.touched = null;
                break;
        }
    }
}

// つかんでいるブロックを、指のある列に向かって1マスずつ入れ替えながら動かす
function updateDrag() {
    const t = gameState.touched;
    if (!t) return;
    // 入れ替えが終わるとブロックは隣のマスへ移っている
    const dx = [0, 1, -1].find(d => inField(t.x + d, t.y) && blockAt(t.x + d, t.y) === t.block);
    if (dx === undefined || !t.block.isColor()) {
        // 消えた・落下したなどで見失ったら離す
        gameState.touched = null;
        return;
    }
    t.x += dx;
    if (t.targetX === t.x || t.block.state !== NEUTRAL) return;
    trySwap(t.targetX > t.x ? t.x : t.x - 1, t.y);
}

// (x, y) と (x + 1, y) のブロックを入れ替える
function trySwap(x, y) {
    const l = blockAt(x, y);
    const r = blockAt(x + 1, y);
    if (!l.isSwappable() || !r.isSwappable()) return;
    // 真上から落ちてくるブロックがあれば入れ替えない
    if (blockAt(x, y - 1).isFalling() || blockAt(x + 1, y - 1).isFalling()) return;
    l.setState(SWAPPING_L);
    r.setState(SWAPPING_R);
    emit('swap');
}

// 盤面が静止しているか（消去・落下・入れ替えなどの途中でなく、浮いているブロックもない）
// 空きマス同士を入れ替えたときなどは空きマスだけが動いているので、空きマスの状態は見ない
function isSettled() {
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = blockAt(x, y);
            if (b.isEmpty()) continue;
            if (b.state !== NEUTRAL) return false;
            // 下のブロックを入れ替えで抜いた直後などは、落下が始まるまで少し浮いている
            if (b.isColor() && y + 1 < HEIGHT && blockAt(x, y + 1).isEmpty()) return false;
        }
    }
    return gameState.garbages.every(garbage => !garbage.falling && !garbage.clearing);
}

// 台を揺らしたように、各列の上から最初に現れる通常ブロックのかたまりを隣の列へずらして落とす。
// 一番上がお邪魔ブロックの列でも、その下の通常ブロックが横へ抜け出してずれる。
// ずれる先は隣の列の同じ高さの空きマスで、お邪魔ブロックなどには重ならない。
// ずれるのは、ずれる先から下に続く空きマス数の半分（切り上げ）で、かたまりのまま順番を保って移る。
// 左右とも空いていれば空きの多いほうへ、同じならランダムにずれる。受け取った列は渡さず、渡した列は受け取らない。
// 盤面はすぐに移動後の状態にし、移動の様子（横移動→落下）を表す一覧を返す
function flatten() {
    // 動いている空きマスが、移したブロックの上に落ちてきて上書きしないように止める
    for (const b of gameState.blocks) {
        if (b.isEmpty()) b.setState(NEUTRAL);
    }
    // 列 x の上から最初に現れる通常ブロックのかたまり（top 段目から length 個）
    const colorRun = x => {
        let top = 0;
        while (top < HEIGHT && !blockAt(x, top).isColor()) top++;
        let length = 0;
        while (top + length < HEIGHT && blockAt(x, top + length).isColor()) length++;
        return { top, length };
    };
    // 列 x の y 段目から下に続く空きマスの数
    const freeBelow = (x, y) => {
        let n = 0;
        while (y + n < HEIGHT && blockAt(x, y + n).isEmpty()) n++;
        return n;
    };

    // かたまりが高い位置にある列から順に、ずれる先と個数を決めて盤面に反映する
    const gave = Array(WIDTH).fill(false);
    const received = Array(WIDTH).fill(false);
    const moves = [];
    const order = [...Array(WIDTH).keys()].sort((a, b) => colorRun(a).top - colorRun(b).top);
    for (const from of order) {
        const run = colorRun(from);
        if (received[from] || run.length === 0) continue;
        const candidates = [from - 1, from + 1]
            .filter(to => inField(to, 0) && !gave[to] && !received[to])
            .map(to => ({ to, free: freeBelow(to, run.top) }))
            .filter(c => c.free > 0);
        if (candidates.length === 0) continue;
        let { to, free } = candidates[0];
        if (candidates.length === 2) {
            const [l, r] = candidates;
            ({ to, free } = l.free !== r.free ? (l.free > r.free ? l : r) : candidates[Math.floor(gameState.miscRandom() * 2)]);
        }
        const count = Math.min(Math.ceil(free / 2), run.length);
        gave[from] = received[to] = true;

        // 上の count 個を、順番を保ったまま隣の列に積む（一番下のブロックが一番下に着く）
        const fall = free - count;
        for (let i = count - 1; i >= 0; --i) {
            const fromY = run.top + i;
            const toY = fromY + fall;
            const src = blockAt(from, fromY);
            const dst = blockAt(to, toY);
            dst.type = src.type;
            dst.chain = false;
            src.type = EMPTY;
            src.chain = false;
            const duration = FLATTEN_HORIZONTAL_FRAME + fall * FLATTEN_VERTICAL_FRAME;
            moves.push({ type: dst.type, fromX: from, fromY, toX: to, toY, duration });
        }
    }
    return moves;
}

// 平滑化で移動中のブロックの位置（マス単位）。到着済みなら null を返す
export function flattenMovePosition(move, frame) {
    if (frame >= move.duration) return null;
    if (frame < FLATTEN_HORIZONTAL_FRAME) {
        return { x: move.fromX + (move.toX - move.fromX) * frame / FLATTEN_HORIZONTAL_FRAME, y: move.fromY };
    }
    return { x: move.toX, y: move.fromY + (frame - FLATTEN_HORIZONTAL_FRAME) / FLATTEN_VERTICAL_FRAME };
}

// 平滑化の要求を処理する。盤面が動いている間は静止するまで待つ
function updateFlatten(requested) {
    if (requested) gameState.flattenRequest = FLATTEN_WAIT_FRAME;
    if (gameState.flattenRequest === 0) return;
    if (isSettled()) {
        gameState.flattenMoves = flatten();
        gameState.flattenFrame = 0;
        gameState.flattenRequest = 0;
        gameState.shakeFrame = SHAKE_FRAME;
        if (gameState.flattenMoves.length) emit('swap');
    } else {
        gameState.flattenRequest--;
    }
}

// 平滑化の移動を進める。全部着地したら終わり
function updateFlattenMoves() {
    gameState.flattenFrame++;
    if (gameState.flattenMoves.every(move => gameState.flattenFrame >= move.duration)) {
        gameState.flattenMoves = [];
        emit('land');
    }
}

// 全体を1段せり上げる。最上段まで埋まっていたら true を返す
function raiseRow() {
    let gameOver = false;
    for (let x = 0; x < WIDTH; ++x) {
        // 上から2段目まで埋まっている（最上段にはお邪魔ブロックだけが乗りうる）
        gameOver ||= !blockAt(x, 0).isEmpty() || !blockAt(x, 1).isEmpty();

        // 最上段のブロックを予告ブロックとして再利用し、列を1段ずつ上にずらす
        let b = blockAt(x, 0);
        b.type = gameState.next[x];
        b.garbage = null;
        b.chain = false;
        b.setState(NEUTRAL);
        for (let y = HEIGHT - 1; y >= 0; --y) {
            const n = blockAt(x, y);
            setBlockAt(x, y, b);
            b = n;
        }
    }
    genNext();
    for (const garbage of gameState.garbages) garbage.y--;
    for (const popup of gameState.popups) popup.y--;
    if (gameState.touched) {
        gameState.touched.y--;
        if (gameState.touched.y < 1) gameState.touched = null;
    }
    return gameOver;
}

// 対戦相手の画面に表示する、自分のフィールドの様子
//   cells: 各マスを1文字で（'0'〜'5' が色、'.' が空き。お邪魔ブロックは garbages で送る）
export function getSnapshot() {
    const cells = gameState.blocks.map(b => (b.isColor() && b.isVisible() ? String(b.type) : '.')).join('');
    return {
        cells,
        next: gameState.next.join(''),
        garbages: gameState.garbages.map(g => [g.x, g.y, g.width, g.height, g.clearing ? 1 : 0]),
        raise: Math.round(gameState.raiseCount / gameState.raiseTime * 100) / 100,
        incoming: gameState.incoming.map(p => [p.width, p.height]),
        chain: gameState.chain
    };
}

// ゲーム更新処理。ゲームオーバーなら true を返す
export function updateGame(input) {
    gameState.events = [];
    if (gameState.shakeFrame > 0) gameState.shakeFrame--;
    if (gameState.flattenMoves.length) {
        // 平滑化の移動中は、ブロック・お邪魔ブロック・せり上がりを止める
        updateFlattenMoves();
        applyPointerActions(input.actions);
        gameState.counter++;
        return false;
    }
    let stopRaise = updateBlocks();

    const extinctCount = detectMatches();
    if (extinctCount) {
        gameState.raiseTime = Math.max(gameState.raiseTime - extinctCount, MIN_RAISE_TIME);
        stopRaise = true;
    }
    updateChain();

    updateGarbages();
    // お邪魔ブロックの落下中・消去中はせり上げない
    stopRaise ||= gameState.garbages.some(garbage => garbage.falling || garbage.clearing);

    updateFlatten(input.flatten);
    applyPointerActions(input.actions);
    updateDrag();

    if (!stopRaise) {
        gameState.raiseCount += input.raise ? RAISE_BOOST : 1;
    }
    if (gameState.raiseCount >= gameState.raiseTime) {
        gameState.raiseCount = 0;
        if (raiseRow()) return true;
    }

    gameState.counter++;
    return false;
}

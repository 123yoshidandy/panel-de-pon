import {
    WIDTH, HEIGHT, NUM, BLOCK_SIZE, EMPTY, GARBAGE, COLOR_COUNT,
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, LEVITATE, CHECK_FLOOR, HANG,
    FALL_FRAME, INITIAL_RAISE_TIME, MIN_RAISE_TIME, RAISE_BOOST,
    GARBAGE_GAUGE_MAX, GARBAGE_MIN_WIDTH, GARBAGE_MAX_WIDTH, GARBAGE_CLEAR_FRAME,
    GAUGE_REDUCE_PER_COMBO, GAUGE_REDUCE_PER_CHAIN, POPUP_FRAME, MIN_COMBO
} from './constants.js';
import { Block } from './Block.js';

// ゲーム状態
export const gameState = {
    x: 0, // カーソル位置（入れ替えるペアの左側）
    y: 0,
    touched: null, // タッチ中のマス { x, y }
    counter: 0,
    raiseCount: 0,
    raiseTime: INITIAL_RAISE_TIME,
    blocks: [],
    next: [],
    garbages: [], // お邪魔ブロック { x, y, width, falling, clearing, count }
    garbageGauge: 0, // GARBAGE_GAUGE_MAX まで溜まるとお邪魔ブロックが降る
    chain: 1, // 現在の連鎖数
    maxChain: 1,
    popups: [] // 連鎖数・同時消し数の表示 { x, y, kind: 'chain' | 'combo', value, count }
};

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
            gameState.next[x] = Math.floor(Math.random() * (exclude < 0 ? COLOR_COUNT : COLOR_COUNT - 1));
            if (gameState.next[x] >= exclude && exclude >= 0) gameState.next[x]++;
        } while (x && gameState.next[x - 1] === gameState.next[x]);
    }
}

// ゲーム初期化
export function resetGame() {
    gameState.blocks = Array.from({ length: NUM }, () => new Block());
    gameState.next = Array(WIDTH);

    // 下半分を埋める。開始直後に勝手に消えないよう、左と上の2つと同色にならない色を選ぶ
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = HEIGHT >> 1; y < HEIGHT; ++y) {
            let color;
            do {
                color = Math.floor(Math.random() * COLOR_COUNT);
            } while ((x >= 2 && color === blockAt(x - 1, y).type && color === blockAt(x - 2, y).type) ||
                (y >= 2 && color === blockAt(x, y - 1).type && color === blockAt(x, y - 2).type));
            blockAt(x, y).type = color;
        }
    }
    genNext();

    gameState.x = WIDTH >> 1;
    gameState.y = HEIGHT >> 1;
    gameState.touched = null;
    gameState.garbages = [];
    gameState.garbageGauge = 0;
    gameState.chain = 1;
    gameState.maxChain = 1;
    gameState.popups = [];
    gameState.counter = 0;
    gameState.raiseCount = 0;
    gameState.raiseTime = INITIAL_RAISE_TIME;
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
        }
        if (isChain) {
            // 同時消しと重なったら連鎖数をその上に出す
            gameState.popups.push({ x: top.x, y: isCombo ? top.y - 1 : top.y, kind: 'chain', value: gameState.chain, count: 0 });
        }
        reduceGarbageGauge(ignited, isChain ? gameState.chain : 1);
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
    if (!chainContinues) gameState.chain = 1;

    for (const popup of gameState.popups) popup.count++;
    gameState.popups = gameState.popups.filter(popup => popup.count < POPUP_FRAME);
}

// お邪魔ブロックが占めるマス（dy 段ずらした位置）
function garbageCells(garbage, dy = 0) {
    return Array.from({ length: garbage.width }, (_, i) => blockAt(garbage.x + i, garbage.y + dy));
}

// 幅全体の真下が空いていれば落下できる
function canGarbageFall(garbage) {
    return garbage.y + 1 < HEIGHT && garbageCells(garbage, 1).every(b => b.isEmpty() && b.state === NEUTRAL);
}

// 最上段にお邪魔ブロックを出現させる。置けなければ false を返す
function spawnGarbage() {
    const width = GARBAGE_MIN_WIDTH + Math.floor(Math.random() * (GARBAGE_MAX_WIDTH - GARBAGE_MIN_WIDTH + 1));
    const garbage = {
        x: Math.floor(Math.random() * (WIDTH - width + 1)),
        y: 0,
        width,
        falling: false,
        clearing: false,
        count: 0
    };
    const cells = garbageCells(garbage);
    if (!cells.every(b => b.isEmpty() && b.state === NEUTRAL)) return false;
    for (const b of cells) {
        b.type = GARBAGE;
        b.garbage = garbage;
    }
    // 出現したフレームから落下中にして、最上段に居座ったままのせり上がりを防ぐ
    garbage.falling = canGarbageFall(garbage);
    gameState.garbages.push(garbage);
    return true;
}

// 消去を開始し、接しているお邪魔ブロックにも連鎖させる
function startClearingGarbage(garbage) {
    if (garbage.clearing || garbage.falling) return;
    garbage.clearing = true;
    garbage.count = 0;

    const { x, y, width } = garbage;
    const neighbors = [[x - 1, y], [x + width, y]];
    for (let i = x; i < x + width; ++i) {
        neighbors.push([i, y - 1], [i, y + 1]);
    }
    for (const [nx, ny] of neighbors) {
        const other = inField(nx, ny) && blockAt(nx, ny).garbage;
        if (other) startClearingGarbage(other);
    }
}

// お邪魔ブロックを通常のブロックに変える。変化後はしばらく静止してから落下する
function convertGarbage(garbage) {
    for (const b of garbageCells(garbage)) {
        b.type = Math.floor(Math.random() * COLOR_COUNT);
        b.garbage = null;
        b.chain = true; // 変化したブロックが消えれば連鎖になる
        b.setState(HANG);
    }
    gameState.garbages.splice(gameState.garbages.indexOf(garbage), 1);
}

// お邪魔ブロックの出現・落下・消去を進める
function updateGarbages() {
    // 下にあるものから落とす
    const garbages = [...gameState.garbages].sort((a, b) => b.y - a.y);
    for (const garbage of garbages) {
        if (garbage.clearing) {
            if (++garbage.count >= GARBAGE_CLEAR_FRAME) convertGarbage(garbage);
            continue;
        }
        if (garbage.falling && ++garbage.count >= FALL_FRAME) {
            // 1マス下の空きマスと入れ替える
            for (let i = 0; i < garbage.width; ++i) {
                const x = garbage.x + i;
                const below = blockAt(x, garbage.y + 1);
                setBlockAt(x, garbage.y + 1, blockAt(x, garbage.y));
                setBlockAt(x, garbage.y, below);
            }
            garbage.y++;
            garbage.falling = false;
        }
        if (!garbage.falling && canGarbageFall(garbage)) {
            garbage.falling = true;
            garbage.count = 0;
        }
    }

    // ゲージが満タンになったら降らせる（置けなければ満タンのまま待つ）
    gameState.garbageGauge = Math.min(gameState.garbageGauge + 1, GARBAGE_GAUGE_MAX);
    if (gameState.garbageGauge >= GARBAGE_GAUGE_MAX && spawnGarbage()) {
        gameState.garbageGauge = 0;
    }
}

// キャンバス上の座標（px）をマスの座標に変換
function pointToCell(px, py) {
    return {
        x: Math.floor(px / BLOCK_SIZE),
        y: Math.floor((py + getRaiseOffset(gameState)) / BLOCK_SIZE)
    };
}

// マウス・タッチ操作を反映する。入れ替えが要求されたら true を返す
function applyPointerActions(actions) {
    let swap = false;
    for (const action of actions) {
        switch (action.type) {
            case 'select': {
                // マウス: クリックしたマスをペアの左側にする（最上段は選択できない）
                const cell = pointToCell(action.px, action.py);
                gameState.x = clamp(cell.x, 0, WIDTH - 2);
                gameState.y = clamp(cell.y, 1, HEIGHT - 1);
                break;
            }
            case 'touch': {
                const cell = pointToCell(action.px, action.py);
                const valid = cell.x >= 0 && cell.x < WIDTH && cell.y >= 1 && cell.y < HEIGHT;
                gameState.touched = valid ? cell : null;
                break;
            }
            case 'swipe': {
                // タッチしたブロックをスワイプ方向へ動かす
                const t = gameState.touched;
                if (!t) break;
                const left = action.dir > 0 ? t.x : t.x - 1;
                if (left < 0 || left > WIDTH - 2) break;
                gameState.x = left;
                gameState.y = t.y;
                gameState.touched = null;
                swap = true;
                break;
            }
        }
    }
    return swap;
}

// キー操作でカーソルを移動
function moveCursor(input) {
    if (input.up) {
        if (gameState.y > 1) gameState.y--;
    } else if (input.down) {
        if (gameState.y < HEIGHT - 1) gameState.y++;
    } else if (input.right) {
        if (gameState.x < WIDTH - 2) gameState.x++;
    } else if (input.left) {
        if (gameState.x > 0) gameState.x--;
    }
}

// カーソル位置のブロックを入れ替える
function trySwap() {
    const { x, y } = gameState;
    const l = blockAt(x, y);
    const r = blockAt(x + 1, y);
    if (!l.isSwappable() || !r.isSwappable()) return;
    // 真上から落ちてくるブロックがあれば入れ替えない
    if (blockAt(x, y - 1).isFalling() || blockAt(x + 1, y - 1).isFalling()) return;
    l.setState(SWAPPING_L);
    r.setState(SWAPPING_R);
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
    if (gameState.y > 1) gameState.y--;
    if (gameState.touched) {
        gameState.touched.y--;
        if (gameState.touched.y < 1) gameState.touched = null;
    }
    return gameOver;
}

// ゲーム更新処理。ゲームオーバーなら true を返す
export function updateGame(input) {
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

    const swipe = applyPointerActions(input.actions);
    moveCursor(input);
    if (input.swap || swipe) trySwap();

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

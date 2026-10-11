import {
    WIDTH, HEIGHT, NUM, BLOCK_SIZE, EMPTY, COLOR_COUNT,
    NEUTRAL, EXTINCT, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, LEVITATE, CHECK_FLOOR,
    INITIAL_RAISE_TIME, MIN_RAISE_TIME, RAISE_BOOST
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
    next: []
};

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

// 各ブロックの状態を進め、落下・入れ替えを反映する。発火中のブロックがあれば true を返す
function updateBlocks() {
    let hasExtinct = false;
    for (let x = 0; x < WIDTH; ++x) {
        // 落下が下から順に伝わるよう、下の段から処理する
        for (let y = HEIGHT - 1; y >= 0; --y) {
            let b = blockAt(x, y);
            b.update();
            let fallCheck = HEIGHT; // この段の下が空いていれば、その上のブロックを落とす
            if (b.state === MOVEDOWN) {
                // 1マス下へ移動
                b.setState(NEUTRAL);
                Object.assign(blockAt(x, y + 1), b);
                b.type = EMPTY;
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
                if (!above.isEmpty() && above.state === NEUTRAL) above.setState(FALLING);
            }
            hasExtinct ||= b.state === EXTINCT;
        }
    }
    return hasExtinct;
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
    }
    return extinctCount;
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
    if (blockAt(x, y - 1).state === FALLING || blockAt(x + 1, y - 1).state === FALLING) return;
    l.setState(SWAPPING_L);
    r.setState(SWAPPING_R);
}

// 全体を1段せり上げる。最上段まで埋まっていたら true を返す
function raiseRow() {
    let gameOver = false;
    for (let x = 0; x < WIDTH; ++x) {
        gameOver ||= !blockAt(x, 1).isEmpty();

        // 最上段のブロックを予告ブロックとして再利用し、列を1段ずつ上にずらす
        let b = blockAt(x, 0);
        b.type = gameState.next[x];
        b.setState(NEUTRAL);
        for (let y = HEIGHT - 1; y >= 0; --y) {
            const n = blockAt(x, y);
            setBlockAt(x, y, b);
            b = n;
        }
    }
    genNext();
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

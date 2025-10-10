import {
    WIDTH, HEIGHT, NUM, BLOCK_SIZE,
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, REVITATE, CHECK_FLOOR
} from './constants.js';
import { Block } from './Block.js';
import {
    upKey, leftKey, rightKey, downKey, swapKey, raiseKey,
    resetKeys
} from './input.js';

// ゲーム状態
export const gameState = {
    x: 0, // カーソル位置
    y: 0,
    counter: 0,
    raiseCount: 0,
    raiseTime: 600,
    raiseY: 0,
    currentScale: 1,
    isMobile: false,
    intervalKey: null,
    blocks: [],
    next: []
};

// 予告ブロックを生成
export function genNext() {
    for (let i = 0; i < WIDTH; ++i) {
        let exclude = gameState.blocks[i + (HEIGHT - 1) * WIDTH].type;
        if (exclude != gameState.blocks[i + (HEIGHT - 2) * WIDTH].type) {
            exclude = -1;
        }
        // ポップしたときに勝手に消えてしまわないように色を抽選
        do {
            gameState.next[i] = Math.floor(Math.random() * (exclude < 0 ? 6 : 5));
            gameState.next[i] += gameState.next[i] == exclude;
        } while (i && gameState.next[i - 1] == gameState.next[i]);
    }
}

// ゲーム初期化
export function resetGame() {
    gameState.blocks = Array(NUM).fill().map(() => new Block(-1));
    gameState.next = Array(WIDTH);

    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            if (y >= HEIGHT >> 1) {
                // 開始直後にブロックが勝手に消えないよう隣接を確認しながら初期化
                let color;
                do {
                    color = Math.floor(Math.random() * 6);
                } while ((x >= 2 && color == gameState.blocks[x - 1 + y * WIDTH].type && color == gameState.blocks[x - 2 + y * WIDTH].type) ||
                    (y >= 2 && color == gameState.blocks[x + (y - 1) * WIDTH].type && color == gameState.blocks[x + (y - 2) * WIDTH].type));
                gameState.blocks[x + y * WIDTH].type = color;
            } else {
                gameState.blocks[x + y * WIDTH].type = -1;
            }
            gameState.blocks[x + y * WIDTH].setState(NEUTRAL);
        }
    }
    genNext();

    gameState.x = WIDTH >> 1;
    gameState.y = HEIGHT >> 1;
    gameState.counter = 0;
    gameState.raiseCount = 0;
    gameState.raiseTime = 600;
}

// 連結判定
function judge(x, y) {
    const b = gameState.blocks[x + y * WIDTH];
    if (!b.isConnectable()) return 0;
    const scan = (dx, dy) => {
        let num = 0;
        let sx = x + dx;
        let sy = y + dy;
        while (sx < WIDTH && sy < HEIGHT) {
            const d = gameState.blocks[sx + sy * WIDTH];
            if (b.type != d.type || !d.isConnectable()) {
                break;
            }
            num++;
            sx += dx;
            sy += dy;
        }
        return num;
    };
    let num = 0;
    const right = scan(1, 0);
    if (right + 1 >= 3) {
        num += right + 1;
        for (let i = x; i <= x + right; ++i) {
            gameState.blocks[i + y * WIDTH].setState(EXTINCT);
        }
    }
    const down = scan(0, 1);
    if (down + 1 >= 3) {
        num += down + 1;
        for (let i = y; i <= y + down; ++i) {
            gameState.blocks[x + i * WIDTH].setState(EXTINCT);
        }
    }
    return num;
}

// ゲーム更新処理
export function updateGame() {
    let stopRaise = false;
    // 更新
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = HEIGHT; y--;) {
            let b = gameState.blocks[x + y * WIDTH];
            b.update();
            let fallCheck = HEIGHT;
            if (b.state == MOVEDOWN) {
                b.setState(NEUTRAL);
                let d = gameState.blocks[x + (y + 1) * WIDTH];
                Object.assign(d, b);
                b.type = -1;
                fallCheck = y + 2;
            } else if (b.state == SWAPPED) {
                let o = gameState.blocks[x + 1 + y * WIDTH];
                b.setState(REVITATE);
                o.setState(REVITATE);
                gameState.blocks[x + 1 + y * WIDTH] = b;
                gameState.blocks[x + y * WIDTH] = b = o;
            } else if (b.state == CHECK_FLOOR) {
                b.setState(NEUTRAL);
                fallCheck = y + 1;
            }
            if (b.state == REVITATE) {
                let d = gameState.blocks[x + (y + 1) * WIDTH];
                if (!d || !d.isVacancy()) b.setState(NEUTRAL);
            }
            if (fallCheck < HEIGHT) {
                let d = gameState.blocks[x + (fallCheck - 1) * WIDTH];
                let u = gameState.blocks[x + fallCheck * WIDTH];
                if (u.isVacancy()) d.setState(FALLING);
            } else if (y > 0 && b.isVacancy()) {
                let d = gameState.blocks[x + (y - 1) * WIDTH];
                if (d.type >= 0 && d.state == NEUTRAL) d.setState(FALLING);
            }
            stopRaise |= b.state == EXTINCT;
        }
    }

    // 消滅判定
    let extinctCount = 0;
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            extinctCount += judge(x, y);
        }
    }
    if (extinctCount) {
        let vanishIndex = 0;
        for (let b of gameState.blocks) {
            if (b.state == EXTINCT && b.count == 0) {
                // 左上から順に消えていくようディレイ値を設定
                b.vanishIndex = vanishIndex++;
                b.vanishNum = extinctCount;
            }
        }
        gameState.raiseTime -= extinctCount;
        stopRaise = true;
    }
    if (gameState.raiseTime < 40) gameState.raiseTime = 40;

    // 移動
    if (upKey) {
        if (gameState.y > 1) gameState.y--;
    } else if (downKey) {
        if (gameState.y < HEIGHT - 1) gameState.y++;
    } else if (rightKey) {
        if (gameState.x < WIDTH - 2) gameState.x++;
    } else if (leftKey) {
        if (gameState.x > 0) gameState.x--;
    }

    // 入れ替え
    if (swapKey) {
        const l = gameState.blocks[gameState.x + gameState.y * WIDTH];
        const r = gameState.blocks[gameState.x + 1 + gameState.y * WIDTH];
        let swappable = l.isSwappable() && r.isSwappable();
        if (swappable) {
            const ul = gameState.blocks[gameState.x + (gameState.y - 1) * WIDTH];
            const ur = gameState.blocks[gameState.x + 1 + (gameState.y - 1) * WIDTH];
            swappable = ul.state != FALLING && ur.state != FALLING;
        }
        if (swappable) {
            l.setState(SWAPPING_L);
            r.setState(SWAPPING_R);
        }
    }

    // せり上がり
    let pump = 1;
    if (raiseKey) {
        pump = 20;
    }
    if (!stopRaise) {
        gameState.raiseCount += pump;
    }
    if (gameState.raiseCount >= gameState.raiseTime) {
        gameState.raiseCount = 0;
        let gameOver = false;
        for (let x = 0; x < WIDTH; ++x) {
            // 最上段まで埋まってしまった
            gameOver = gameOver || gameState.blocks[x + WIDTH].type >= 0;

            let b = gameState.blocks[x];
            b.type = gameState.next[x];
            b.setState(NEUTRAL);
            for (let y = HEIGHT; y--;) {
                let n = gameState.blocks[x + y * WIDTH];
                gameState.blocks[x + y * WIDTH] = b;
                b = n;
            }
        }
        genNext();
        if (gameState.y > 1) gameState.y--;
        if (gameOver) {
            return true; // ゲームオーバー
        }
    }

    gameState.counter++;
    resetKeys();
    return false; // ゲーム継続
}
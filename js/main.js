// ブロックの状態
const NEUTRAL = 0; // 静止状態
const EXTINCT = 1; // 発火中
const VANISH = 2; // 消滅中
const FALLING = 3; // 落下中
const MOVEDOWN = 4; // 落下完了
const SWAPPING_R = 5; // 入れ替え中
const SWAPPING_L = 6; // 入れ替え中
const SWAPPED = 7; // 入れ替え完了
const REVITATE = 8; // 浮遊中
const CHECK_FLOOR = 9; // 浮遊終了
// 寸法
const WIDTH = 6;
const HEIGHT = 12;
const BLOCK_SIZE = 30;
const NUM = WIDTH * HEIGHT;
// イージング
const easeOutCubic = x => 1 - (1 - x) * (1 - x) * (1 - x);
// 遷移フレーム数
const SAWP_FRAME = 4;
const FALL_FRAME = 8;
const VANISH_DELAY_FRAME = 6;
const VANISH_FRAME = 20;
// 見た目情報
const RELIEF = ['♥', '●', '▼', '◆', '★', '▲'];
const LIGHT_COLORS = ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(128,0,128)', 'rgb(255,255,0)', 'rgb(0,255,255)'];
const COLORS = ['rgb(192,0,0)', 'rgb(0,192,0)', 'rgb(0,0,192)', 'rgb(96,0,96)', 'rgb(192,192,0)', 'rgb(0,192,192)'];
const DARK_COLORS = ['rgb(128,0,0)', 'rgb(0,128,0)', 'rgb(0,0,128)', 'rgb(64,0,64)', 'rgb(128,128,0)', 'rgb(0,128,128)'];
// ブロッククラス
class Block {
    constructor(type) {
        this.count = 0;
        this.type = type;
        this.state = NEUTRAL;
        this.vanishIndex = -1;
        this.vanishNum = 0;
    }
    setState(st) {
            this.state = st;
            this.count = 0;
        }
        // 空きブロックと見なせるか
    isVacancy() {
            return (this.type < 0 && this.state == NEUTRAL) || this.state == FALLING;
        }
        // 可視状態
    isVisible() {
            if (this.type < 0) return false;
            return this.state == EXTINCT ? this.count & 2 : this.state != VANISH || this.count <= VANISH_FRAME + this.vanishIndex * VANISH_DELAY_FRAME;
        }
        // 入れ替え可能ブロックか
    isSwappable() {
            return this.state == NEUTRAL;
        }
        // 連結可能ブロックか
    isConnectable() {
            return this.type >= 0 && (this.state == NEUTRAL || (this.state == EXTINCT && this.count == 0));
        }
        // 表示上のXオフセット量
    offsetX() {
            return this.state == SWAPPING_L || this.state == SWAPPING_R ? (this.state == SWAPPING_L ? 1 : -1) * easeOutCubic(this.count / SAWP_FRAME) * BLOCK_SIZE : 0;
        }
        // 表示上のYオフセット量
    offsetY() {
            return this.state == FALLING ? this.count * BLOCK_SIZE / FALL_FRAME : 0;
        }
        // 表示上のスケール
    scale() {
            return this.state == VANISH ? 1.1 : 1.0;
        }
        // 状態更新
    update() {
        switch (this.state) {
            case NEUTRAL:
                return;
            case EXTINCT:
                if (this.count == 50) {
                    this.setState(VANISH);
                }
                break;
            case VANISH:
                if (this.count == VANISH_FRAME + this.vanishNum * VANISH_DELAY_FRAME) {
                    this.setState(NEUTRAL);
                    this.type = -1;
                }
                break;
            case FALLING:
                if (this.count == FALL_FRAME) this.setState(MOVEDOWN);
                break;
            case SWAPPING_L:
                if (this.count == SAWP_FRAME) this.setState(SWAPPED);
                break;
            case REVITATE:
                if (this.count == 8) this.setState(CHECK_FLOOR);
                break;
        }
        this.count++;
    }
}

// メインキャンバス
const canvas = document.createElement('canvas');
Object.assign(canvas.style, {
    position: 'absolute',
    left: '0px',
    top: '28px',
    transition: 'filter 0.666s'
});
canvas.classList.add('field');
Object.assign(canvas, { width: BLOCK_SIZE * WIDTH, height: BLOCK_SIZE * HEIGHT });
const g = canvas.getContext('2d');
document.body.append(canvas);

// GAME OVERテキスト
const game_over = document.createElement('div');
Object.assign(game_over.style, {
    position: 'absolute',
    width: `${BLOCK_SIZE * WIDTH}px`,
    height: `${BLOCK_SIZE * HEIGHT}px`,
    left: '0px',
    top: '28px',
    lineHeight: `${BLOCK_SIZE * HEIGHT}px`,
    fontSize: `${BLOCK_SIZE}px`
});
game_over.classList.add('message');
game_over.innerText = 'GAME OVER';
document.body.append(game_over);

// 中央レイアウト処理
const doLayout = () => {
    const w = document.body.clientWidth;
    const h = document.body.clientHeight;
    canvas.style.left = `${(w - BLOCK_SIZE * WIDTH) * 0.5}px`;
    game_over.style.left = `${(w - BLOCK_SIZE * WIDTH) * 0.5}px`;
};
document.body.onresize = doLayout;
doLayout();

// ブロック配列を1次元で作成
let blocks = Array(NUM).fill().map(() => new Block(-1));
// 予告ブロック配列作成
let next = Array(WIDTH);
// 予告ブロックを生成
const genNext = () => {
    for (let i = 0; i < WIDTH; ++i) {
        let exclude = blocks[i + (HEIGHT - 1) * WIDTH].type;
        if (exclude != blocks[i + (HEIGHT - 2) * WIDTH].type) {
            exclude = -1;
        }
        // ポップしたときに勝手に消えてしまわないように色を抽選
        do {
            next[i] = Math.floor(Math.random() * (exclude < 0 ? 6 : 5));
            next[i] += next[i] == exclude;
        } while (i && next[i - 1] == next[i]);
    }
};
// キーイベント
let continueFunc;
let upKey = false;
let leftKey = false;
let rightKey = false;
let downKey = false;
let swapKey = false;
let raiseKey = false;
window.addEventListener('keydown', function(ev) {
    switch (ev.keyCode) {
        case 37: // left
            leftKey = true;
            ev.preventDefault();
            break;
        case 38: // up
            upKey = true;
            ev.preventDefault();
            break;
        case 39: // right
            rightKey = true;
            ev.preventDefault();
            break;
        case 40: // down
            downKey = true;
            ev.preventDefault();
            break;
        case 90: // Z
            swapKey = !ev.repeat;
            break;
        case 88: // X
            if (!ev.repeat) raiseKey = true;
            break;
    }
    if (continueFunc && (swapKey || raiseKey)) {
        continueFunc();
        continueFunc = null;
    }
});


let x; // カーソル位置
let y;
let counter;
let raiseCount;
let intervalKey;
let raiseTime;

// ゲーム初期化
const resetGame = () => {
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            if (y >= HEIGHT >> 1) {
                // 開始直後にブロックが勝手に消えないよう隣接を確認しながら初期化
                let color;
                do {
                    color = Math.floor(Math.random() * 6);
                } while ((x >= 2 && color == blocks[x - 1 + y * WIDTH].type && color == blocks[x - 2 + y * WIDTH].type) ||
                    (y >= 2 && color == blocks[x + (y - 1) * WIDTH].type && color == blocks[x + (y - 2) * WIDTH].type));
                blocks[x + y * WIDTH].type = color;
            } else {
                blocks[x + y * WIDTH].type = -1;
            }
            blocks[x + y * WIDTH].setState(NEUTRAL);
        }
    }
    genNext();

    x = WIDTH >> 1;
    y = HEIGHT >> 1;
    counter = 0;
    raiseCount = 0;
    raiseTime = 600;
    game_over.style.visibility = 'hidden';
    game_over.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
    canvas.style.filter = 'blur(0px)';
    g.filter = 'none';
    intervalKey = setInterval(updateFunc, 16);
};
// 連結判定
const judge = (x, y) => {
    const b = blocks[x + y * WIDTH];
    if (!b.isConnectable()) return 0;
    const scan = (dx, dy) => {
        let num = 0;
        let sx = x + dx;
        let sy = y + dy;
        while (sx < WIDTH && sy < HEIGHT) {
            const d = blocks[sx + sy * WIDTH];
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
            blocks[i + y * WIDTH].setState(EXTINCT);
        }
    }
    const down = scan(0, 1);
    if (down + 1 >= 3) {
        num += down + 1;
        for (let i = y; i <= y + down; ++i) {
            blocks[x + i * WIDTH].setState(EXTINCT);
        }
    }
    return num;
};

const updateFunc = () => {
    let stopRaise = false;
    // 更新
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = HEIGHT; y--;) {
            let b = blocks[x + y * WIDTH];
            b.update();
            let fallCheck = HEIGHT;
            if (b.state == MOVEDOWN) {
                b.setState(NEUTRAL);
                let d = blocks[x + (y + 1) * WIDTH];
                Object.assign(d, b);
                b.type = -1;
                fallCheck = y + 2;
            } else
            if (b.state == SWAPPED) {
                let o = blocks[x + 1 + y * WIDTH];
                b.setState(REVITATE);
                o.setState(REVITATE);
                blocks[x + 1 + y * WIDTH] = b;
                blocks[x + y * WIDTH] = b = o;
            } else
            if (b.state == CHECK_FLOOR) {
                b.setState(NEUTRAL);
                fallCheck = y + 1;
            }
            if (b.state == REVITATE) {
                let d = blocks[x + (y + 1) * WIDTH];
                if (!d || !d.isVacancy()) b.setState(NEUTRAL);
            }
            if (fallCheck < HEIGHT) {
                let d = blocks[x + (fallCheck - 1) * WIDTH];
                let u = blocks[x + fallCheck * WIDTH];
                if (u.isVacancy()) d.setState(FALLING);
            } else
            if (y > 0 && b.isVacancy()) {
                let d = blocks[x + (y - 1) * WIDTH];
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
        for (let b of blocks) {
            if (b.state == EXTINCT && b.count == 0) {
                // 左上から順に消えていくようディレイ値を設定
                b.vanishIndex = vanishIndex++;
                b.vanishNum = extinctCount;
            }
        }
        raiseTime -= extinctCount;
        stopRaise = true;
    }
    if (raiseTime < 40) raiseTime = 40;

    // 移動
    if (upKey) {
        if (y > 1) y--;
    } else
    if (downKey) {
        if (y < HEIGHT - 1) y++;
    } else
    if (rightKey) {
        if (x < WIDTH - 2) x++;
    } else
    if (leftKey) {
        if (x > 0) x--;
    }
    // 入れ替え
    if (swapKey) {
        const l = blocks[x + y * WIDTH];
        const r = blocks[x + 1 + y * WIDTH];
        let swappable = l.isSwappable() && r.isSwappable();
        if (swappable) {
            const ul = blocks[x + (y - 1) * WIDTH];
            const ur = blocks[x + 1 + (y - 1) * WIDTH];
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
        raiseCount += pump;
    }
    if (raiseCount >= raiseTime) {
        raiseCount = 0;
        let gameOver = false;
        for (let x = 0; x < WIDTH; ++x) {
            // 最上段まで埋まってしまった
            gameOver = gameOver || blocks[x + WIDTH].type >= 0;

            let b = blocks[x];
            b.type = next[x];
            b.setState(NEUTRAL);
            for (let y = HEIGHT; y--;) {
                let n = blocks[x + y * WIDTH];
                blocks[x + y * WIDTH] = b;
                b = n;
            }
        }
        genNext();
        if (y > 1) y--;
        if (gameOver) {
            raiseKey = false;
            game_over.style.visibility = 'visible';
            game_over.style.transition = 'filter 0.666s';
            game_over.style.filter = 'blur(0px)';
            canvas.style.filter = `blur(${BLOCK_SIZE / 4}px)`;
            clearInterval(intervalKey);
            continueFunc = resetGame;
        }
    }
    counter++;

    upKey = false;
    leftKey = false;
    rightKey = false;
    downKey = false;
    swapKey = false;

    // 指定座標を中心に文字列を描画
    const drawText = (str, x, y) => {
        const tm = g.measureText(str);
        g.fillText(str, x - 0.5 * tm.width, y + 0.5 * tm.actualBoundingBoxAscent);
    };
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = `${BLOCK_SIZE * 0.8}px メイリオ`;
    let raiseY = Math.floor(BLOCK_SIZE * raiseCount / raiseTime);
    // ブロック
    for (let x = 0; x < WIDTH; ++x) {
        for (let y = 0; y < HEIGHT; ++y) {
            const b = blocks[x + y * WIDTH];
            if (b.isVisible()) {
                const scale = b.scale();
                g.translate((x + 1.0 - scale) * BLOCK_SIZE + b.offsetX(), (y + 1.0 - scale) * BLOCK_SIZE + b.offsetY() - raiseY);
                g.scale(scale, scale);
                g.fillStyle = COLORS[b.type];
                g.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
                g.fillStyle = LIGHT_COLORS[b.type];
                drawText(RELIEF[b.type], 0.5 * BLOCK_SIZE, 0.5 * BLOCK_SIZE);
                g.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE / 16);
                g.fillRect(0, 0, BLOCK_SIZE / 16, BLOCK_SIZE);
                g.fillStyle = DARK_COLORS[b.type];
                g.fillRect(0, BLOCK_SIZE - BLOCK_SIZE / 16, BLOCK_SIZE, BLOCK_SIZE / 16);
                g.fillRect(BLOCK_SIZE - BLOCK_SIZE / 16, 0, BLOCK_SIZE / 16, BLOCK_SIZE);
                g.setTransform(1, 0, 0, 1, 0, 0);
            }
        }
        g.fillStyle = DARK_COLORS[next[x]];
        g.fillRect(x * BLOCK_SIZE, HEIGHT * BLOCK_SIZE - raiseY, BLOCK_SIZE, BLOCK_SIZE);
    }
    // カーソル
    g.translate((x + 0.5) * BLOCK_SIZE, (y + 0.5) * BLOCK_SIZE - raiseY);
    g.fillStyle = 'white';
    g.beginPath();
    const offset = -((Math.floor(counter / 30) & 1) + BLOCK_SIZE * 0.5);
    for (let i = 0; i < 2; ++i) {
        for (let j = 0; j < 4; ++j) {
            g.rotate(0.5 * Math.PI);
            g.rect(offset, offset, BLOCK_SIZE / 3, BLOCK_SIZE / 8);
            g.rect(offset, offset, BLOCK_SIZE / 8, BLOCK_SIZE / 3);
        }
        g.translate(BLOCK_SIZE, 0);
    }
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
};

resetGame();
import { describe, it, expect, beforeEach } from 'vitest';
import {
    gameState, resetGame, updateGame, loadRows, getSnapshot, receiveGarbage, comboAttack, chainAttack
} from '../js/game.js';
import { WIDTH, HEIGHT, BLOCK_SIZE, VERSUS_GARBAGE_DELAY } from '../js/constants.js';

const NO_INPUT = { raise: false, flatten: false, actions: [] };
const PRACTICE = { difficulty: 'practice', sound: 'off', bgm: 'off' };

// 盤面を並べて始める（せり上がりは止めておく）
function start(rows, { settings = PRACTICE, ...options } = {}) {
    resetGame(settings, options);
    loadRows(rows);
    gameState.raiseTime = 1e9;
}

// frames フレーム進め、その間の出来事を返す
function run(frames, input = NO_INPUT) {
    const events = [];
    for (let i = 0; i < frames; ++i) {
        updateGame(input);
        events.push(...gameState.events);
    }
    return events;
}

// 下から count 段の様子（'0'〜'5' が色、'.' が空き）
function bottomRows(count) {
    const cells = getSnapshot().cells;
    return Array.from({ length: count }, (_, i) => cells.slice((HEIGHT - count + i) * WIDTH, (HEIGHT - count + i + 1) * WIDTH));
}

const cellCenter = (x, y) => ({ px: (x + 0.5) * BLOCK_SIZE, py: (y + 0.5) * BLOCK_SIZE });

// (x, y) のパネルをつかんで、toX の列まで運ぶ
function drag(x, y, toX, frames = 30) {
    updateGame({ ...NO_INPUT, actions: [{ type: 'touch', ...cellCenter(x, y) }, { type: 'drag', ...cellCenter(toX, y) }] });
    const events = [...gameState.events, ...run(frames)];
    updateGame({ ...NO_INPUT, actions: [{ type: 'release' }] });
    return events;
}

describe('ゲームの進行', () => {
    beforeEach(() => resetGame(PRACTICE));

    it('開始時は下半分が埋まっていて、そろっているところはない', () => {
        resetGame(PRACTICE);
        gameState.raiseTime = 1e9;
        const cells = getSnapshot().cells;
        expect(cells.slice(0, WIDTH * HEIGHT / 2)).toBe('.'.repeat(WIDTH * HEIGHT / 2));
        expect(cells.slice(WIDTH * HEIGHT / 2)).not.toContain('.');
        expect(run(5).filter(e => e.type === 'pop')).toEqual([]);
        expect(gameState.clears).toEqual([]);
    });

    it('横に3つそろうと、光ってから左から順に弾けて消える', () => {
        start(['000123']);
        run(10);
        expect(bottomRows(1)).toEqual(['000123']); // 光っている間は残っている
        const events = run(200);
        expect(events.filter(e => e.type === 'pop').map(e => e.index)).toEqual([0, 1, 2]);
        expect(bottomRows(1)).toEqual(['...123']);
    });

    it('縦に3つそろっても消える', () => {
        start(['0.....', '0.....', '012...']);
        run(200);
        expect(bottomRows(3)).toEqual(['......', '......', '.12...']);
    });

    it('4つ以上を同時に消すと同時消しになる', () => {
        start(['0.....', '0.....', '00012.']);
        const events = run(200);
        expect(events.filter(e => e.type === 'combo').map(e => e.value)).toEqual([5]);
        expect(bottomRows(1)).toEqual(['...12.']);
    });

    it('消えたあとに落ちてきたパネルでそろうと連鎖になり、終わると1に戻る', () => {
        start(['1.....', '0.....', '0.....', '011...']);
        const events = run(400);
        expect(events.filter(e => e.type === 'chain').map(e => e.value)).toEqual([2]);
        expect(gameState.maxChain).toBe(2);
        expect(gameState.chain).toBe(1);
        expect(bottomRows(4)).toEqual(['......', '......', '......', '......']);
    });

    it('ドラッグでパネルを隣と入れ替える', () => {
        start(['01....']);
        const events = drag(0, HEIGHT - 1, 1);
        expect(events.some(e => e.type === 'swap')).toBe(true);
        expect(bottomRows(1)).toEqual(['10....']);
    });

    it('ドラッグで何マスも運べる', () => {
        start(['0123..']);
        drag(0, HEIGHT - 1, 3, 60);
        expect(bottomRows(1)).toEqual(['1230..']);
    });

    it('空中へ動かしたパネルは少し浮いてから落ちる', () => {
        start(['0.....', '1.....']);
        updateGame({ ...NO_INPUT, actions: [{ type: 'touch', ...cellCenter(0, HEIGHT - 2) }, { type: 'drag', ...cellCenter(1, HEIGHT - 2) }] });
        run(6);
        expect(bottomRows(2)).toEqual(['.0....', '1.....']); // まだ浮いている
        run(30);
        expect(bottomRows(2)).toEqual(['......', '10....']);
    });

    it('落ちているパネルは、埋まったマスに重ならずに着地する', () => {
        for (const rows of [['0.....', '......', '......', '1.....'], ['0.....', '2.....', '......', '......', '1.....']]) {
            start(rows);
            for (let i = 0; i < 80; ++i) {
                updateGame(NO_INPUT);
                gameState.grid.forEach((row, y) => row.forEach((item, x) => {
                    if (item?.phase !== 'fall' || item.t === 0) return;
                    const below = gameState.grid[y + 1]?.[x];
                    expect(below === null || below?.phase === 'fall').toBe(true);
                }));
            }
            expect(bottomRows(rows.length - 2).at(-1)).toBe('1.....');
        }
    });

    it('お邪魔ブロックは入れ替えられない', () => {
        start(['......', '012012'], { mode: 'versus', seed: 1 });
        receiveGarbage([{ width: 6, height: 1 }]);
        run(VERSUS_GARBAGE_DELAY + 120);
        expect(getSnapshot().garbages).toEqual([[0, HEIGHT - 2, 6, 1, 0]]);
        const events = drag(0, HEIGHT - 2, 1);
        expect(events.some(e => e.type === 'swap')).toBe(false);
    });

    it('送られてきたお邪魔ブロックは、接したパネルが消えるとパネルに変わる', () => {
        start(['......', '0010..'], { mode: 'versus', seed: 1 });
        receiveGarbage([{ width: 6, height: 2 }]);
        const landed = run(VERSUS_GARBAGE_DELAY + 200);
        expect(landed.some(e => e.type === 'land')).toBe(true);
        expect(getSnapshot().garbages).toEqual([[0, HEIGHT - 3, 6, 2, 0]]);

        drag(2, HEIGHT - 1, 3, 10); // 0001 にして、お邪魔ブロックの下で3つそろえる
        expect(getSnapshot().garbages[0][4]).toBe(1); // 消去中
        run(400);
        // 下の段がパネルに変わって空きに落ちる（変わったパネルがそろえば、残りの段も続けて消える）
        const rows = getSnapshot().garbages.reduce((sum, g) => sum + g[3], 0);
        expect(rows).toBeLessThanOrEqual(1);
        expect(bottomRows(1)[0]).not.toContain('.');
    });

    it('同時消し・連鎖で送るお邪魔ブロックの大きさ', () => {
        expect(comboAttack(3)).toEqual([]);
        expect(comboAttack(4)).toEqual([{ width: 3, height: 1 }]);
        expect(comboAttack(13)).toEqual([{ width: 6, height: 1 }, { width: 6, height: 1 }]);
        expect(chainAttack(1)).toEqual([]);
        expect(chainAttack(3)).toEqual([{ width: 6, height: 2 }]);
    });

    it('送られてきたお邪魔ブロックは、自分の攻撃で打ち消せる', () => {
        start(['00001.'], { mode: 'versus', seed: 1 });
        receiveGarbage([{ width: 3, height: 1 }]);
        const events = run(10);
        expect(events.filter(e => e.type === 'combo').map(e => e.value)).toEqual([4]);
        expect(events.some(e => e.type === 'attack')).toBe(false); // 4個消しの3マスで相殺しきる
        expect(gameState.incoming).toEqual([]);
    });

    it('打ち消しきれなかった分は相手に送る', () => {
        start(['0.....', '0.....', '00012.'], { mode: 'versus', seed: 1 });
        receiveGarbage([{ width: 2, height: 1 }]);
        const attacks = run(10).filter(e => e.type === 'attack');
        expect(attacks.map(e => e.pieces)).toEqual([[{ width: 2, height: 1 }]]);
    });

    it('せり上がると予告の段が一番下に入る', () => {
        start(['012340']);
        const next = getSnapshot().next;
        gameState.raiseTime = 5;
        run(5);
        expect(bottomRows(2)).toEqual(['012340', next]);
        expect(getSnapshot().next).not.toBeUndefined();
    });

    it('長押しのせり上げは、難易度によらず同じ速さ', () => {
        const framesPerRow = (difficulty) => {
            resetGame({ ...PRACTICE, difficulty });
            loadRows(['012340']);
            const before = getSnapshot().next;
            let frames = 0;
            while (bottomRows(2)[1] !== before && frames < 1000) {
                updateGame({ ...NO_INPUT, raise: true });
                frames++;
            }
            return frames;
        };
        expect(framesPerRow('practice')).toBe(18);
        expect(framesPerRow('normal')).toBe(18);
        expect(framesPerRow('hard')).toBe(18);
    });

    it('上まで積み上がった状態でせり上がるとゲームオーバー', () => {
        const rows = Array.from({ length: HEIGHT - 1 }, (_, i) => (i % 2 ? '120120' : '012012'));
        start(rows);
        gameState.raiseTime = 3;
        let over = false;
        for (let i = 0; i < 10 && !over; ++i) over = updateGame(NO_INPUT);
        expect(over).toBe(true);
    });

    it('平滑化すると、高い列の上のパネルが隣の低い列へずれる', () => {
        start(['0.....', '1.....', '2.....', '3.....', '4.....']);
        const events = run(1, { ...NO_INPUT, flatten: true });
        expect(events.some(e => e.type === 'swap')).toBe(true);
        expect(gameState.shakeFrame).toBeGreaterThan(0);
        const landed = run(30);
        expect(landed.some(e => e.type === 'land')).toBe(true);
        expect(bottomRows(5)).toEqual(['......', '......', '.0....', '31....', '42....']);
    });

    it('対戦では、同じシードなら同じ盤面と予告で始まる', () => {
        resetGame(PRACTICE, { mode: 'versus', seed: 42 });
        const a = getSnapshot();
        resetGame(PRACTICE, { mode: 'versus', seed: 42 });
        expect(getSnapshot()).toEqual(a);
        resetGame(PRACTICE, { mode: 'versus', seed: 43 });
        expect(getSnapshot().cells).not.toBe(a.cells);
    });

    it('むずかしいでは6色、それ以外では5色を使う', () => {
        const colors = (difficulty) => {
            const seen = new Set();
            for (let seed = 0; seed < 20; ++seed) {
                resetGame({ ...PRACTICE, difficulty }, { mode: 'versus', seed });
                for (const c of getSnapshot().cells + getSnapshot().next) if (c !== '.') seen.add(c);
            }
            return [...seen].sort().join('');
        };
        expect(colors('normal')).toBe('01234');
        expect(colors('hard')).toBe('012345');
    });
});

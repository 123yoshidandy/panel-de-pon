import { describe, it, expect } from 'vitest';
import { gameState, resetGame, updateGame, loadRows, getSnapshot } from '../js/game.js';
// gameState は withGame で切り替わる（ここでは切り替えないので、いつも同じ状態を指す）
import { createCpu } from '../js/cpu.js';
import { createCpuMatch } from '../js/cpu-match.js';
import { playMatch } from '../scripts/cpu-matches.mjs';
import { WIDTH, HEIGHT } from '../js/constants.js';

const PRACTICE = { difficulty: 'practice', sound: 'off', bgm: 'off' };
const bottomRow = () => getSnapshot().cells.slice((HEIGHT - 1) * WIDTH);

// CPU に frames フレーム打たせ、送った操作を返す（events に、その間の出来事を入れる）
function runCpu(cpu, frames, events = []) {
    const actions = [];
    for (let i = 0; i < frames; ++i) {
        const input = cpu.step(gameState);
        actions.push(...input.actions);
        updateGame(input);
        events.push(...gameState.events);
    }
    return actions;
}

describe('CPU', () => {
    it('入れ替えで消せる手を見つけ、人と同じ操作（つかむ・ドラッグ・離す）で消す', () => {
        resetGame(PRACTICE);
        loadRows(['001034']);
        gameState.raiseTime = 1e9;
        const events = [];
        const actions = runCpu(createCpu({ seed: 1, level: 'hard' }), 200, events);
        expect(actions.slice(0, 3).map(action => action.type)).toEqual(['touch', 'drag', 'release']);
        expect(events.filter(event => event.type === 'pop')).toHaveLength(3);
    });

    it('消せる手がなく盤面が低いと、せり上げる（ハード）', () => {
        resetGame(PRACTICE);
        loadRows(['012012']);
        gameState.raiseTime = 600;
        runCpu(createCpu({ seed: 1, level: 'hard' }), 200);
        expect(bottomRow()).not.toBe('012012');
    });

    it('人が操作できる速さで打つ（ノーマルで1秒に1手まで）', () => {
        resetGame({ ...PRACTICE, difficulty: 'normal' }, { mode: 'versus', seed: 7 });
        const touches = runCpu(createCpu({ seed: 7, level: 'normal' }), 60 * 60).filter(action => action.type === 'touch');
        expect(touches.length).toBeGreaterThan(10);
        expect(touches.length).toBeLessThanOrEqual(60);
    });

    it('同じシードなら、同じ試合になる', () => {
        const a = playMatch({ seed: 42, difficulty: 'hard' });
        const b = playMatch({ seed: 42, difficulty: 'hard' });
        expect(a.timeout).toBeUndefined();
        expect(b).toEqual(a);
    });

    it('CPU 同士の試合は、どのシードでも決着する', () => {
        for (const difficulty of ['normal', 'hard']) {
            for (let seed = 1; seed <= 8; ++seed) {
                expect(playMatch({ seed, difficulty }).loser).not.toBeNull();
            }
        }
    });
});

describe('CPU 対戦の進行', () => {
    it('自分と CPU は同じ盤面で始まり、自分の同時消しが CPU への予告に届く', () => {
        const match = createCpuMatch({ settings: PRACTICE, seed: 3 });
        const colors = (state) => state.grid.map(row => row.map(item => item?.color ?? null));
        expect(colors(match.player)).toEqual(colors(match.cpu));
        expect(match.cpuSnapshot().cells).toHaveLength(WIDTH * HEIGHT);

        // 自分の盤面の一番下の段に、同じ色を4つ並べる（同時消しで、幅3のお邪魔ブロックを送る）
        // 色は、上の段と右隣にないものにする（ほかと一緒に消えて、数が変わらないように）
        const bottom = match.player.grid[HEIGHT - 1];
        const nearby = [...match.player.grid[HEIGHT - 2].slice(0, 4), bottom[4]].map(panel => panel.color);
        const color = [0, 1, 2, 3, 4].find(c => !nearby.includes(c));
        for (let x = 0; x < 4; ++x) bottom[x].color = color;
        match.step({ raise: false, flatten: false, actions: [] });
        expect(match.cpu.incoming).toEqual([{ width: 3, height: 1, wait: 0 }]);
    });
});

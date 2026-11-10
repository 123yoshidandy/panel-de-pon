/**
 * CPU 同士の試合を多数回まわして、試合が終わること（固まらない）と、試合時間・勝率・連鎖を集計する
 * 使い方: node scripts/cpu-matches.mjs [試合数] [難易度] [自分の側の CPU の強さ]
 *   例: node scripts/cpu-matches.mjs 200 normal normal
 * 時間切れ（MAX_FRAMES まで決着しない）の試合があれば、終了コード1にする
 */

import { createCpuMatch } from '../js/cpu-match.js';
import { FRAME_MS } from '../js/constants.js';

const MAX_FRAMES = 60 * 60 * 30; // 約29分（1フレーム16ms）。練習同士は、両方がしのぎ続けて10分を超えることがある

export function playMatch({ seed, difficulty = 'normal', playerLevel = difficulty }) {
    const match = createCpuMatch({ settings: { difficulty, sound: 'off', bgm: 'off' }, seed, playerLevel });
    for (let frame = 1; frame <= MAX_FRAMES; ++frame) {
        const loser = match.step();
        if (loser) {
            return {
                seed, frames: frame, loser,
                maxChain: [match.player.maxChain, match.cpu.maxChain]
            };
        }
    }
    return { seed, frames: MAX_FRAMES, loser: null, timeout: true, maxChain: [match.player.maxChain, match.cpu.maxChain] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const count = Number(process.argv[2] ?? 100);
    const difficulty = process.argv[3] ?? 'normal';
    const playerLevel = process.argv[4] ?? difficulty;
    const results = [];
    for (let i = 0; i < count; ++i) results.push(playMatch({ seed: 1000 + i, difficulty, playerLevel }));

    const seconds = results.map(r => r.frames * FRAME_MS / 1000).sort((a, b) => a - b);
    const pick = (q) => seconds[Math.min(seconds.length - 1, Math.floor(q * seconds.length))].toFixed(0);
    const timeouts = results.filter(r => r.timeout);
    const cpuLoses = results.filter(r => r.loser === 'cpu').length;
    const chains = results.flatMap(r => r.maxChain);
    console.log(`難易度 ${difficulty}（相手の CPU）・自分の側 ${playerLevel}: ${count} 試合`);
    console.log(`試合時間（秒）: 最短 ${pick(0)} / 中央 ${pick(0.5)} / 90% ${pick(0.9)} / 最長 ${pick(1)}`);
    console.log(`自分の側の勝ち ${cpuLoses} / 相手の勝ち ${results.filter(r => r.loser === 'player').length} / 同時 ${results.filter(r => r.loser === 'both').length}`);
    console.log(`最大連鎖: 平均 ${(chains.reduce((a, b) => a + b, 0) / chains.length).toFixed(2)} / 最大 ${Math.max(...chains)}`);
    if (timeouts.length) {
        console.log(`時間切れ ${timeouts.length} 試合: シード ${timeouts.map(r => r.seed).join(', ')}`);
        process.exit(1);
    }
}

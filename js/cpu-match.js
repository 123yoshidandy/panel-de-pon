/**
 * CPU 対戦の進行（DOM に依存しない）
 * 自分と CPU の2つの盤面を、オンライン対戦と同じ形（mode: 'versus'、同じシード）で作り、
 * 1フレームずつ進めて、連鎖・同時消しの攻撃を相手に届ける
 */

import { createGameState, withGame, resetGame, updateGame, receiveGarbage, getSnapshot } from './game.js';
import { getChoice } from './settings.js';
import { createCpu } from './cpu.js';

const AUTO_PLAYER_SALT = 0x51ed2701; // 自分の側も CPU に打たせるとき（テスト・集計用）に、シードに混ぜる値

const attacksOf = (state) => state.events.filter(event => event.type === 'attack').flatMap(event => event.pieces);

// settings: 難易度など（CPU の強さは難易度で決まる）、seed: 盤面の並び（両方同じ）と CPU の判断の元
// playerLevel を渡すと、自分の側も CPU が打つ（step に入力を渡さない）
export function createCpuMatch({ settings, seed, playerLevel = null }) {
    const player = createGameState();
    const cpu = createGameState();
    for (const state of [player, cpu]) withGame(state, () => resetGame(settings, { mode: 'versus', seed }));
    const opponent = createCpu({ seed, level: getChoice(settings, 'difficulty').cpu });
    const autoPlayer = playerLevel ? createCpu({ seed: (seed ^ AUTO_PLAYER_SALT) >>> 0, level: playerLevel }) : null;

    return {
        player,
        cpu,
        // 1フレーム進める。負けた側を返す（'player' | 'cpu' | 'both'（同じフレーム）| null）
        step(playerInput = autoPlayer.step(player)) {
            const cpuOver = withGame(cpu, () => updateGame(opponent.step(cpu)));
            const playerOver = withGame(player, () => updateGame(playerInput));
            const toCpu = attacksOf(player);
            const toPlayer = attacksOf(cpu);
            if (toCpu.length) withGame(cpu, () => receiveGarbage(toCpu));
            if (toPlayer.length) withGame(player, () => receiveGarbage(toPlayer));
            if (playerOver && cpuOver) return 'both';
            return playerOver ? 'player' : cpuOver ? 'cpu' : null;
        },
        // CPU の盤面の様子（オンライン対戦の相手と同じ形で、小さく描く）
        cpuSnapshot: () => withGame(cpu, getSnapshot)
    };
}

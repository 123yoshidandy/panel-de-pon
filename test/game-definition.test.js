import { describe, it, expect } from 'vitest';
import { createTestServer } from '../server/netplay/testing.js';
import game from '../server/src/game-definition.js';

// 2人で部屋に入り、部屋を作った人が対戦を始める
async function startMatch() {
    const server = createTestServer(game);
    const [a, b] = await server.createRoom(['ありす', 'ぼぶ']);
    await a.send('start');
    const matchId = a.last('state').matchId;
    return { server, a, b, matchId };
}

describe('オンライン対戦のゲームの定義', () => {
    it('1人では開始できない', async () => {
        const server = createTestServer(game);
        const [a] = await server.createRoom(['ありす']);
        await a.send('start');
        expect(a.last('error')).toBeTruthy();
        expect(a.last('state')).toBeUndefined();
    });

    it('3人目は満員で入れない', async () => {
        const server = createTestServer(game);
        const [, , c] = await server.createRoom(['ありす', 'ぼぶ', 'しー']);
        expect(c.last('error').code).toBe('room_full');
    });

    it('相手の接続が切れていると開始できない', async () => {
        const server = createTestServer(game);
        const [a, b] = await server.createRoom(['ありす', 'ぼぶ']);
        await b.disconnect();
        await a.send('start');
        expect(a.last('error').message).toBe('2人そろってから開始してください');
    });

    it('開始すると2人に同じシードが届く', async () => {
        const { a, b } = await startMatch();
        const viewA = a.last('state').view;
        const viewB = b.last('state').view;
        expect(viewA.seed).toBe(viewB.seed);
        expect(viewA.loser).toBeNull();
        expect(viewA.wins).toEqual([0, 0]);
        expect(a.last('lobby').status).toBe('playing');
    });

    it('攻撃・フィールドの様子は相手にだけ中継し、部屋は保存しない', async () => {
        const { server, a, b, matchId } = await startMatch();
        a.clear();
        const writes = server.store.writes;
        await a.send('relay', { matchId, kind: 'attack', data: [{ width: 3, height: 1 }] });
        await a.send('relay', { matchId, kind: 'snapshot', data: { cells: '..' } });
        expect(b.all('relay').map(m => [m.kind, m.from])).toEqual([['attack', 0], ['snapshot', 0]]);
        expect(b.last('relay').data).toEqual({ cells: '..' });
        expect(a.all('relay')).toEqual([]);
        expect(server.store.writes).toBe(writes);
    });

    it('知らない種類・大きすぎるデータ・前の対戦の中継は、エラーを返さずに捨てる', async () => {
        const { a, b, matchId } = await startMatch();
        b.clear();
        a.clear();
        await a.send('relay', { matchId, kind: 'chat', data: 'やあ' });
        await a.send('relay', { matchId, kind: 'snapshot', data: 'x'.repeat(5000) });
        await a.send('relay', { matchId: matchId - 1, kind: 'attack', data: [] });
        expect(b.all('relay')).toEqual([]);
        expect(a.all('error')).toEqual([]);
    });

    it('負けを伝えると相手の勝ちになり、対戦が終わる', async () => {
        const { a, b, matchId } = await startMatch();
        await b.send('lose', { matchId });
        expect(a.last('lobby').status).toBe('ended');
        expect(a.last('state').view).toMatchObject({ loser: 1, wins: [1, 0] });
        expect(b.last('state').view).toMatchObject({ loser: 1, wins: [1, 0] });
    });

    it('2人がほぼ同時に負けを伝えても、勝ち数は1つだけ増える', async () => {
        const { a, b, matchId } = await startMatch();
        await Promise.all([a.send('lose', { matchId }), b.send('lose', { matchId })]);
        const wins = a.last('state').view.wins;
        expect(wins[0] + wins[1]).toBe(1);
    });

    it('対戦が終わったあとに届いた中継は捨てる', async () => {
        const { a, b, matchId } = await startMatch();
        await b.send('lose', { matchId });
        a.clear();
        b.clear();
        await b.send('relay', { matchId, kind: 'snapshot', data: {} });
        expect(a.all('relay')).toEqual([]);
        expect(b.all('error')).toEqual([]);
    });

    it('2人とも「もう1回」を押すと、勝ち数を引き継いで次の対戦が始まる', async () => {
        const { a, b, matchId } = await startMatch();
        await a.send('lose', { matchId });
        await a.send('ready');
        expect(b.last('lobby').players[0].ready).toBe(true);
        expect(a.last('state').matchId).toBe(matchId);
        await b.send('ready');
        const next = a.last('state');
        expect(next.matchId).toBe(matchId + 1);
        expect(next.view).toMatchObject({ loser: null, wins: [0, 1] });
        expect(b.last('state').view.seed).toBe(next.view.seed);
    });

    it('部屋に戻ってから始めても、勝ち数は参加者ごとに残る', async () => {
        const { a, b, matchId } = await startMatch();
        await b.send('lose', { matchId });
        await b.send('backToLobby');
        expect(a.last('lobby').status).toBe('lobby');
        await a.send('start');
        expect(b.last('state').view.wins).toEqual([1, 0]);
    });

    it('対戦をやめると勝ち負けなしで終わる', async () => {
        const { a, b, matchId } = await startMatch();
        await b.send('abort', { matchId });
        expect(a.last('lobby').status).toBe('ended');
        expect(a.last('state').view).toMatchObject({ loser: null, wins: [0, 0] });
    });

    it('対戦中に部屋を出ると相手の勝ち', async () => {
        const { a, b } = await startMatch();
        await b.send('leave');
        expect(a.last('lobby').status).toBe('ended');
        expect(a.last('lobby').players[1].left).toBe(true);
        expect(a.last('state').view).toMatchObject({ loser: 1, wins: [1, 0] });
    });

    it('対戦中に切断しても勝負は続き、同じ席に戻れる', async () => {
        const { server, a, b, matchId } = await startMatch();
        await b.disconnect();
        expect(a.last('lobby').status).toBe('playing');
        expect(a.last('lobby').players[1].connected).toBe(false);
        const b2 = await server.reconnect(b);
        expect(b2.last('joined').seat).toBe(1);
        expect(b2.last('state')).toMatchObject({ matchId, view: { loser: null } });
        await b2.send('relay', { matchId, kind: 'attack', data: [] });
        expect(a.last('relay').from).toBe(1);
    });
});

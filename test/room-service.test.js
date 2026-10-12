import { describe, it, expect, beforeEach } from 'vitest';
import { RoomService } from '../server/src/room-service.js';
import { MemoryStore } from '../server/src/memory-store.js';

// 送ったメッセージを接続ごとに記録するテスト用の部屋サービス
function createService() {
    const sent = new Map();
    let tokenCount = 0;
    let seed = 1;
    const service = new RoomService({
        store: new MemoryStore(),
        send: async (connectionId, message) => {
            if (!sent.has(connectionId)) sent.set(connectionId, []);
            sent.get(connectionId).push(message);
        },
        createToken: () => `token-${++tokenCount}`,
        random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    });
    const inbox = (id) => sent.get(id) ?? [];
    const last = (id, type) => inbox(id).filter(m => m.type === type).at(-1);
    const clear = () => sent.clear();
    return { service, inbox, last, clear };
}

describe('RoomService', () => {
    let s;
    let code;

    beforeEach(async () => {
        s = createService();
        await s.service.handle('a', { action: 'create', name: 'ありす' });
        code = s.last('a', 'joined').roomCode;
    });

    const joinB = () => s.service.handle('b', { action: 'join', roomCode: code, name: 'ぼぶ' });
    const start = async () => {
        await joinB();
        await s.service.handle('a', { action: 'start' });
        return s.last('a', 'start').matchId;
    };

    it('部屋を作ると5桁の部屋番号と席0が返る', () => {
        expect(code).toMatch(/^\d{5}$/);
        expect(s.last('a', 'joined').seat).toBe(0);
        expect(s.last('a', 'lobby').players).toEqual([{ seat: 0, name: 'ありす', wins: 0, connected: true }]);
    });

    it('2人目は参加でき、3人目は満員で断られる', async () => {
        await joinB();
        expect(s.last('b', 'joined').seat).toBe(1);
        expect(s.last('a', 'lobby').players.map(p => p.name)).toEqual(['ありす', 'ぼぶ']);
        await s.service.handle('c', { action: 'join', roomCode: code, name: 'しー' });
        expect(s.last('c', 'error').message).toBe('この部屋は満員です');
    });

    it('存在しない部屋には入れない', async () => {
        await s.service.handle('c', { action: 'join', roomCode: '00000', name: 'しー' });
        expect(s.last('c', 'error').message).toBe('部屋が見つかりません');
    });

    it('2人そろう前と、部屋を作った人以外は開始できない', async () => {
        await s.service.handle('a', { action: 'start' });
        expect(s.last('a', 'error').message).toBe('2人そろってから開始してください');
        await joinB();
        await s.service.handle('b', { action: 'start' });
        expect(s.last('b', 'error').message).toBe('部屋を作った人だけが開始できます');
    });

    it('開始すると2人に同じ対戦番号とシードが届く', async () => {
        const matchId = await start();
        const a = s.last('a', 'start');
        const b = s.last('b', 'start');
        expect(matchId).toBe(1);
        expect(b).toEqual(a);
        expect(Number.isInteger(a.seed)).toBe(true);
        expect(s.last('a', 'lobby').status).toBe('playing');
    });

    it('中継は相手にだけ届き、古い対戦や不正な種類は捨てられる', async () => {
        const matchId = await start();
        s.clear();
        await s.service.handle('a', { action: 'relay', kind: 'attack', matchId, data: [{ width: 3, height: 1 }] });
        expect(s.inbox('b')).toEqual([{ type: 'relay', kind: 'attack', matchId, data: [{ width: 3, height: 1 }] }]);
        expect(s.inbox('a')).toEqual([]);

        s.clear();
        await s.service.handle('a', { action: 'relay', kind: 'attack', matchId: matchId - 1, data: [] });
        await s.service.handle('a', { action: 'relay', kind: 'cheat', matchId, data: [] });
        await s.service.handle('a', { action: 'relay', kind: 'snapshot', matchId, data: 'x'.repeat(5000) });
        expect(s.inbox('b')).toEqual([]);
    });

    it('対戦中でなければ中継しない', async () => {
        await joinB();
        s.clear();
        await s.service.handle('a', { action: 'relay', kind: 'attack', matchId: 0, data: [] });
        expect(s.inbox('b')).toEqual([]);
    });

    it('負けを伝えると相手の勝ち数が増えて部屋に戻る。同じ対戦の2回目は無視する', async () => {
        const matchId = await start();
        await s.service.handle('b', { action: 'lose', matchId });
        expect(s.last('a', 'result')).toEqual({ type: 'result', matchId, winner: 0 });
        expect(s.last('b', 'result')).toEqual({ type: 'result', matchId, winner: 0 });
        const lobby = s.last('a', 'lobby');
        expect(lobby.status).toBe('lobby');
        expect(lobby.players.map(p => p.wins)).toEqual([1, 0]);

        s.clear();
        await s.service.handle('a', { action: 'lose', matchId });
        expect(s.inbox('a')).toEqual([]);
    });

    it('もう一度開始すると対戦番号が増える', async () => {
        const first = await start();
        await s.service.handle('a', { action: 'lose', matchId: first });
        await s.service.handle('a', { action: 'start' });
        expect(s.last('b', 'start').matchId).toBe(first + 1);
    });

    it('切断すると切断中になり、トークンで同じ席に戻れる', async () => {
        await joinB();
        const token = s.last('b', 'joined').token;
        await s.service.disconnect('b');
        expect(s.last('a', 'lobby').players[1].connected).toBe(false);

        await s.service.handle('b2', { action: 'join', roomCode: code, token });
        expect(s.last('b2', 'joined').seat).toBe(1);
        expect(s.last('a', 'lobby').players[1]).toMatchObject({ name: 'ぼぶ', connected: true });
    });

    it('対戦中でもトークンがあれば戻れるが、新しい人は入れない', async () => {
        await start();
        const token = s.last('b', 'joined').token;
        await s.service.disconnect('b');
        await s.service.handle('c', { action: 'join', roomCode: code, name: 'しー' });
        expect(s.last('c', 'error').message).toBe('この部屋は対戦中です');
        await s.service.handle('b2', { action: 'join', roomCode: code, token });
        expect(s.last('b2', 'joined').seat).toBe(1);
    });

    it('対戦中に部屋を出ると相手の勝ちになり、残った人が部屋を作った人になる', async () => {
        const matchId = await start();
        s.clear();
        await s.service.handle('a', { action: 'leave' });
        expect(s.last('b', 'result')).toEqual({ type: 'result', matchId, winner: 1 });
        expect(s.last('b', 'joined').seat).toBe(0);
        expect(s.last('b', 'lobby').players).toEqual([{ seat: 0, name: 'ぼぶ', wins: 1, connected: true }]);
        expect(s.inbox('a')).toEqual([]);

        // 残った人は新しい席番号で操作できる
        await s.service.handle('c', { action: 'join', roomCode: code, name: 'しー' });
        await s.service.handle('b', { action: 'start' });
        expect(s.last('c', 'start').matchId).toBe(matchId + 1);
    });

    it('対戦の中止では勝ち負けがつかない', async () => {
        const matchId = await start();
        await s.service.handle('b', { action: 'abort' });
        expect(s.last('a', 'result')).toEqual({ type: 'result', matchId, winner: null });
        expect(s.last('a', 'lobby').players.map(p => p.wins)).toEqual([0, 0]);
    });

    it('部屋に入っていない接続の操作はエラーになる', async () => {
        await s.service.handle('x', { action: 'start' });
        expect(s.last('x', 'error').message).toBe('部屋に入っていません');
    });
});

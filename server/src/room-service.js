/**
 * オンライン対戦の部屋の処理（2人対戦）
 * 保存先（store）と送信（send）は外から渡すので、AWS でも手元のテスト用サーバーでも同じ処理を使える
 *
 * ゲームはそれぞれの端末で進め、サーバーは部屋の管理と、相手へのメッセージ（攻撃・フィールドの様子）の中継だけを行う
 */

export const MAX_PLAYERS = 2;
const ROOM_TTL_SECONDS = 2 * 24 * 60 * 60; // 部屋は最後の操作から2日で消える
const CODE_ALPHABET = '0123456789';        // 部屋番号は数字だけ（スマホの数字キーボードで入れやすい）
const CODE_LENGTH = 5;
const MAX_NAME_LENGTH = 12;
const MAX_RETRIES = 3;                     // 同時に操作されて保存がぶつかったときのやり直し回数
const RELAY_KINDS = ['attack', 'snapshot'];
const MAX_RELAY_LENGTH = 4096;             // 中継するデータの大きさの上限（JSON の文字数）

// 保存がぶつかったとき（他の操作が先に保存した）に store が投げるエラー
export class ConflictError extends Error {}

// 利用者に伝えるエラー（メッセージをそのまま画面に出す）
class UserError extends Error {}

export class RoomService {
    // store: getRoom(code) / putRoom(room, previousVersion) / getConnection(id) / putConnection(connection) / deleteConnection(id)
    // send: (connectionId, message) => Promise（接続が切れていれば失敗してよい）
    constructor({ store, send, createToken = () => crypto.randomUUID(), now = () => Date.now(), random = Math.random }) {
        this.store = store;
        this.sendRaw = send;
        this.createToken = createToken;
        this.now = now;
        this.random = random;
    }

    // ===== 入口 =====

    // 端末からのメッセージを処理する。保存がぶつかったら読み直してやり直す
    async handle(connectionId, message) {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const outbox = await this.route(connectionId, message ?? {});
                await this.flush(outbox);
                return;
            } catch (error) {
                if (error instanceof ConflictError) continue;
                if (error instanceof UserError) {
                    await this.send(connectionId, { type: 'error', message: error.message });
                    return;
                }
                throw error;
            }
        }
        await this.send(connectionId, { type: 'error', message: '混み合っています。もう一度操作してください' });
    }

    // 接続が切れたら、部屋の参加者を「切断中」にする（席はそのまま残し、再接続できるようにする）
    async disconnect(connectionId) {
        const connection = await this.store.getConnection(connectionId);
        await this.store.deleteConnection(connectionId);
        if (!connection) return;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const room = await this.store.getRoom(connection.roomCode);
            const player = room?.players[connection.seat];
            if (!player || player.connectionId !== connectionId) return;
            player.connectionId = null;
            try {
                await this.saveRoom(room);
                await this.flush(this.lobbyMessages(room));
                return;
            } catch (error) {
                if (!(error instanceof ConflictError)) throw error;
            }
        }
    }

    async route(connectionId, message) {
        switch (message.action) {
            case 'create': return this.createRoom(connectionId, message);
            case 'join': return this.joinRoom(connectionId, message);
        }

        // ここから先は部屋に入っている端末だけ
        const { room, seat } = await this.loadMember(connectionId);
        switch (message.action) {
            case 'relay': return this.relay(room, seat, message);
            case 'start': return this.startMatch(room, seat);
            case 'lose': return this.lose(room, seat, message);
            case 'abort': return this.abort(room);
            case 'leave': return this.leave(room, seat, connectionId);
            default: throw new UserError('不明な操作です');
        }
    }

    // ===== 部屋に入る =====

    async createRoom(connectionId, { name }) {
        const room = {
            code: null,
            version: 0,
            status: 'lobby', // 'lobby'（対戦の前後） | 'playing'（対戦中）
            matchId: 0,      // 対戦ごとに増える番号（前の対戦のメッセージが混ざらないように）
            seed: null,
            players: [this.newPlayer(name, connectionId)]
        };

        // 部屋番号が既存の部屋とぶつかったら作り直す
        for (let attempt = 0; ; attempt++) {
            room.code = this.createRoomCode();
            try {
                await this.saveRoom(room);
                break;
            } catch (error) {
                if (!(error instanceof ConflictError) || attempt >= 5) throw error;
            }
        }
        await this.store.putConnection({ connectionId, roomCode: room.code, seat: 0, expiresAt: this.expiresAt() });
        return [this.joinedMessage(room, 0), ...this.lobbyMessages(room)];
    }

    // 部屋に参加する。token が参加者のものなら、その席に再接続する
    async joinRoom(connectionId, { roomCode, name, token }) {
        const room = await this.store.getRoom(String(roomCode ?? '').trim());
        if (!room) throw new UserError('部屋が見つかりません');

        let seat = token ? room.players.findIndex(player => player.token === token) : -1;
        if (seat >= 0) {
            room.players[seat].connectionId = connectionId;
        } else {
            if (room.status !== 'lobby') throw new UserError('この部屋は対戦中です');
            if (room.players.length >= MAX_PLAYERS) throw new UserError('この部屋は満員です');
            room.players.push(this.newPlayer(name, connectionId));
            seat = room.players.length - 1;
        }

        await this.saveRoom(room);
        await this.store.putConnection({ connectionId, roomCode: room.code, seat, expiresAt: this.expiresAt() });
        return [this.joinedMessage(room, seat), ...this.lobbyMessages(room)];
    }

    // ===== 対戦 =====

    // 部屋を作った人（席0）が、2人そろったら対戦を始める。2人に同じシードを配る
    async startMatch(room, seat) {
        if (seat !== 0) throw new UserError('部屋を作った人だけが開始できます');
        if (room.status !== 'lobby') throw new UserError('対戦中です');
        if (room.players.length < MAX_PLAYERS || room.players.some(player => !player.connectionId)) {
            throw new UserError('2人そろってから開始してください');
        }
        room.status = 'playing';
        room.matchId += 1;
        room.seed = Math.floor(this.random() * 2 ** 32);
        await this.saveRoom(room);
        const start = { type: 'start', matchId: room.matchId, seed: room.seed };
        return [...this.toConnected(room, () => start), ...this.lobbyMessages(room)];
    }

    // 攻撃・フィールドの様子を相手に中継する（部屋は保存しない）
    relay(room, seat, { kind, data, matchId }) {
        if (room.status !== 'playing' || matchId !== room.matchId || !RELAY_KINDS.includes(kind)) return [];
        if (JSON.stringify(data ?? null).length > MAX_RELAY_LENGTH) return [];
        const opponent = room.players[1 - seat];
        if (!opponent?.connectionId) return [];
        return [{ connectionId: opponent.connectionId, message: { type: 'relay', kind, data, matchId } }];
    }

    // ゲームオーバーになった。相手の勝ちにして部屋に戻る
    async lose(room, seat, { matchId }) {
        if (room.status !== 'playing' || matchId !== room.matchId) return [];
        return this.finishMatch(room, 1 - seat);
    }

    // 対戦をやめる（相手の接続が切れたときなど）。勝ち負けはつけない
    async abort(room) {
        if (room.status !== 'playing') return [];
        return this.finishMatch(room, null);
    }

    // 部屋を出る。対戦中なら相手の勝ち。残った人が部屋を作った人（席0）になる
    async leave(room, seat, connectionId) {
        const messages = [];
        if (room.status === 'playing' && room.players.length === MAX_PLAYERS) {
            messages.push(...await this.finishMatch(room, 1 - seat));
        }
        room.players.splice(seat, 1);
        await this.saveRoom(room);
        await this.store.deleteConnection(connectionId);
        // 席が詰まったので、残った人の接続の席番号を書き直す
        await Promise.all(room.players.map((player, newSeat) => player.connectionId
            ? this.store.putConnection({ connectionId: player.connectionId, roomCode: room.code, seat: newSeat, expiresAt: this.expiresAt() })
            : null));
        return [
            ...messages.filter(({ connectionId: id }) => id !== connectionId),
            ...room.players.map((player, newSeat) => this.joinedMessage(room, newSeat)).filter(m => m.connectionId),
            ...this.lobbyMessages(room)
        ];
    }

    async finishMatch(room, winner) {
        const matchId = room.matchId;
        room.status = 'lobby';
        room.seed = null;
        if (winner !== null && room.players[winner]) room.players[winner].wins += 1;
        await this.saveRoom(room);
        const result = { type: 'result', matchId, winner };
        return [...this.toConnected(room, () => result), ...this.lobbyMessages(room)];
    }

    // ===== 保存と送信 =====

    // 部屋を保存する（読み込んだときと版が違えば ConflictError）
    async saveRoom(room) {
        const previousVersion = room.version;
        room.version = previousVersion + 1;
        room.expiresAt = this.expiresAt();
        try {
            await this.store.putRoom(room, previousVersion);
        } catch (error) {
            room.version = previousVersion;
            throw error;
        }
    }

    async flush(outbox) {
        // 同じ端末へのメッセージは順番を守り、端末どうしは並べて送る
        const byConnection = new Map();
        outbox.forEach(({ connectionId, message }) => {
            if (!byConnection.has(connectionId)) byConnection.set(connectionId, []);
            byConnection.get(connectionId).push(message);
        });
        await Promise.all([...byConnection].map(async ([connectionId, messages]) => {
            for (const message of messages) {
                await this.send(connectionId, message);
            }
        }));
    }

    async send(connectionId, message) {
        try {
            await this.sendRaw(connectionId, message);
        } catch {
            // 切れた接続には送れなくてよい（切断の通知で片付ける）
        }
    }

    // ===== メッセージ =====

    joinedMessage(room, seat) {
        const player = room.players[seat];
        return { connectionId: player.connectionId, message: { type: 'joined', roomCode: room.code, seat, token: player.token } };
    }

    // 部屋の状態（参加者・接続状況・勝ち数）を全員に送る
    lobbyMessages(room) {
        const lobby = {
            type: 'lobby',
            roomCode: room.code,
            status: room.status,
            matchId: room.matchId,
            players: room.players.map((player, seat) => ({
                seat,
                name: player.name,
                wins: player.wins,
                connected: Boolean(player.connectionId)
            }))
        };
        return this.toConnected(room, () => lobby);
    }

    toConnected(room, createMessage) {
        return room.players
            .filter(player => player.connectionId)
            .map(player => ({ connectionId: player.connectionId, message: createMessage(player) }));
    }

    // ===== 補助 =====

    async loadMember(connectionId) {
        const connection = await this.store.getConnection(connectionId);
        if (!connection) throw new UserError('部屋に入っていません');
        const room = await this.store.getRoom(connection.roomCode);
        if (!room || room.players[connection.seat]?.connectionId !== connectionId) {
            throw new UserError('部屋に入っていません');
        }
        return { room, seat: connection.seat };
    }

    newPlayer(name, connectionId) {
        const trimmed = String(name ?? '').trim().slice(0, MAX_NAME_LENGTH);
        return { name: trimmed || 'プレイヤー', token: this.createToken(), connectionId, wins: 0 };
    }

    createRoomCode() {
        return Array.from({ length: CODE_LENGTH },
            () => CODE_ALPHABET[Math.floor(this.random() * CODE_ALPHABET.length)]).join('');
    }

    expiresAt() {
        return Math.floor(this.now() / 1000) + ROOM_TTL_SECONDS;
    }
}

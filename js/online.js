/**
 * オンライン対戦のサーバーとの通信
 * 部屋の操作と、対戦中の攻撃・フィールドの様子の送受信を行う。受け取ったメッセージは listeners に渡す
 */

const SESSION_KEY = 'panel-de-pon.online'; // 再接続に使う部屋番号とトークン
const RECONNECT_DELAY_MS = 2000;

// 保存した参加情報 { roomCode, token, seat }
function loadSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
        return null;
    }
}

function saveSession(session) {
    try {
        if (session) {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } else {
            localStorage.removeItem(SESSION_KEY);
        }
    } catch {
        // 保存できなくても、このページを開いている間は遊べる
    }
}

export class OnlineClient {
    // listeners: onJoined(session) / onLobby(lobby) / onStart(start) / onRelay(kind, data) / onResult(result)
    //            / onError(message) / onConnectionChange(connected)
    constructor(serverUrl, listeners = {}) {
        this.serverUrl = serverUrl;
        this.listeners = listeners;
        this.socket = null;
        this.session = loadSession();
        this.matchId = 0; // 対戦中の対戦番号
        this.isLeaving = false;
    }

    // ===== 接続 =====

    connect() {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(this.serverUrl);
            this.socket = socket;
            socket.addEventListener('open', () => {
                this.listeners.onConnectionChange?.(true);
                resolve();
            });
            socket.addEventListener('error', () => reject(new Error('サーバーに接続できませんでした')));
            socket.addEventListener('message', (event) => this.receive(JSON.parse(event.data)));
            socket.addEventListener('close', () => {
                if (this.socket !== socket) return;
                this.listeners.onConnectionChange?.(false);
                // 部屋に入っていれば、少し待ってつなぎ直す（スマホがスリープしたときなど）
                if (!this.isLeaving && this.session) {
                    setTimeout(() => this.reconnect(), RECONNECT_DELAY_MS);
                }
            });
        });
    }

    async reconnect() {
        if (this.isLeaving || !this.session || this.isOpen()) return;
        try {
            await this.connect();
            this.request({ action: 'join', roomCode: this.session.roomCode, token: this.session.token });
        } catch {
            setTimeout(() => this.reconnect(), RECONNECT_DELAY_MS);
        }
    }

    isOpen() {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    async ensureConnected() {
        this.isLeaving = false;
        if (!this.isOpen()) await this.connect();
    }

    request(message) {
        if (!this.isOpen()) return false;
        this.socket.send(JSON.stringify(message));
        return true;
    }

    // ===== 部屋の操作 =====

    async createRoom(name) {
        await this.ensureConnected();
        this.request({ action: 'create', name });
    }

    async joinRoom(roomCode, name) {
        await this.ensureConnected();
        // 同じ部屋に入ったことがあれば、その席に戻る
        const token = this.session?.roomCode === roomCode ? this.session.token : undefined;
        this.request({ action: 'join', roomCode, name, token });
    }

    // 部屋を出て接続を閉じる
    leave() {
        this.request({ action: 'leave' });
        this.isLeaving = true;
        this.session = null;
        saveSession(null);
        this.socket?.close();
    }

    startMatch() { this.request({ action: 'start' }); }
    abort() { this.request({ action: 'abort' }); }
    lose() { this.request({ action: 'lose', matchId: this.matchId }); }

    // 攻撃（'attack'）やフィールドの様子（'snapshot'）を相手に送る
    relay(kind, data) {
        this.request({ action: 'relay', kind, data, matchId: this.matchId });
    }

    // ===== サーバーからのメッセージ =====

    receive(message) {
        switch (message.type) {
            case 'joined':
                this.session = { roomCode: message.roomCode, token: message.token, seat: message.seat };
                saveSession(this.session);
                this.listeners.onJoined?.(this.session);
                break;
            case 'lobby':
                this.listeners.onLobby?.(message);
                break;
            case 'start':
                this.matchId = message.matchId;
                this.listeners.onStart?.(message);
                break;
            case 'relay':
                if (message.matchId === this.matchId) this.listeners.onRelay?.(message.kind, message.data);
                break;
            case 'result':
                if (message.matchId === this.matchId) this.listeners.onResult?.(message);
                break;
            case 'error':
                this.listeners.onError?.(message.message);
                break;
        }
    }
}

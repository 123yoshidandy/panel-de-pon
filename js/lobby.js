// オンライン対戦の画面（名前の入力・部屋の作成と参加、部屋の画面）

import NetplayClient from './netplay/netplay-client.mjs';

const NAME_KEY = 'panel-de-pon.name';
const ROOM_CODE_LENGTH = NetplayClient.ROOM_CODE_LENGTH;

let screen = null;

function loadName() {
    try {
        return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
        return '';
    }
}

function saveName(name) {
    try {
        localStorage.setItem(NAME_KEY, name);
    } catch {
        // 保存できなくても遊べる
    }
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function ensureScreen() {
    if (!screen) {
        screen = document.createElement('div');
        screen.id = 'online-screen';
        document.body.append(screen);
    }
    return screen;
}

// data-action を持つボタンに処理を割り当てる
function bindActions(element, actions) {
    for (const button of element.querySelectorAll('[data-action]')) {
        button.addEventListener('click', () => actions[button.dataset.action]?.());
    }
}

// 招待URLの部屋番号（?room=1234）
export function getInvitedRoomCode() {
    const code = (new URLSearchParams(location.search).get('room') ?? '').trim();
    return NetplayClient.isRoomCode(code) ? code : '';
}

// 入口の画面。onCreate(name, { public }) / onJoin(roomCode, name) / onFind() / onBack()
export function showOnlineEntry({ onCreate, onJoin, onFind, onBack }) {
    const element = ensureScreen();
    element.dataset.view = 'entry';
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">オンライン対戦</h2>
            <label class="online-field">名前
                <input class="online-name" maxlength="12" autocomplete="nickname" value="${escapeHtml(loadName())}">
            </label>
            <div class="online-create">
                <button type="button" class="online-button" data-action="create">部屋を作る</button>
                <label class="public-toggle" title="公開の部屋の一覧に出し、部屋番号を知らない人も入れるようにします">
                    <input type="checkbox" class="online-public">公開
                </label>
            </div>
            <div class="online-or">または</div>
            <label class="online-field">部屋番号
                <input class="online-code" inputmode="numeric" maxlength="${ROOM_CODE_LENGTH}" placeholder="数字${ROOM_CODE_LENGTH}桁" value="${getInvitedRoomCode()}">
            </label>
            <button type="button" class="online-button" data-action="join">参加する</button>
            <button type="button" class="online-button sub" data-action="find">公開の部屋を探す</button>
            <p class="online-message"></p>
            <button type="button" class="online-link" data-action="back">タイトルへ</button>
        </div>
    `;
    const name = () => {
        const value = element.querySelector('.online-name').value.trim();
        saveName(value);
        return value;
    };
    bindActions(element, {
        create: () => onCreate(name(), { public: element.querySelector('.online-public').checked }),
        find: () => {
            name(); // 一覧から入るときに使う名前を覚えておく
            onFind();
        },
        join: () => {
            const code = element.querySelector('.online-code').value.trim();
            if (!NetplayClient.isRoomCode(code)) {
                setOnlineMessage(`部屋番号は数字${ROOM_CODE_LENGTH}桁で入れてください`);
                return;
            }
            onJoin(code, name());
        },
        back: onBack
    });
}

// 公開の部屋の一覧（rooms が null の間は取りに行っている）。押すとその部屋に入る
// onEnter(roomCode, name) / onRefresh() / onBack()
export function showPublicRooms({ rooms, onEnter, onRefresh, onBack }) {
    const element = ensureScreen();
    element.dataset.view = 'rooms';
    const list = !rooms ? '<p class="online-guide">探しています…</p>'
        : rooms.length === 0 ? '<p class="online-guide">待っている部屋はありません</p>'
        : `<ul class="lobby-players">${rooms.map(room => `
            <li><button type="button" class="lobby-player public-room" data-room-code="${escapeHtml(room.roomCode)}">
                <span class="lobby-name">${escapeHtml(room.hostName)}の部屋</span>
            </button></li>
        `).join('')}</ul>`;
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">公開の部屋</h2>
            ${list}
            <button type="button" class="online-button" data-action="refresh" ${rooms ? '' : 'disabled'}>更新</button>
            <p class="online-message"></p>
            <button type="button" class="online-link" data-action="back">戻る</button>
        </div>
    `;
    for (const button of element.querySelectorAll('[data-room-code]')) {
        button.addEventListener('click', () => onEnter(button.dataset.roomCode, loadName()));
    }
    bindActions(element, { refresh: onRefresh, back: onBack });
}

export function isPublicRoomsShown() {
    return screen?.dataset.view === 'rooms';
}

// 部屋の画面。lobby はサーバーから届いた部屋の状態（seat は自分の席）、isHost は部屋を作った人（の役）か、
// winsOf(playerId) は通算の勝ち数。onStart() / onLeave() / onAbort() / onBackToLobby()
export function showLobby({ lobby, isHost, winsOf, onStart, onLeave, onAbort, onBackToLobby }) {
    const element = ensureScreen();
    const seat = lobby.seat;
    const players = [0, 1].map(i => lobby.players[i]);
    const ready = players.every(player => player?.connected);

    let guide;
    let action = '';
    if (lobby.status === 'playing') {
        guide = '対戦中です';
        action = '<button type="button" class="online-button" data-action="abort">対戦をやめる</button>';
    } else if (lobby.status === 'ended') {
        guide = '対戦が終わりました';
        action = '<button type="button" class="online-button" data-action="lobby">部屋に戻る</button>';
    } else if (!players[1]) {
        guide = lobby.public ? '公開の部屋の一覧で相手を待っています' : '招待URLか部屋番号を相手に伝えてください';
    } else if (!ready) {
        guide = '相手の接続が切れています';
    } else if (isHost) {
        guide = '';
        action = '<button type="button" class="start-button" data-action="start">対戦スタート</button>';
    } else {
        guide = 'ホストの開始を待っています';
    }

    const slot = (player, i) => {
        if (!player) return '<li class="lobby-player empty">空き</li>';
        const status = player.left ? '退出' : player.connected ? '' : '切断中';
        const notes = [i === seat ? 'あなた' : '', status].filter(Boolean).join('・');
        return `<li class="lobby-player">
            <span class="lobby-name">${escapeHtml(player.name)}</span>
            <span class="lobby-wins">${winsOf(player.id)}勝</span>
            ${notes ? `<span class="lobby-note">${notes}</span>` : ''}
        </li>`;
    };

    element.dataset.view = 'room';
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">部屋 ${escapeHtml(lobby.roomCode)}${lobby.public ? '<span class="public-badge">公開</span>' : ''}</h2>
            <button type="button" class="online-link" data-action="invite">招待URLを送る</button>
            <ul class="lobby-players">${players.map(slot).join('')}</ul>
            <p class="online-guide">${guide}</p>
            ${action}
            <p class="online-message"></p>
            <button type="button" class="online-link" data-action="leave">部屋を出る</button>
        </div>
    `;
    bindActions(element, {
        invite: () => shareInvite(lobby.roomCode),
        start: onStart,
        leave: onLeave,
        abort: onAbort,
        lobby: onBackToLobby
    });
}

// 招待URLを共有する（共有メニューがなければクリップボードにコピー）
async function shareInvite(roomCode) {
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: 'パネルでポン 対戦の招待', url });
        } else {
            await navigator.clipboard.writeText(url);
            setOnlineMessage('招待URLをコピーしました');
        }
    } catch {
        // 共有をやめた場合など
    }
}

export function setOnlineMessage(text) {
    const message = screen?.querySelector('.online-message');
    if (message) message.textContent = text;
}

export function hideOnline() {
    screen?.remove();
    screen = null;
}

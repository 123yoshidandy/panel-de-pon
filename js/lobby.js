// オンライン対戦の画面（名前の入力・部屋の作成と参加、部屋の画面）

const NAME_KEY = 'panel-de-pon.name';
const ROOM_CODE_PATTERN = /^\d{5}$/;

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

// 招待URLの部屋番号（?room=12345）
export function getInvitedRoomCode() {
    const code = new URLSearchParams(location.search).get('room') ?? '';
    return ROOM_CODE_PATTERN.test(code) ? code : '';
}

// 入口の画面。onCreate(name) / onJoin(roomCode, name) / onBack()
export function showOnlineEntry({ onCreate, onJoin, onBack }) {
    const element = ensureScreen();
    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">オンライン対戦</h2>
            <label class="online-field">名前
                <input class="online-name" maxlength="12" autocomplete="nickname" value="${escapeHtml(loadName())}">
            </label>
            <button type="button" class="online-button" data-action="create">部屋を作る</button>
            <div class="online-or">または</div>
            <label class="online-field">部屋番号
                <input class="online-code" inputmode="numeric" maxlength="5" placeholder="数字5桁" value="${getInvitedRoomCode()}">
            </label>
            <button type="button" class="online-button" data-action="join">参加する</button>
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
        create: () => onCreate(name()),
        join: () => {
            const code = element.querySelector('.online-code').value.trim();
            if (!ROOM_CODE_PATTERN.test(code)) {
                setOnlineMessage('部屋番号は数字5桁で入れてください');
                return;
            }
            onJoin(code, name());
        },
        back: onBack
    });
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
        guide = '招待URLか部屋番号を相手に伝えてください';
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

    element.innerHTML = `
        <div class="title-content online-content">
            <h2 class="online-title">部屋 ${escapeHtml(lobby.roomCode)}</h2>
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

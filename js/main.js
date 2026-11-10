import {
    initRenderer, render, setVersusVisible, setFieldVisible, renderOpponent, showVersusResult, hideVersusResult
} from './renderer.js';
import { initInput, pollInput } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState, receiveGarbage, getSnapshot } from './game.js';
import { createCpuMatch } from './cpu-match.js';
import { createSeed } from './random.js';
import { showTitle } from './title.js';
import { showHelp, showConfirm } from './help.js';
import { showOnlineEntry, showPublicRooms, isPublicRoomsShown, showLobby, setOnlineMessage, hideOnline } from './lobby.js';
import NetplayClient from './netplay/netplay-client.mjs';
import { getServerUrl } from './online-config.js';
import { playEventSounds, playSound, setSoundEnabled, setBgmEnabled, startBgm, stopBgm } from './sound.js';
import { FRAME_MS, SNAPSHOT_INTERVAL } from './constants.js';

// タブ復帰時などに1回の描画で進めるフレーム数の上限
const MAX_FRAMES_PER_TICK = 5;
const COUNTDOWN_FRAMES = 180; // 対戦開始前のカウントダウン（3秒）

// 'title' | 'playing' | 'gameover'（CPU 対戦）
// | 'online'（オンライン対戦の入口・部屋の画面） | 'versus'（対戦中） | 'versus-end'（結果待ち・勝敗の表示）
let scene = 'title';
let initialized = false;
let looping = false;
let lastTime = 0;
let pendingTime = 0;
let settings = null; // タイトル画面で選んだ設定
let paused = false; // CPU 対戦で、遊び方や確認の画面を開いていて止めている

// CPU 対戦
let cpuMatch = null; // 自分と CPU の盤面（cpu-match.js）
let cpuWins = [0, 0]; // タイトルから続けて遊んだ勝ち数（自分・CPU）

// オンライン対戦
let net = null; // サーバーとの通信（NetplayClient）
let lobby = null; // 最後に届いた部屋の状態（lobby.seat が自分の席）
let matchId = null; // 遊んでいる（遊んだ）対戦の番号
let resumedMatchId = null; // つなぎ直したときに進んでいた対戦の番号（途中から始めない）
let resuming = false; // 参加した直後で、まだ部屋の状態が届いていない
let lastState = null; // 最後に届いた自分のビュー { matchId, view }
let winsById = {}; // 参加者の id ごとの通算の勝ち数
let lastError = ''; // 勝敗の画面に出すエラー
let countdown = 0; // 対戦開始までの残りフレーム数
let opponentSnapshot = null; // 相手から届いたフィールドの様子
let resultTitle = null; // 表示中の勝敗（'WIN' など）

// ===== 共通 =====

// 描画・入力の初期化（最初の1回だけ）
function ensureSetup() {
    if (initialized) return;
    initialized = true;
    const canvas = initRenderer({ onRematch: rematch, onBackToRoom: backToRoom, onHome: goHome, onHelp: openHelp });
    doLayout('solo');
    window.addEventListener('resize', () => doLayout());
    initInput(canvas);
}

function applySoundSettings() {
    setSoundEnabled(settings.sound === 'on');
    setBgmEnabled(settings.bgm === 'on');
}

function openTitle() {
    scene = 'title';
    paused = false;
    cpuMatch = null;
    if (initialized) {
        setFieldVisible(false);
        setVersusVisible(false);
    }
    showTitle({ onSolo: startSolo, onOnline: openOnline });
}

// プレイ中の「遊び方」。CPU 対戦なら閉じるまで止める（オンライン対戦は止められない）
function openHelp() {
    pause();
    showHelp({ versus: scene === 'versus' || scene === 'versus-end', onClose: resume });
}

// プレイ中の「ホーム」。ゲームオーバー後ならそのまま、遊んでいる途中なら確かめてからタイトルへ戻る
function goHome() {
    if (scene === 'gameover') {
        openTitle();
    } else if (scene === 'playing') {
        pause();
        showConfirm({
            title: 'タイトルに戻りますか？',
            text: '今のゲームは終わります',
            yes: 'タイトルへ',
            no: '続ける',
            onYes: () => {
                stopBgm();
                openTitle();
            },
            onNo: resume
        });
    } else if (scene === 'versus' || scene === 'versus-end') {
        showConfirm({
            title: '部屋を出てタイトルに戻りますか？',
            text: scene === 'versus' ? '対戦の途中で部屋を出ると負けになります' : '',
            yes: '部屋を出る',
            no: 'キャンセル',
            onYes: leaveOnline
        });
    }
}

function pause() {
    if (scene === 'playing') paused = true;
}

function resume() {
    paused = false;
    pollInput(); // 止めている間の入力は捨てる
}

// ゲームループを動かす（すでに動いていれば何もしない）
function startLoop() {
    lastTime = performance.now();
    pendingTime = 0;
    if (looping) return;
    looping = true;
    requestAnimationFrame(tick);
}

// ゲームループ。表示のリフレッシュレートに関係なく FRAME_MS ごとに1フレーム進める
function tick(now) {
    pendingTime += Math.min(now - lastTime, FRAME_MS * MAX_FRAMES_PER_TICK);
    lastTime = now;
    for (; pendingTime >= FRAME_MS; pendingTime -= FRAME_MS) {
        if (scene === 'playing' && !paused) stepCpuMatch();
        else if (scene === 'versus') stepVersus();
    }

    if (scene === 'playing' || scene === 'gameover') {
        render(cpuMatch.player, { countdown: Math.ceil(countdown / 60) });
        renderOpponent(cpuMatch.cpuSnapshot(), { name: 'CPU', connected: true });
    } else if (scene === 'versus' || scene === 'versus-end') {
        render(gameState, { countdown: Math.ceil(countdown / 60) });
        renderOpponent(opponentSnapshot, opponentInfo());
    }

    if (scene === 'playing' || scene === 'versus' || scene === 'versus-end') {
        requestAnimationFrame(tick);
    } else {
        looping = false;
    }
}

// ===== CPU 対戦 =====

// タイトルの「CPU対戦」。CPU の強さは難易度で決まる
function startSolo(selected) {
    settings = selected;
    cpuWins = [0, 0];
    ensureSetup();
    startCpuMatch();
}

// 新しい試合を始める（リトライも同じ）。盤面の並びは毎回変える
function startCpuMatch() {
    cpuMatch = createCpuMatch({ settings, seed: createSeed() });
    hideVersusResult();
    setVersusVisible(true);
    doLayout('versus');
    applySoundSettings();
    startBgm();
    pollInput(); // 開始前の入力は捨てる
    scene = 'playing';
    paused = false;
    countdown = COUNTDOWN_FRAMES;
    resultTitle = null;
    // 新しい盤面を描いてから見せる（前の盤面や空のフィールドが一瞬見えないように）
    render(cpuMatch.player, { countdown: Math.ceil(countdown / 60) });
    renderOpponent(cpuMatch.cpuSnapshot(), { name: 'CPU', connected: true });
    setFieldVisible(true);
    startLoop();
}

function stepCpuMatch() {
    if (countdown > 0) {
        countdown--;
        pollInput(); // カウントダウン中の操作は捨てる
        return;
    }
    const loser = cpuMatch.step(pollInput());
    playEventSounds(cpuMatch.player.events);
    if (!loser) return;
    scene = 'gameover';
    stopBgm(1);
    if (loser === 'cpu') cpuWins[0]++;
    if (loser === 'player') cpuWins[1]++;
    resultTitle = loser === 'cpu' ? 'WIN' : loser === 'player' ? 'LOSE' : 'DRAW';
    playSound(resultTitle === 'WIN' ? 'chain' : 'gameover', resultTitle === 'WIN' ? 1.5 : 1);
    showVersusResult(resultTitle, `${cpuWins[0]} - ${cpuWins[1]}`, { labels: { rematch: 'リトライ', room: 'タイトルへ' } });
}

// ===== オンライン対戦 =====

function openOnline(selected) {
    settings = selected;
    ensureSetup();
    scene = 'online';
    showEntry();
    const serverUrl = getServerUrl();
    if (!serverUrl) {
        setOnlineMessage('オンライン対戦のサーバーが準備中です');
        return;
    }
    if (net) return;
    net = new NetplayClient({ serverUrl, storageKey: 'panel-de-pon.online' });
    net.on('joined', () => { resuming = true; });
    net.on('lobby', receiveLobby);
    net.on('state', receiveState);
    net.on('relay', receiveRelay);
    net.on('error', ({ message }) => {
        lastError = message;
        if (scene === 'online') setOnlineMessage(message);
        if (scene === 'versus-end') updateResult();
    });
    net.on('connection', (connected) => {
        if (!connected && scene === 'online') setOnlineMessage('接続が切れました。つなぎ直しています…');
    });
}

// オンライン対戦の入口（名前・部屋を作る・部屋番号で参加・公開の部屋を探す）
function showEntry() {
    showOnlineEntry({
        onCreate: (name, options) => connectAnd(() => net.createRoom(name, options)),
        onJoin: (roomCode, name) => connectAnd(() => net.joinRoom(roomCode, name)),
        onFind: findRooms,
        onBack: leaveOnline
    });
}

// 公開の部屋の一覧を取って出す（開いたときと「更新」を押したときだけ取る）
async function findRooms() {
    if (!net) return;
    const show = (rooms) => showPublicRooms({ rooms, onEnter: enterPublicRoom, onRefresh: findRooms, onBack: showEntry });
    show(null);
    try {
        const rooms = await net.listRooms();
        if (scene === 'online' && isPublicRoomsShown()) show(rooms);
    } catch (error) {
        if (scene === 'online' && isPublicRoomsShown()) {
            show([]);
            setOnlineMessage(error.message);
        }
    }
}

// 一覧の部屋に入る。押すまでに始まった・満員になった・消えた部屋なら、一覧を取り直して理由を出す
async function enterPublicRoom(roomCode, name) {
    setOnlineMessage('接続しています…');
    try {
        await net.enterRoom(roomCode, name);
    } catch (error) {
        if (['already_started', 'room_full', 'room_not_found'].includes(error.code)) await findRooms();
        setOnlineMessage(error.message);
    }
}

async function connectAnd(action) {
    if (!net) return;
    setOnlineMessage('接続しています…');
    try {
        await action();
    } catch (error) {
        setOnlineMessage(error.message);
    }
}

// 部屋を出てタイトルへ戻る
function leaveOnline() {
    // 一覧を見ただけで部屋に入っていなければ、接続を閉じるだけにする（退出を送ると「部屋に入っていません」が返る）
    if (net?.isInRoom() || net?.session) net.leave();
    else net?.close();
    net = null;
    lobby = null;
    matchId = null;
    lastState = null;
    winsById = {};
    hideOnline();
    setVersusVisible(false);
    stopBgm();
    openTitle();
}

function showRoom() {
    showLobby({
        lobby,
        isHost: net.isHost(),
        winsOf: (id) => winsById[id] ?? 0,
        onStart: () => net.start(),
        onLeave: leaveOnline,
        onAbort: () => net.send('abort'),
        onBackToLobby: () => net.backToLobby()
    });
}

function receiveLobby(received) {
    lobby = received;
    // つなぎ直したとき、すでに進んでいた対戦は途中から始めない（届く state で盤面を作り直さない）
    if (resuming) {
        resuming = false;
        resumedMatchId = lobby.status === 'lobby' || lobby.matchId === matchId ? null : lobby.matchId;
    }
    if (scene === 'online') showRoom();
    if (scene === 'versus-end' || scene === 'versus') {
        // 相手が「部屋に戻る」を押した
        if (lobby.status === 'lobby') {
            enterRoom();
        } else {
            if (lobby.status === 'ended') showResultIfEnded();
            if (scene === 'versus-end') updateResult();
        }
    }
}

// 自分のビュー（対戦の開始・勝敗）が届いた。
// 対戦が終わるときは、勝敗の state が先、status: 'ended' の lobby があとに届く
function receiveState({ matchId: id, view }) {
    lastState = { matchId: id, view };
    view.ids.forEach((playerId, i) => { winsById[playerId] = view.wins[i]; });
    if (lobby?.status === 'playing' && view.loser === null && id !== matchId && id !== resumedMatchId) {
        startVersus(id, view.seed);
    } else if (view.loser !== null || lobby?.status === 'ended') {
        showResultIfEnded();
    } else if (scene === 'online' && lobby) {
        showRoom();
    }
}

// 遊んでいた対戦が終わっていれば、勝敗を表示する（中止は loser が null のまま lobby で終わりが分かる）
function showResultIfEnded() {
    if (scene !== 'versus' && scene !== 'versus-end') return;
    if (lastState?.matchId !== matchId) return;
    if (lastState.view.loser !== null || lobby?.status === 'ended') receiveResult(lastState.view.loser);
}

const mySeat = () => lobby?.seat ?? 0;
const opponent = () => lobby?.players.find(player => player.seat !== mySeat()) ?? null;

// 相手の名前と接続状況
function opponentInfo() {
    const player = opponent();
    return { name: player?.name ?? '', connected: Boolean(player?.connected) };
}

function scoreText() {
    const me = lobby?.players[mySeat()];
    const other = opponent();
    return me && other ? `${winsById[me.id] ?? 0} - ${winsById[other.id] ?? 0}` : '';
}

function startVersus(id, seed) {
    matchId = id;
    lastError = '';
    hideOnline();
    hideVersusResult();
    setVersusVisible(true);
    doLayout('versus');
    resetGame(settings, { mode: 'versus', seed });
    applySoundSettings();
    startBgm();
    pollInput();
    scene = 'versus';
    countdown = COUNTDOWN_FRAMES;
    opponentSnapshot = null;
    resultTitle = null;
    render(gameState, { countdown: Math.ceil(countdown / 60) });
    renderOpponent(null, opponentInfo());
    setFieldVisible(true);
    startLoop();
}

function stepVersus() {
    if (countdown > 0) {
        countdown--;
        pollInput(); // カウントダウン中の操作は捨てる
        return;
    }
    const gameOver = updateGame(pollInput());
    playEventSounds(gameState.events);
    for (const event of gameState.events) {
        if (event.type === 'attack') net?.send('relay', { kind: 'attack', data: event.pieces });
    }
    if (gameOver || gameState.counter % SNAPSHOT_INTERVAL === 0) {
        net?.send('relay', { kind: 'snapshot', data: getSnapshot() });
    }
    if (gameOver) {
        // 負けをサーバーに伝え、結果が届くのを待つ
        scene = 'versus-end';
        stopBgm(1);
        playSound('gameover');
        net?.send('lose');
    }
}

function receiveRelay({ kind, data }) {
    if (scene !== 'versus' && scene !== 'versus-end') return;
    if (kind === 'attack' && scene === 'versus' && Array.isArray(data)) receiveGarbage(data);
    if (kind === 'snapshot') opponentSnapshot = data;
}

function receiveResult(loser) {
    if (resultTitle) return; // 表示済み（つなぎ直したときなどに、もう一度届く）
    if (scene === 'versus') {
        // 相手が先にゲームオーバーになった（または部屋を出た）
        scene = 'versus-end';
        stopBgm(1);
    }
    resultTitle = loser === null ? '中止' : loser === mySeat() ? 'LOSE' : 'WIN';
    if (resultTitle === 'WIN') playSound('chain', 1.5);
    updateResult();
}

// 勝敗の画面を、相手の「もう1回」の状況にあわせて表示し直す
function updateResult() {
    if (!resultTitle) return;
    const me = lobby?.players[mySeat()];
    const other = opponent();
    let note = '';
    let canRematch = true;
    if (!other || other.left) {
        note = '相手が部屋を出ました';
        canRematch = false;
    } else if (!other.connected) {
        note = '相手の接続が切れています';
    } else if (me?.ready) {
        note = '相手を待っています';
        canRematch = false;
    } else if (other.ready) {
        note = '相手が再戦を希望しています';
    } else if (lastError) {
        note = lastError;
    }
    showVersusResult(resultTitle, scoreText(), { note, canRematch });
}

// 「再戦」。2人とも押したら次の対戦が始まる（CPU 対戦では「リトライ」で、すぐ次の試合を始める）
function rematch() {
    if (scene === 'gameover') {
        startCpuMatch();
        return;
    }
    if (scene !== 'versus-end' || !resultTitle) return;
    lastError = '';
    net?.ready();
}

// 勝敗の表示から部屋の画面へ戻る（相手も部屋に戻る）。CPU 対戦では「タイトルへ」
function backToRoom() {
    if (scene === 'gameover') {
        openTitle();
        return;
    }
    if (scene !== 'versus-end' || !resultTitle) return;
    net?.backToLobby();
    enterRoom();
}

function enterRoom() {
    setFieldVisible(false);
    setVersusVisible(false);
    stopBgm();
    scene = 'online';
    resultTitle = null;
    if (lobby) showRoom();
}

// iOS の Safari は touch-action・viewport だけではピンチで拡大するので、ジェスチャーを止める
document.addEventListener('gesturestart', ev => ev.preventDefault());

openTitle();

// ホーム画面に置いて、オフラインでも開けるようにする（PWA）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(registration => {
        const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)];
        registration.active?.postMessage({ type: 'cache-urls', urls });
    }).catch(() => {});
}

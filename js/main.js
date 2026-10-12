import {
    initRenderer, render, showGameOver, hideGameOver,
    setVersusVisible, renderOpponent, showVersusResult, hideVersusResult
} from './renderer.js';
import { initInput, pollInput } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState, receiveGarbage, getSnapshot } from './game.js';
import { showTitle } from './title.js';
import { showOnlineEntry, showLobby, setOnlineMessage, hideOnline } from './lobby.js';
import NetplayClient from './netplay/netplay-client.mjs';
import { getServerUrl } from './online-config.js';
import { playEventSounds, playSound, setSoundEnabled, setBgmEnabled, startBgm, stopBgm } from './sound.js';
import { FRAME_MS, SNAPSHOT_INTERVAL } from './constants.js';

// タブ復帰時などに1回の描画で進めるフレーム数の上限
const MAX_FRAMES_PER_TICK = 5;
const COUNTDOWN_FRAMES = 180; // 対戦開始前のカウントダウン（3秒）

// 'title' | 'playing' | 'gameover'（ひとりで遊ぶ）
// | 'online'（オンライン対戦の入口・部屋の画面） | 'versus'（対戦中） | 'versus-end'（結果待ち・勝敗の表示）
let scene = 'title';
let initialized = false;
let looping = false;
let lastTime = 0;
let pendingTime = 0;
let settings = null; // タイトル画面で選んだ設定

// オンライン対戦
let net = null; // サーバーとの通信（NetplayClient）
let lobby = null; // 最後に届いた部屋の状態（lobby.seat が自分の席）
let matchId = null; // 遊んでいる（遊んだ）対戦の番号
let resumedMatchId = null; // つなぎ直したときに進んでいた対戦の番号（途中から始めない）
let resuming = false; // 参加した直後で、まだ部屋の状態が届いていない
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
    const canvas = initRenderer({ onRestart: restart, onBackToTitle: backToTitle, onRematch: rematch, onBackToRoom: backToRoom });
    doLayout('solo');
    window.addEventListener('resize', () => doLayout());
    initInput(canvas);
}

function applySoundSettings() {
    setSoundEnabled(gameState.settings.sound === 'on');
    setBgmEnabled(gameState.settings.bgm === 'on');
}

function openTitle() {
    scene = 'title';
    showTitle({ onSolo: startSolo, onOnline: openOnline });
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
        if (scene === 'playing') stepSolo();
        else if (scene === 'versus') stepVersus();
    }

    if (scene === 'playing' || scene === 'gameover') {
        render(gameState);
    } else if (scene === 'versus' || scene === 'versus-end') {
        render(gameState, { countdown: Math.ceil(countdown / 60) });
        renderOpponent(opponentSnapshot, opponentInfo());
    }

    if (scene === 'gameover') {
        showGameOver(gameState.counter * FRAME_MS / 1000, gameState.maxChain);
    }
    if (scene === 'playing' || scene === 'versus' || scene === 'versus-end') {
        requestAnimationFrame(tick);
    } else {
        looping = false;
    }
}

// ===== ひとりで遊ぶ =====

function startSolo(selected) {
    settings = selected;
    ensureSetup();
    setVersusVisible(false);
    doLayout('solo');
    startGame(settings);
}

// ゲームオーバー中ならリスタート
function restart() {
    if (scene === 'gameover') startGame();
}

// ゲームオーバー中ならタイトルへ戻る
function backToTitle() {
    if (scene !== 'gameover') return;
    openTitle();
}

// ゲームを開始（selected を省略すると前回と同じ設定）
function startGame(selected) {
    resetGame(selected);
    applySoundSettings();
    startBgm();
    pollInput(); // 開始前の入力は捨てる
    hideGameOver();
    scene = 'playing';
    startLoop();
}

function stepSolo() {
    const gameOver = updateGame(pollInput());
    playEventSounds(gameState.events);
    if (gameOver) {
        scene = 'gameover';
        stopBgm(1);
        playSound('gameover');
    }
}

// ===== オンライン対戦 =====

function openOnline(selected) {
    settings = selected;
    ensureSetup();
    scene = 'online';
    showOnlineEntry({
        onCreate: (name) => connectAnd(() => net.createRoom(name)),
        onJoin: (roomCode, name) => connectAnd(() => net.joinRoom(roomCode, name)),
        onBack: leaveOnline
    });
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
    net?.leave();
    net = null;
    lobby = null;
    matchId = null;
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
        } else if (scene === 'versus-end') {
            updateResult();
        }
    }
}

// 自分のビュー（対戦の開始・勝敗）が届いた
function receiveState({ matchId: id, view }) {
    view.ids.forEach((playerId, i) => { winsById[playerId] = view.wins[i]; });
    if (lobby?.status === 'playing' && view.loser === null && id !== matchId && id !== resumedMatchId) {
        startVersus(id, view.seed);
    } else if (lobby?.status === 'ended' && id === matchId && (scene === 'versus' || scene === 'versus-end')) {
        receiveResult(view.loser);
    } else if (scene === 'online' && lobby) {
        showRoom();
    }
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
    hideGameOver();
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
        note = '相手が「もう1回」を押しました';
    } else if (lastError) {
        note = lastError;
    }
    showVersusResult(resultTitle, scoreText(), { note, canRematch });
}

// 「もう1回」。2人とも押したら次の対戦が始まる
function rematch() {
    if (scene !== 'versus-end' || !resultTitle) return;
    lastError = '';
    net?.ready();
}

// 勝敗の表示から部屋の画面へ戻る（相手も部屋に戻る）
function backToRoom() {
    if (scene !== 'versus-end' || !resultTitle) return;
    net?.backToLobby();
    enterRoom();
}

function enterRoom() {
    hideVersusResult();
    setVersusVisible(false);
    stopBgm();
    scene = 'online';
    resultTitle = null;
    if (lobby) showRoom();
}

openTitle();

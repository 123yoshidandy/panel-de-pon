import {
    initRenderer, render, showGameOver, hideGameOver,
    setVersusVisible, renderOpponent, showVersusResult, hideVersusResult
} from './renderer.js';
import { initInput, pollInput } from './input.js';
import { doLayout } from './layout.js';
import { resetGame, updateGame, gameState, receiveGarbage, getSnapshot } from './game.js';
import { showTitle } from './title.js';
import { showOnlineEntry, showLobby, setOnlineMessage, hideOnline } from './lobby.js';
import { OnlineClient } from './online.js';
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
let client = null;
let lobby = null; // 最後に届いた部屋の状態
let seat = 0; // 自分の席
let countdown = 0; // 対戦開始までの残りフレーム数
let opponentSnapshot = null; // 相手から届いたフィールドの様子
let resultTitle = null; // 表示中の勝敗（'WIN' など）

// ===== 共通 =====

// 描画・入力の初期化（最初の1回だけ）
function ensureSetup() {
    if (initialized) return;
    initialized = true;
    const canvas = initRenderer({ onRestart: restart, onBackToTitle: backToTitle, onBackToRoom: backToRoom });
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
        onCreate: (name) => connectAnd(() => client.createRoom(name)),
        onJoin: (roomCode, name) => connectAnd(() => client.joinRoom(roomCode, name)),
        onBack: leaveOnline
    });
    const url = getServerUrl();
    if (!url) {
        setOnlineMessage('オンライン対戦のサーバーが準備中です');
        return;
    }
    client ??= new OnlineClient(url, {
        onJoined: (session) => { seat = session.seat; },
        onLobby: receiveLobby,
        onStart: (start) => startVersus(start.seed),
        onRelay: receiveRelay,
        onResult: receiveResult,
        onError: (message) => setOnlineMessage(message),
        onConnectionChange: (connected) => {
            if (!connected && scene === 'online') setOnlineMessage('接続が切れました。つなぎ直しています…');
        }
    });
}

async function connectAnd(action) {
    if (!client) return;
    setOnlineMessage('接続しています…');
    try {
        await action();
    } catch (error) {
        setOnlineMessage(error.message);
    }
}

// 部屋を出てタイトルへ戻る
function leaveOnline() {
    client?.leave();
    client = null;
    lobby = null;
    hideOnline();
    setVersusVisible(false);
    stopBgm();
    openTitle();
}

function showRoom() {
    showLobby({
        lobby,
        seat,
        onStart: () => client.startMatch(),
        onLeave: leaveOnline,
        onAbort: () => client.abort()
    });
}

function receiveLobby(received) {
    lobby = received;
    if (scene === 'online') showRoom();
    if (scene === 'versus-end' && resultTitle) showVersusResult(resultTitle, scoreText());
}

// 相手の名前と接続状況
function opponentInfo() {
    const opponent = lobby?.players[1 - seat];
    return { name: opponent?.name ?? '', connected: opponent?.connected ?? false };
}

function scoreText() {
    const me = lobby?.players[seat];
    const opponent = lobby?.players[1 - seat];
    return me && opponent ? `${me.wins} - ${opponent.wins}` : '';
}

function startVersus(seed) {
    hideOnline();
    hideGameOver();
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
        if (event.type === 'attack') client?.relay('attack', event.pieces);
    }
    if (gameOver || gameState.counter % SNAPSHOT_INTERVAL === 0) {
        client?.relay('snapshot', getSnapshot());
    }
    if (gameOver) {
        // 負けをサーバーに伝え、結果が届くのを待つ
        scene = 'versus-end';
        stopBgm(1);
        playSound('gameover');
        client?.lose();
    }
}

function receiveRelay(kind, data) {
    if (scene !== 'versus' && scene !== 'versus-end') return;
    if (kind === 'attack' && scene === 'versus' && Array.isArray(data)) receiveGarbage(data);
    if (kind === 'snapshot') opponentSnapshot = data;
}

function receiveResult(result) {
    if (scene !== 'versus' && scene !== 'versus-end') return;
    if (scene === 'versus') {
        // 相手が先にゲームオーバーになった（または部屋を出た）
        scene = 'versus-end';
        stopBgm(1);
    }
    resultTitle = result.winner === null ? '中止' : result.winner === seat ? 'WIN' : 'LOSE';
    if (resultTitle === 'WIN') playSound('chain', 1.5);
    showVersusResult(resultTitle, scoreText());
}

// 勝敗の表示から部屋の画面へ戻る
function backToRoom() {
    if (scene !== 'versus-end' || !resultTitle) return;
    hideVersusResult();
    setVersusVisible(false);
    scene = 'online';
    if (lobby) showRoom();
}

openTitle();

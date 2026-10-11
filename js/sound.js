// 効果音と BGM（音源は sounds/ 以下。いずれも CC0 素材で、出典は sounds/CREDITS.txt）
const SOUNDS = {
    move: { file: 'move.m4a', volume: 0.4 },
    swap: { file: 'swap.m4a', volume: 0.6 },
    pop: { file: 'pop.m4a', volume: 0.6 },
    chain: { file: 'chain.m4a', volume: 0.6 },
    combo: { file: 'combo.m4a', volume: 0.6 },
    land: { file: 'land.m4a', volume: 0.8 },
    warning: { file: 'warning.m4a', volume: 0.6 },
    gameover: { file: 'gameover.m4a', volume: 0.7 }
};

// BGM。AAC は前後に無音が付くので、元の曲の長さでループさせる
const BGM = { file: 'bgm.m4a', volume: 0.35, loopEnd: 1781199 / 44100 };

let context = null;
let enabled = true;
let bgmEnabled = true;
let bgmWanted = false; // BGM を流すべき状態か（読み込み完了前に開始された場合に使う）
let bgmSource = null;
let bgmGain = null;
const buffers = {};

// 音の再生を有効にする。ブラウザの制限により、クリックやキー入力の処理中に呼ぶ必要がある
export function initSound() {
    if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();
        for (const [name, { file }] of Object.entries(SOUNDS)) {
            loadSound(name, file);
        }
        loadSound('bgm', BGM.file).then(() => {
            if (bgmWanted) startBgm();
        });
        // 別のタブを見ている間はゲームが止まるので、音も止める
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) context.suspend();
            else context.resume();
        });
    }
    if (context.state === 'suspended') context.resume();
}

async function loadSound(name, file) {
    try {
        const response = await fetch(`sounds/${file}`);
        buffers[name] = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
        // 読み込めなかった音は鳴らさない
    }
}

export function setSoundEnabled(value) {
    enabled = value;
}

export function setBgmEnabled(value) {
    bgmEnabled = value;
}

// BGM をループ再生する（読み込み中なら読み込み後に始まる）
export function startBgm() {
    stopBgm();
    bgmWanted = true;
    if (!bgmEnabled || !context || !buffers.bgm) return;
    bgmSource = context.createBufferSource();
    bgmSource.buffer = buffers.bgm;
    bgmSource.loop = true;
    bgmSource.loopEnd = Math.min(BGM.loopEnd, buffers.bgm.duration);
    bgmGain = context.createGain();
    bgmGain.gain.value = BGM.volume;
    bgmSource.connect(bgmGain).connect(context.destination);
    bgmSource.start();
}

// BGM を止める。fadeSeconds を指定するとフェードアウトしてから止める
export function stopBgm(fadeSeconds = 0) {
    bgmWanted = false;
    if (!bgmSource) return;
    const stopTime = context.currentTime + fadeSeconds;
    if (fadeSeconds > 0) {
        bgmGain.gain.setValueAtTime(bgmGain.gain.value, context.currentTime);
        bgmGain.gain.linearRampToValueAtTime(0, stopTime);
    }
    bgmSource.stop(stopTime);
    bgmSource = null;
    bgmGain = null;
}

// rate は再生速度（1より大きいと高い音になる）
export function playSound(name, rate = 1) {
    if (!enabled || !context || !buffers[name]) return;
    const source = context.createBufferSource();
    source.buffer = buffers[name];
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = SOUNDS[name].volume;
    source.connect(gain).connect(context.destination);
    source.start();
}

// ゲームの出来事に応じて効果音を鳴らす
export function playEventSounds(events) {
    for (const event of events) {
        switch (event.type) {
            case 'pop':
                // 消える順に少しずつ音を高くする
                playSound('pop', Math.min(1 + event.index * 0.08, 2));
                break;
            case 'chain':
                playSound('chain', Math.min(1 + (event.value - 2) * 0.1, 1.8));
                break;
            case 'land':
                playSound('land', 0.7);
                break;
            default:
                playSound(event.type);
        }
    }
}

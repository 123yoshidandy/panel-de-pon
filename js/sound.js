// 効果音（音源は sounds/ 以下。Kenney の CC0 素材）
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

let context = null;
let enabled = true;
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

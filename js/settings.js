// 設定（難易度・効果音）
export const SETTING_OPTIONS = [
    {
        key: 'difficulty',
        label: '難易度',
        // raiseTime: せり上がりの速さ（1段にかかるフレーム数）、gaugeRate: お邪魔ゲージの溜まる速さ、colorCount: ブロックの色数
        choices: [
            { value: 'practice', label: '練習', raiseTime: 900, gaugeRate: 0, colorCount: 5 }, // お邪魔ブロックが降らない
            { value: 'normal', label: 'ノーマル', raiseTime: 600, gaugeRate: 1, colorCount: 5 },
            { value: 'hard', label: 'ハード', raiseTime: 360, gaugeRate: 1.5, colorCount: 6 }
        ]
    },
    {
        key: 'sound',
        label: '効果音',
        choices: [
            { value: 'on', label: 'ON' },
            { value: 'off', label: 'OFF' }
        ]
    },
    {
        key: 'bgm',
        label: 'BGM',
        choices: [
            { value: 'on', label: 'ON' },
            { value: 'off', label: 'OFF' }
        ]
    }
];

export const DEFAULT_SETTINGS = { difficulty: 'normal', sound: 'on', bgm: 'on' };

const STORAGE_KEY = 'panel-de-pon-settings';

// 選択中の項目の定義を返す
export function getChoice(settings, key) {
    const option = SETTING_OPTIONS.find(o => o.key === key);
    return option.choices.find(c => c.value === settings[key]);
}

// お邪魔ブロックが降る設定か
export function isGarbageEnabled(settings) {
    return getChoice(settings, 'difficulty').gaugeRate > 0;
}

// 保存された設定を読み込む（不正な値は既定値にする）
export function loadSettings() {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
        // 読めなければ既定値を使う
    }
    // 旧設定（せり上がり速度・お邪魔ゲージの速さ・お邪魔ブロックの有無）からの移行
    if (!saved.difficulty && (saved.raiseSpeed || saved.gaugeSpeed || saved.garbage)) {
        const byRaiseSpeed = { slow: 'normal', normal: 'normal', fast: 'hard' };
        saved.difficulty = saved.gaugeSpeed === 'off' || saved.garbage === 'off'
            ? 'practice'
            : byRaiseSpeed[saved.raiseSpeed] ?? 'normal';
    }

    const settings = { ...DEFAULT_SETTINGS };
    for (const option of SETTING_OPTIONS) {
        if (option.choices.some(c => c.value === saved[option.key])) {
            settings[option.key] = saved[option.key];
        }
    }
    return settings;
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // 保存できなくてもゲームは続ける
    }
}

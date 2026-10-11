// 難易度設定
export const SETTING_OPTIONS = [
    {
        key: 'raiseSpeed',
        label: 'せり上がり速度',
        choices: [
            { value: 'slow', label: 'おそい', raiseTime: 900 },
            { value: 'normal', label: 'ふつう', raiseTime: 600 },
            { value: 'fast', label: 'はやい', raiseTime: 360 }
        ]
    },
    {
        key: 'gaugeSpeed',
        label: 'お邪魔ゲージの溜まる速さ',
        choices: [
            { value: 'off', label: 'なし', gaugeRate: 0 }, // お邪魔ブロックが降らない
            { value: 'slow', label: 'おそい', gaugeRate: 2 / 3 },
            { value: 'normal', label: 'ふつう', gaugeRate: 1 },
            { value: 'fast', label: 'はやい', gaugeRate: 1.5 }
        ]
    }
];

export const DEFAULT_SETTINGS = { raiseSpeed: 'normal', gaugeSpeed: 'normal' };

const STORAGE_KEY = 'panel-de-pon-settings';

// 選択中の項目の定義を返す
export function getChoice(settings, key) {
    const option = SETTING_OPTIONS.find(o => o.key === key);
    return option.choices.find(c => c.value === settings[key]);
}

// お邪魔ブロックが降る設定か
export function isGarbageEnabled(settings) {
    return getChoice(settings, 'gaugeSpeed').gaugeRate > 0;
}

// 保存された設定を読み込む（不正な値は既定値にする）
export function loadSettings() {
    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
        // 読めなければ既定値を使う
    }
    // 旧設定（お邪魔ブロックの有無）からの移行
    if (saved.garbage === 'off') saved.gaugeSpeed = 'off';

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

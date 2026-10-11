import { RELIEF, LIGHT_COLORS } from './constants.js';
import { SETTING_OPTIONS, loadSettings, saveSettings } from './settings.js';
import { initSound } from './sound.js';

let titleElement;
let startCallback;
let started = false;

// タイトル画面を表示し、開始操作で onStart(settings) を呼ぶ（何度でも呼べる）
export function showTitle(onStart) {
    startCallback = onStart;
    started = false;
    const settings = loadSettings();

    const blocks = RELIEF.map((relief, i) =>
        `<span class="title-block" style="color: ${LIGHT_COLORS[i]}; --i: ${i}">${relief}</span>`
    ).join('');

    const settingGroups = SETTING_OPTIONS.map(option => `
        <fieldset class="setting">
            <legend>${option.label}</legend>
            ${option.choices.map(choice => `
                <label>
                    <input type="radio" name="${option.key}" value="${choice.value}"
                        ${settings[option.key] === choice.value ? 'checked' : ''}>
                    <span>${choice.label}</span>
                </label>
            `).join('')}
        </fieldset>
    `).join('');

    titleElement = document.createElement('div');
    titleElement.id = 'title-screen';
    titleElement.innerHTML = `
        <div class="title-content">
            <h1 class="title-text">PANEL DE PON</h1>
            <div class="title-blocks">${blocks}</div>
            <div class="settings">${settingGroups}</div>
            <button type="button" class="start-button">スタート</button>
            <div class="controls">
                <div class="control-section">
                    <h3>操作方法</h3>
                    <p>ブロックを左右にドラッグ : 移動</p>
                    <p>フィールドの外を長押し : せり上げ</p>
                    <p>フィールドの外をダブルタップ : 平滑化</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(titleElement);

    titleElement.querySelector('.start-button').addEventListener('click', startGame);
}

function readSettings() {
    const settings = {};
    for (const option of SETTING_OPTIONS) {
        settings[option.key] = titleElement.querySelector(`input[name="${option.key}"]:checked`).value;
    }
    return settings;
}

function startGame() {
    // フェードアウト中に再び押されても二重に開始しない
    if (started) return;
    started = true;
    initSound(); // ユーザー操作の処理中でないと音を鳴らせるようにならない
    const settings = readSettings();
    saveSettings(settings);

    // フェードアウトしてから開始
    const element = titleElement;
    element.style.pointerEvents = 'none';
    element.style.opacity = '0';
    setTimeout(() => {
        element.remove();
        startCallback(settings);
    }, 500);
}

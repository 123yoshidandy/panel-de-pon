import { RELIEF, LIGHT_COLORS } from './constants.js';
import { SETTING_OPTIONS, loadSettings, saveSettings } from './settings.js';
import { initSound } from './sound.js';

let titleElement;
let callbacks;
let started = false;

// タイトル画面を表示する（何度でも呼べる）。
// 「ひとりで遊ぶ」で onSolo(settings)、「オンライン対戦」で onOnline(settings) を呼ぶ
export function showTitle({ onSolo, onOnline }) {
    callbacks = { solo: onSolo, online: onOnline };
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
            <div class="start-buttons">
                <button type="button" class="start-button" data-mode="solo">ひとりで遊ぶ</button>
                <button type="button" class="start-button online" data-mode="online">オンライン対戦</button>
            </div>
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

    for (const button of titleElement.querySelectorAll('.start-button')) {
        button.addEventListener('click', () => start(button.dataset.mode));
    }
}

function readSettings() {
    const settings = {};
    for (const option of SETTING_OPTIONS) {
        settings[option.key] = titleElement.querySelector(`input[name="${option.key}"]:checked`).value;
    }
    return settings;
}

// mode は 'solo'（ひとりで遊ぶ） | 'online'（オンライン対戦）
function start(mode) {
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
        callbacks[mode](settings);
    }, 500);
}

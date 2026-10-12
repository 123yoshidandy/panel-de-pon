import { paintPlayIllustration } from './panel-art.js';
import { SETTING_OPTIONS, loadSettings, saveSettings } from './settings.js';
import { initSound } from './sound.js';
import { showHelp } from './help.js';

let titleElement;
let callbacks;
let started = false;

// タイトル画面を表示する（何度でも呼べる）。
// 「1人プレイ」で onSolo(settings)、「オンライン対戦」で onOnline(settings) を呼ぶ
export function showTitle({ onSolo, onOnline }) {
    callbacks = { solo: onSolo, online: onOnline };
    started = false;
    const settings = loadSettings();

    const fieldset = (option) => `
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
    `;
    // 難易度は1行、効果音と BGM は横に並べる
    const [difficulty, ...toggles] = SETTING_OPTIONS;
    const settingGroups = `${fieldset(difficulty)}<div class="setting-row">${toggles.map(fieldset).join('')}</div>`;

    titleElement = document.createElement('div');
    titleElement.id = 'title-screen';
    titleElement.innerHTML = `
        <div class="title-content">
            <h1 class="title-text">パネルでポン</h1>
            <figure class="title-illustration">
                <canvas aria-label="パネルを指で横に動かし、同じ色を3つそろえて消すところ"></canvas>
                <figcaption>同じ色を縦か横に3つ以上並べると消える</figcaption>
            </figure>
            <div class="settings">${settingGroups}</div>
            <div class="start-buttons">
                <button type="button" class="start-button" data-mode="solo">1人プレイ</button>
                <button type="button" class="start-button online" data-mode="online">オンライン対戦</button>
            </div>
            <button type="button" class="help-link" data-action="help">遊び方・操作方法</button>
        </div>
    `;
    document.body.appendChild(titleElement);
    paintPlayIllustration(titleElement.querySelector('.title-illustration canvas'));

    for (const button of titleElement.querySelectorAll('.start-button')) {
        button.addEventListener('click', () => start(button.dataset.mode));
    }
    titleElement.querySelector('[data-action=help]').addEventListener('click', () => showHelp());
}

function readSettings() {
    const settings = {};
    for (const option of SETTING_OPTIONS) {
        settings[option.key] = titleElement.querySelector(`input[name="${option.key}"]:checked`).value;
    }
    return settings;
}

// mode は 'solo'（1人プレイ） | 'online'（オンライン対戦）
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

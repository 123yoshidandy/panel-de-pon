import { RELIEF, LIGHT_COLORS } from './constants.js';

let titleElement;
let startCallback;

// タイトル画面を表示し、開始操作で onStart を呼ぶ
export function initTitle(onStart) {
    startCallback = onStart;

    const blocks = RELIEF.map((relief, i) =>
        `<span class="title-block" style="color: ${LIGHT_COLORS[i]}; --i: ${i}">${relief}</span>`
    ).join('');

    titleElement = document.createElement('div');
    titleElement.id = 'title-screen';
    titleElement.innerHTML = `
        <div class="title-content">
            <h1 class="title-text">PANEL DE PON</h1>
            <div class="title-blocks">${blocks}</div>
            <div class="start-button">PRESS ENTER TO START</div>
            <div class="controls">
                <div class="control-section">
                    <h3>KEYBOARD</h3>
                    <p>↑↓←→ : Move cursor</p>
                    <p>Z : Swap blocks</p>
                    <p>X : Speed up</p>
                </div>
                <div class="control-section">
                    <h3>MOBILE</h3>
                    <p>Swipe : Swap blocks</p>
                    <p>Touch outside : Speed up</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(titleElement);

    window.addEventListener('keydown', handleTitleKeydown);
    titleElement.addEventListener('click', handleTitleClick);
    titleElement.addEventListener('touchstart', handleTitleClick);
}

function handleTitleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
        startGame();
    }
}

function handleTitleClick(e) {
    e.preventDefault();
    startGame();
}

function startGame() {
    window.removeEventListener('keydown', handleTitleKeydown);
    titleElement.removeEventListener('click', handleTitleClick);
    titleElement.removeEventListener('touchstart', handleTitleClick);

    // フェードアウトしてから開始
    titleElement.style.opacity = '0';
    setTimeout(() => {
        titleElement.remove();
        startCallback();
    }, 500);
}

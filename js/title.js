import { BLOCK_SIZE } from './constants.js';
import { gameState } from './game.js';

let titleElement;
let startCallback;

export function initTitle(onStart) {
    startCallback = onStart;

    // タイトル画面の要素を作成
    titleElement = document.createElement('div');
    titleElement.id = 'title-screen';
    titleElement.innerHTML = `
        <div class="title-content">
            <h1 class="title-text">PANEL DE PON</h1>
            <div class="title-blocks">
                <span class="title-block" style="color: rgb(255,0,0)">♥</span>
                <span class="title-block" style="color: rgb(0,255,0)">●</span>
                <span class="title-block" style="color: rgb(0,0,255)">▼</span>
                <span class="title-block" style="color: rgb(128,0,128)">◆</span>
                <span class="title-block" style="color: rgb(255,255,0)">★</span>
                <span class="title-block" style="color: rgb(0,255,255)">▲</span>
            </div>
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
                    <p>Touch : Move position</p>
                    <p>Touch outside : Speed up</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(titleElement);

    // スタイルを追加
    addTitleStyles();

    // イベントリスナーを追加
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
    // イベントリスナーを削除
    window.removeEventListener('keydown', handleTitleKeydown);
    titleElement.removeEventListener('click', handleTitleClick);
    titleElement.removeEventListener('touchstart', handleTitleClick);

    // タイトル画面をフェードアウト
    titleElement.style.transition = 'opacity 0.5s';
    titleElement.style.opacity = '0';

    setTimeout(() => {
        titleElement.remove();
        if (startCallback) {
            startCallback();
        }
    }, 500);
}

export function showTitle() {
    if (titleElement) {
        titleElement.style.display = 'flex';
        setTimeout(() => {
            titleElement.style.opacity = '1';
        }, 100);
    }
}

function addTitleStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #title-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(black 15%, transparent 16%) 0 0,
                        radial-gradient(black 15%, transparent 16%) 8px 8px,
                        radial-gradient(rgba(255, 255, 255, .1) 15%, transparent 20%) 0 1px,
                        radial-gradient(rgba(255, 255, 255, .1) 15%, transparent 20%) 8px 9px;
            background-color: #282828;
            background-size: 16px 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 1;
        }

        .title-content {
            text-align: center;
            padding: 20px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 20px;
            box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
        }

        .title-text {
            font-family: 'Anton', sans-serif;
            font-size: 48px;
            color: white;
            margin: 20px 0;
            letter-spacing: 4px;
            text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }

        .title-blocks {
            font-size: 48px;
            margin: 30px 0;
            display: flex;
            justify-content: center;
            gap: 15px;
        }

        .title-block {
            display: inline-block;
            animation: bounce 1s infinite;
            animation-delay: calc(var(--i) * 0.1s);
            text-shadow: 0 0 10px currentColor;
        }

        .title-block:nth-child(1) { --i: 0; }
        .title-block:nth-child(2) { --i: 1; }
        .title-block:nth-child(3) { --i: 2; }
        .title-block:nth-child(4) { --i: 3; }
        .title-block:nth-child(5) { --i: 4; }
        .title-block:nth-child(6) { --i: 5; }

        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
        }

        .start-button {
            font-family: 'Anton', sans-serif;
            font-size: 24px;
            color: white;
            margin: 40px 0 30px 0;
            animation: blink 1s infinite;
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
        }

        .controls {
            display: flex;
            gap: 40px;
            justify-content: center;
            color: rgba(255, 255, 255, 0.8);
            font-family: 'Anton', sans-serif;
        }

        .control-section h3 {
            font-size: 18px;
            margin-bottom: 10px;
            color: white;
        }

        .control-section p {
            font-size: 14px;
            margin: 5px 0;
            font-family: monospace;
        }

        @media (max-width: 600px) {
            .title-text {
                font-size: 36px;
            }

            .title-blocks {
                font-size: 36px;
            }

            .start-button {
                font-size: 18px;
            }

            .controls {
                flex-direction: column;
                gap: 20px;
            }
        }
    `;
    document.head.appendChild(style);
}
/**
 * パネルとお邪魔ブロックの絵（キャンバスに描く）。フィールド・相手のフィールド・タイトルで使う
 * 一度描いたパネルは、色・大きさ・種類ごとに取っておいて使い回す
 */

import { PANEL_STYLES, GARBAGE_STYLE } from './constants.js';

const sprites = new Map();

// 画面の画素密度（スマホでもぼやけないように、その分細かく描く）
export const pixelRatio = () => Math.min(3, globalThis.devicePixelRatio || 1);

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// 中心 (cx, cy)・大きさ r の記号の形を作る
function markPath(ctx, mark, cx, cy, r) {
    ctx.beginPath();
    switch (mark) {
        case 'heart':
            ctx.moveTo(cx, cy + r * 0.85);
            ctx.bezierCurveTo(cx - r * 1.25, cy + r * 0.05, cx - r * 0.8, cy - r * 1.05, cx, cy - r * 0.4);
            ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.05, cx + r * 1.25, cy + r * 0.05, cx, cy + r * 0.85);
            break;
        case 'circle':
            ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
            break;
        case 'diamond':
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.72, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r * 0.72, cy);
            break;
        case 'star':
            for (let i = 0; i < 10; ++i) {
                const radius = i % 2 ? r * 0.42 : r;
                const angle = -Math.PI / 2 + i * Math.PI / 5;
                ctx.lineTo(cx + Math.cos(angle) * radius, cy + r * 0.08 + Math.sin(angle) * radius);
            }
            break;
        case 'triangle':
            ctx.moveTo(cx, cy - r * 0.85);
            ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
            ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
            break;
        case 'triangleDown':
            ctx.moveTo(cx, cy + r * 0.85);
            ctx.lineTo(cx + r * 0.95, cy - r * 0.75);
            ctx.lineTo(cx - r * 0.95, cy - r * 0.75);
            break;
    }
    ctx.closePath();
}

// (0, 0) から幅 w・高さ h の、縁が立体になった板を描く（左上の縁は明るく、右下の縁は暗い）
function paintSlab(ctx, w, h, unit, style) {
    const radius = unit * 0.08;
    const edge = unit * 0.08;
    // 外側：右下の暗い縁
    ctx.fillStyle = style.deep;
    roundedRect(ctx, 0, 0, w, h, radius);
    ctx.fill();
    // 左上の明るい縁（右下へ少しずらして、暗い縁を残す）
    ctx.save();
    roundedRect(ctx, 0, 0, w, h, radius);
    ctx.clip();
    ctx.fillStyle = style.light;
    ctx.fillRect(0, 0, w - edge, h - edge);
    ctx.restore();
    // 面（上が明るく下が濃い）
    const face = ctx.createLinearGradient(0, edge, 0, h - edge);
    face.addColorStop(0, mix(style.base, style.light, 0.18));
    face.addColorStop(0.5, style.base);
    face.addColorStop(1, mix(style.base, style.deep, 0.25));
    ctx.fillStyle = face;
    roundedRect(ctx, edge, edge, w - edge * 2, h - edge * 2, radius * 0.6);
    ctx.fill();
}

// 2つの色（#rrggbb）を t の割合で混ぜる
function mix(a, b, t) {
    const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

// 記号を大きく描く（鮮やかな色で塗り、濃い色で縁取り、左上に弱いつや）
function paintMark(ctx, size, style) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.34;
    markPath(ctx, style.mark, cx, cy, r);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.05;
    ctx.strokeStyle = style.deep;
    ctx.stroke();
    ctx.fillStyle = style.symbol;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const gloss = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.2);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gloss.addColorStop(0.45, 'rgba(255, 255, 255, 0.1)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();
}

// パネル1枚を ctx の (0, 0) から size × size で描く
function paintPanel(ctx, color, size, variant = 'normal') {
    const style = PANEL_STYLES[color];
    paintSlab(ctx, size, size, size, style);
    paintMark(ctx, size, style);
    if (variant === 'flash' || variant === 'faded') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = variant === 'flash' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
    }
}

function createSprite(color, size, variant) {
    const ratio = pixelRatio();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(size * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    paintPanel(ctx, color, size, variant);
    return canvas;
}

// パネルの絵。variant: 'normal' | 'flash'（光っている）| 'faded'（弾ける直前）
export function panelSprite(color, size, variant = 'normal') {
    const key = `${color}:${size}:${variant}:${pixelRatio()}`;
    if (!sprites.has(key)) sprites.set(key, createSprite(color, size, variant));
    return sprites.get(key);
}

// ctx の (px, py) に、幅 width・高さ height マスのお邪魔ブロックを描く（1マス size px）
export function drawGarbage(ctx, size, px, py, width, height, flash = false) {
    ctx.save();
    ctx.translate(px, py);
    paintSlab(ctx, width * size, height * size, size, GARBAGE_STYLE);
    // 各マスに小さなくぼみを並べる
    for (let row = 0; row < height; ++row) {
        for (let col = 0; col < width; ++col) {
            const cx = (col + 0.5) * size;
            const cy = (row + 0.5) * size;
            ctx.fillStyle = GARBAGE_STYLE.deep;
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = GARBAGE_STYLE.light;
            ctx.beginPath();
            ctx.arc(cx + size * 0.02, cy + size * 0.02, size * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (flash) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        roundedRect(ctx, 0, 0, width * size, height * size, size * 0.1);
        ctx.fill();
    }
    ctx.restore();
}

// ===== タイトルの「遊び方」の絵 =====

// 指の形（指先が (x, y)。右へなぞっている向き）
function paintFinger(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#ffe0c8';
    ctx.strokeStyle = '#c98d6b';
    ctx.lineWidth = s * 0.06;
    // 人差し指と、手の甲
    roundedRect(ctx, -s * 0.22, -s * 0.05, s * 0.44, s * 1.25, s * 0.22);
    ctx.fill();
    ctx.stroke();
    roundedRect(ctx, -s * 0.5, s * 0.75, s * 1.05, s * 0.9, s * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe0c8';
    ctx.fillRect(-s * 0.19, s * 0.7, s * 0.38, s * 0.15);
    // 爪
    ctx.fillStyle = '#fff3ea';
    roundedRect(ctx, -s * 0.13, s * 0.03, s * 0.26, s * 0.3, s * 0.12);
    ctx.fill();
    ctx.restore();
}

// 動きを示す矢印（(x1, y) から (x2, y) へ。先が x2）
function paintArrow(ctx, x1, x2, y, s) {
    const dir = Math.sign(x2 - x1);
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = s * 0.14;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = s * 0.15;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2 - dir * s * 0.25, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y);
    ctx.lineTo(x2 - dir * s * 0.38, y - s * 0.28);
    ctx.lineTo(x2 - dir * s * 0.38, y + s * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// 弾ける光（小さな四方の星）
function paintSparkle(ctx, x, y, r) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowBlur = r;
    ctx.beginPath();
    for (let i = 0; i < 8; ++i) {
        const radius = i % 2 ? r * 0.25 : r;
        const angle = -Math.PI / 2 + i * Math.PI / 4;
        ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// プレイ中の様子の絵（canvas の表示の大きさに合わせて描く）。
// 右にあった黄色のパネルを指で左へ動かして、横に3つそろえたところ（そろったパネルは光っている）
export function paintPlayIllustration(canvas) {
    const ratio = pixelRatio();
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);

    // 6列 × 4段の小さなフィールド（色の番号。-1 は空き）
    const rows = [
        [-1, -1, 4, -1, -1, -1],
        [2, -1, 1, 4, -1, 2],
        [1, 3, 3, 3, 0, 4],
        [4, 2, 0, 1, 2, 1]
    ];
    const matched = (x, y) => y === 2 && x >= 1 && x <= 3;
    const size = Math.floor(Math.min(width / 6.6, height / 4.6));
    const left = (width - size * 6) / 2;
    const top = (height - size * 4) / 2;

    // フィールドの地
    ctx.fillStyle = '#1b1462';
    roundedRect(ctx, left - size * 0.15, top - size * 0.15, size * 6.3, size * 4.3, size * 0.2);
    ctx.fill();

    rows.forEach((row, y) => row.forEach((color, x) => {
        if (color < 0) return;
        ctx.save();
        ctx.translate(left + x * size, top + y * size);
        paintPanel(ctx, color, size, matched(x, y) ? 'flash' : 'normal');
        ctx.restore();
    }));

    // そろった3つを光る枠で囲む
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = size * 0.08;
    ctx.shadowColor = 'rgba(255, 240, 150, 0.9)';
    ctx.shadowBlur = size * 0.3;
    roundedRect(ctx, left + size, top + size * 2, size * 3, size, size * 0.12);
    ctx.stroke();
    ctx.restore();
    paintSparkle(ctx, left + size * 1.1, top + size * 2.05, size * 0.3);
    paintSparkle(ctx, left + size * 3.85, top + size * 1.95, size * 0.24);

    // 右の列から左へ動かした矢印と、パネルを押さえている指
    paintArrow(ctx, left + size * 4.75, left + size * 3.75, top + size * 1.7, size);
    paintFinger(ctx, left + size * 3.55, top + size * 2.55, size);
}

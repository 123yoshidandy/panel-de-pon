/**
 * パネルとお邪魔ブロックの絵（キャンバスに描く）。フィールド・相手のフィールド・タイトルで使う
 * 一度描いた絵は、色・大きさ・種類ごとに取っておいて使い回す
 */

import { PANEL_STYLES, GARBAGE_STYLE } from './constants.js';

const sprites = new Map();

// 画面の画素密度（スマホでもぼやけないように、その分大きく描く）
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
            ctx.moveTo(cx, cy + r * 0.9);
            ctx.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.75, cy - r * 1.05, cx, cy - r * 0.4);
            ctx.bezierCurveTo(cx + r * 0.75, cy - r * 1.05, cx + r * 1.3, cy, cx, cy + r * 0.9);
            break;
        case 'circle':
            ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
            break;
        case 'diamond':
            ctx.moveTo(cx, cy - r);
            ctx.lineTo(cx + r * 0.75, cy);
            ctx.lineTo(cx, cy + r);
            ctx.lineTo(cx - r * 0.75, cy);
            break;
        case 'star':
            for (let i = 0; i < 10; ++i) {
                const radius = i % 2 ? r * 0.45 : r;
                const angle = -Math.PI / 2 + i * Math.PI / 5;
                ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * 1.02 + r * 0.08);
            }
            break;
        case 'triangle':
            ctx.moveTo(cx, cy - r * 0.9);
            ctx.lineTo(cx + r * 0.95, cy + r * 0.75);
            ctx.lineTo(cx - r * 0.95, cy + r * 0.75);
            break;
        case 'drop':
            ctx.moveTo(cx, cy - r);
            ctx.bezierCurveTo(cx + r * 0.2, cy - r * 0.5, cx + r * 0.85, cy, cx + r * 0.8, cy + r * 0.35);
            ctx.arc(cx, cy + r * 0.3, r * 0.8, 0.06, Math.PI - 0.06);
            ctx.bezierCurveTo(cx - r * 0.85, cy, cx - r * 0.2, cy - r * 0.5, cx, cy - r);
            break;
    }
    ctx.closePath();
}

// size × size の中に、角の丸いつやのある板を描く
function paintCandy(ctx, size, style, { width = size, height = size } = {}) {
    const inset = size * 0.04;
    const radius = size * 0.24;
    const w = width - inset * 2;
    const h = height - inset * 2;
    // 下の影（厚み）
    ctx.fillStyle = style.deep;
    roundedRect(ctx, inset, inset + size * 0.05, w, h - size * 0.05, radius);
    ctx.fill();
    // 本体（上が明るく下が濃い）
    const body = ctx.createLinearGradient(0, inset, 0, inset + h);
    body.addColorStop(0, style.light);
    body.addColorStop(0.45, style.base);
    body.addColorStop(1, style.base);
    ctx.fillStyle = body;
    roundedRect(ctx, inset, inset, w, h - size * 0.07, radius);
    ctx.fill();
    // つや
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    roundedRect(ctx, inset + size * 0.12, inset + size * 0.08, w - size * 0.24, size * 0.2, size * 0.1);
    ctx.fill();
}

function createSprite(color, size, variant) {
    const ratio = pixelRatio();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(size * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const style = PANEL_STYLES[color];
    paintCandy(ctx, size, style);
    // 白い記号（少し濃い色の縁取り）
    const r = size * 0.24;
    markPath(ctx, style.mark, size / 2, size * 0.47, r);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = style.deep;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (variant === 'flash') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(0, 0, size, size);
    } else if (variant === 'faded') {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(0, 0, size, size);
    }
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
    paintCandy(ctx, size, GARBAGE_STYLE, { width: width * size, height: height * size });
    // 中央に小さな玉を並べる（各段に1列）
    ctx.fillStyle = GARBAGE_STYLE.deep;
    for (let row = 0; row < height; ++row) {
        const cy = (row + 0.5) * size;
        for (let col = 0; col < width; ++col) {
            ctx.beginPath();
            ctx.arc((col + 0.5) * size, cy, size * 0.09, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (flash) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        roundedRect(ctx, 0, 0, width * size, height * size, size * 0.24);
        ctx.fill();
    }
    ctx.restore();
}

// タイトルなどに置く、パネル1枚の画像（data URL）
export function panelImageUrl(color, size) {
    return panelSprite(color, size).toDataURL();
}

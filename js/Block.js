import {
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, LEVITATE, CHECK_FLOOR, HANG,
    EMPTY, GARBAGE, BLOCK_SIZE,
    SWAP_FRAME, FALL_FRAME, EXTINCT_FRAME, VANISH_FRAME, VANISH_DELAY_FRAME, LEVITATE_FRAME,
    GARBAGE_HANG_FRAME
} from './constants.js';

// ブロッククラス
export class Block {
    constructor(type = EMPTY) {
        this.count = 0;
        this.type = type;
        this.state = NEUTRAL;
        this.vanishIndex = -1;
        this.vanishNum = 0;
        this.garbage = null; // 所属するお邪魔ブロック（type が GARBAGE のとき）
    }

    setState(st) {
        this.state = st;
        this.count = 0;
    }

    // 空きマスか
    isEmpty() {
        return this.type === EMPTY;
    }

    // 色のついた通常ブロックか
    isColor() {
        return this.type >= 0;
    }

    // 落下中か（お邪魔ブロックはかたまり単位で落下する）
    isFalling() {
        return this.state === FALLING || (this.garbage?.falling ?? false);
    }

    // 空きブロックと見なせるか
    isVacancy() {
        return (this.isEmpty() && this.state === NEUTRAL) || this.state === FALLING;
    }

    // 可視状態
    isVisible() {
        if (this.isEmpty()) return false;
        if (this.state === EXTINCT) return (this.count & 2) !== 0; // 点滅
        return this.state !== VANISH || this.count <= VANISH_FRAME + this.vanishIndex * VANISH_DELAY_FRAME;
    }

    // 入れ替え可能ブロックか
    isSwappable() {
        return this.state === NEUTRAL && this.type !== GARBAGE;
    }

    // 連結可能ブロックか
    isConnectable() {
        return this.isColor() && (this.state === NEUTRAL || (this.state === EXTINCT && this.count === 0));
    }

    // 表示上のXオフセット量
    offsetX() {
        if (this.state === SWAPPING_L) return BLOCK_SIZE;
        if (this.state === SWAPPING_R) return -BLOCK_SIZE;
        return 0;
    }

    // 表示上のYオフセット量
    offsetY() {
        return this.state === FALLING ? this.count * BLOCK_SIZE / FALL_FRAME : 0;
    }

    // 状態更新
    update() {
        switch (this.state) {
            case NEUTRAL:
                return;
            case EXTINCT:
                if (this.count === EXTINCT_FRAME) this.setState(VANISH);
                break;
            case VANISH:
                if (this.count === VANISH_FRAME + this.vanishNum * VANISH_DELAY_FRAME) {
                    this.setState(NEUTRAL);
                    this.type = EMPTY;
                }
                break;
            case FALLING:
                if (this.count === FALL_FRAME) this.setState(MOVEDOWN);
                break;
            case SWAPPING_L:
                // 右側(SWAPPING_R)は左側と一緒に game.js 側で遷移させる
                if (this.count === SWAP_FRAME) this.setState(SWAPPED);
                break;
            case LEVITATE:
                if (this.count === LEVITATE_FRAME) this.setState(CHECK_FLOOR);
                break;
            case HANG:
                if (this.count === GARBAGE_HANG_FRAME) this.setState(CHECK_FLOOR);
                break;
        }
        this.count++;
    }
}

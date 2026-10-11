import {
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, LEVITATE, CHECK_FLOOR,
    EMPTY, BLOCK_SIZE,
    SWAP_FRAME, FALL_FRAME, EXTINCT_FRAME, VANISH_FRAME, VANISH_DELAY_FRAME, LEVITATE_FRAME
} from './constants.js';

// ブロッククラス
export class Block {
    constructor(type = EMPTY) {
        this.count = 0;
        this.type = type;
        this.state = NEUTRAL;
        this.vanishIndex = -1;
        this.vanishNum = 0;
    }

    setState(st) {
        this.state = st;
        this.count = 0;
    }

    // 空きマスか
    isEmpty() {
        return this.type === EMPTY;
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
        return this.state === NEUTRAL;
    }

    // 連結可能ブロックか
    isConnectable() {
        return !this.isEmpty() && (this.state === NEUTRAL || (this.state === EXTINCT && this.count === 0));
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
        }
        this.count++;
    }
}

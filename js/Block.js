import {
    NEUTRAL, EXTINCT, VANISH, FALLING, MOVEDOWN,
    SWAPPING_L, SWAPPING_R, SWAPPED, REVITATE, CHECK_FLOOR,
    SAWP_FRAME, FALL_FRAME, VANISH_FRAME, VANISH_DELAY_FRAME,
    BLOCK_SIZE
} from './constants.js';

// ブロッククラス
export class Block {
    constructor(type) {
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

    // 空きブロックと見なせるか
    isVacancy() {
        return (this.type < 0 && this.state == NEUTRAL) || this.state == FALLING;
    }

    // 可視状態
    isVisible() {
        if (this.type < 0) return false;
        return this.state == EXTINCT ? this.count & 2 : this.state != VANISH || this.count <= VANISH_FRAME + this.vanishIndex * VANISH_DELAY_FRAME;
    }

    // 入れ替え可能ブロックか
    isSwappable() {
        return this.state == NEUTRAL;
    }

    // 連結可能ブロックか
    isConnectable() {
        return this.type >= 0 && (this.state == NEUTRAL || (this.state == EXTINCT && this.count == 0));
    }

    // 表示上のXオフセット量
    offsetX() {
        return this.state == SWAPPING_L || this.state == SWAPPING_R ? (this.state == SWAPPING_L ? 1 : -1) * BLOCK_SIZE : 0;
    }

    // 表示上のYオフセット量
    offsetY() {
        return this.state == FALLING ? this.count * BLOCK_SIZE / FALL_FRAME : 0;
    }

    // 状態更新
    update() {
        switch (this.state) {
            case NEUTRAL:
                return;
            case EXTINCT:
                if (this.count == 50) {
                    this.setState(VANISH);
                }
                break;
            case VANISH:
                if (this.count == VANISH_FRAME + this.vanishNum * VANISH_DELAY_FRAME) {
                    this.setState(NEUTRAL);
                    this.type = -1;
                }
                break;
            case FALLING:
                if (this.count == FALL_FRAME) this.setState(MOVEDOWN);
                break;
            case SWAPPING_L:
                if (this.count == SAWP_FRAME) this.setState(SWAPPED);
                break;
            case REVITATE:
                if (this.count == 8) this.setState(CHECK_FLOOR);
                break;
        }
        this.count++;
    }
}
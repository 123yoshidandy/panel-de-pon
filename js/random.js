// シード付きの乱数（対戦相手と同じブロックの並びにするため）

// 32ビットのシードから 0 以上 1 未満の乱数を返す関数を作る（mulberry32）
export function createRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createSeed() {
    return Math.floor(Math.random() * 4294967296);
}

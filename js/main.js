var tableElement = document.getElementById("field_table");

const HEIGHT = 12;
const WIDTH = 6;

var count = 0;
var cells = [];
var next_cells = [];
var hold_cells = [];
var cursol = null;
var isEnd = false;

// ブロックのパターン
var blocks = ["c", "y", "p", "g", "r"];

// キーボードイベントを監視する
document.addEventListener("keydown", onKeyDown);

init();
var timer = setInterval(function () {
    count++;
    document.getElementById("time_text").textContent = "time: " + count;
    document.getElementById("time_text").textContent = cursol.x + ", " + cursol.y;
    if (isEnd) {
        clearInterval(timer);
        // alert("Game Over");
        return;    
    }
    if (count % 10 == 0) {
        raiseBlock();
    }
}, 200);

/* -------------------- ここから関数宣言  -------------------- */

function init() {
    for (var row = 0; row < HEIGHT; row++) {
        var tr = document.createElement("tr");
        for (var col = 0; col < WIDTH; col++) {
            var td = document.createElement("td");
            tr.appendChild(td);
        }
        tableElement.appendChild(tr);
    }

    var td_array = document.getElementsByTagName("td");
    var index = 0;
    for (var row = 0; row < HEIGHT; row++) {
        cells.push([]); // 配列のそれぞれの要素を配列にする（2次元配列にする）
        for (var col = 0; col < WIDTH; col++) {
            cells[row].push(td_array[index]);
            index++;
        }
    }

    cursol = {
        x: 0,
        y: 0
    }
    cells[0][0].style.border = "5px #808080 solid";
    cells[0][1].style.border = "5px #808080 solid";
}

function fallBlocks() {
    var result = move(1, 0);
    if (!result) { // 移動できない≒接地したとき
        activeBlock = null;
        isHold = false;
    }
}

function countBlocks(x, y, dx, dy, className) {
    x += dx;
    y += dy;
    if (0 <= x < WIDTH && 0 < y <= HEIGHT && cells[y][x].className == className) {
        return 1 + countBlocks(x, y, dx, dy, className);
    } else {
        return 0;
    }
}

function deleteBlock() {
    deleteBlocks = [];
    for (var row = 0; row < HEIGHT; row++) {
        for (var col = 0; col < WIDTH; col++) {
            
            if (cells[row][col].className === "") {
                canDelete = false;
            }
        }

        if (canDelete) {
            for (var downRow = row - 1; downRow >= 0; downRow--) {  // ★サイト間違ってる
                for (var col = 0; col < WIDTH; col++) {
                    cells[downRow + 1][col].className = cells[downRow][col].className;
                    cells[downRow][col].className = "";
                }
            }
            row++; // 複数行の削除のために同じ行をもう一度チェック
        }
    }
}

function raiseBlock() {
    // for (var col = 0; col < WIDTH; col++) {
    //     if (cells[0][col].class != null) {
    //         isEnd = true;
    //         return;
    //     }
    // }

    for (var row = 0; row < HEIGHT - 1; row++) {
        for (var col = 0; col < WIDTH; col++) {
            cells[row][col].className = cells[row + 1][col].className;
        }
    }

    for (var col = 0; col < WIDTH; col++) {
        var newBlock = blocks[Math.floor(Math.random() * blocks.length)];
        cells[HEIGHT - 1][col].className = newBlock;    
    }
}

function onKeyDown(event) {
    if (event.keyCode === 37) { // "←"
        move(0, -1);
    } else if (event.keyCode === 38) { // "↑"
        move(-1, 0);
    } else if (event.keyCode === 39) { // "→"
        move(0, 1);
    } else if (event.keyCode === 40) { // "↓"
        move(1, 0);
    } else if (event.keyCode === 16) { // "Shift"
        swap();
    }
}

function move(dy, dx) {
    cells[cursol.y][cursol.x].style.border = "0px solid";
    cells[cursol.y][cursol.x + 1].style.border = "0px solid";

    cursol.x = Math.max(Math.min(cursol.x + dx, WIDTH - 2), 0);
    cursol.y = Math.max(Math.min(cursol.y + dy, HEIGHT - 1), 0);

    cells[cursol.y][cursol.x].style.border = "5px #808080 solid";
    cells[cursol.y][cursol.x + 1].style.border = "5px #808080 solid";
}

function swap() {
    var temp = cells[cursol.y][cursol.x].className;
    cells[cursol.y][cursol.x].className = cells[cursol.y][cursol.x + 1].className;
    cells[cursol.y][cursol.x + 1].className = temp;
}


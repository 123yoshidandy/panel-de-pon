var tableElement = document.getElementById("field_table");

const HEIGHT = 12;
const WIDTH = 6;
const COUNT_MAX = 3;

var time = 0;
var cells = [];
var cursol = null;
var startX = 0;
var moveX = 0;
var isEnd = false;

// ブロックのパターン
var blocks = ["c", "y", "p", "g", "r"];

// キーボードイベントを監視する
document.addEventListener("keydown", onKeyDown);

init();
var timer = setInterval(function () {
    time++;
    document.getElementById("time_text").textContent = "time: " + time;
    document.getElementById("time_text").textContent = cursol.x + ", " + cursol.y;
    if (isEnd) {
        clearInterval(timer);
        alert("Game Over");
        return;    
    }
    if (time % 10 == 0) {
        raiseBlock();
    }
}, 100);

/* -------------------- ここから関数宣言  -------------------- */

function init() {
    for (var row = 0; row < HEIGHT; row++) {
        var tr = document.createElement("tr");
        for (var col = 0; col < WIDTH; col++) {
            var td = document.createElement("td");
            td.draggable = true;

            if(document.addEventListener){
                td.addEventListener("dragend" , onDragEnd);
                td.addEventListener("touchstart" , onTouchStart);
                td.addEventListener("touchmove" , onTouchMove);
                td.addEventListener("touchend" , onTouchEnd);
            }else if(document.attachEvent){
                td.attachEvent("dragend" , onDragEnd);
                td.attachEvent("touchstart" , onTouchStart);
                td.attachEvent("touchmove" , onTouchMove);
                td.attachEvent("touchend" , onTouchEnd);
            }
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

function deleteBlock() {
    deleteBlocks = [];
    for (var y = 0; y < HEIGHT; y++) {
        for (var x = 0; x < WIDTH; x++) {

            var color = cells[y][x].className;
            if (color != "") {
                var count = Math.max(
                    1 + countBlock(x, y, 1,  0, color) + countBlock(x, y, -1,  0, color),
                    1 + countBlock(x, y, 0,  1, color) + countBlock(x, y,  0, -1, color)
                )
    
                if (count >= COUNT_MAX) {
                    deleteBlocks.push([x, y]);
                }
            }
        }
    }

    for (var point of deleteBlocks) {
        cells[point[1]][point[0]].className = "";
    }

    for (var point of deleteBlocks) {
        fallBlock(point[0], point[1]);
    }
}

function countBlock(x, y, dx, dy, color) {
    x += dx;
    y += dy;
    if (0 <= x && x < WIDTH && 0 <= y && y < HEIGHT && cells[y][x].className == color) {
        return 1 + countBlock(x, y, dx, dy, color);
    } else {
        return 0;
    }
}

function fallBlock(col, row) {
    for (var y = row; y >= 1; y--) {
        cells[y][col].className = cells[y - 1][col].className;
    }
    cells[0][col].className = "";
    deleteBlock();
}

function raiseBlock() {
    for (var col = 0; col < WIDTH; col++) {
        if (cells[0][col].className != "") {
            isEnd = true;
            return;
        }
    }

    for (var row = 0; row < HEIGHT - 1; row++) {
        for (var col = 0; col < WIDTH; col++) {
            cells[row][col].className = cells[row + 1][col].className;
        }
    }

    for (var col = 0; col < WIDTH; col++) {
        var newBlock = blocks[Math.floor(Math.random() * blocks.length)];
        cells[HEIGHT - 1][col].className = newBlock;    
    }

    deleteBlock();
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
        swap(1);
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

function swap(dx) {
    var temp = cells[cursol.y][cursol.x].className;
    cells[cursol.y][cursol.x].className = cells[cursol.y][cursol.x + dx].className;
    cells[cursol.y][cursol.x + dx].className = temp;

    deleteBlock();
    if (cells[cursol.y][cursol.x].className == "") {
        fallBlock(cursol.x, cursol.y);
    }
    if (cells[cursol.y][cursol.x + dx].className == "") {
        fallBlock(cursol.x + dx, cursol.y);
    }
}

function onDragEnd(event) {
    var x = event.target.cellIndex;
    var y = event.target.parentElement.rowIndex;
    if (event.offsetX >= 0 && x < WIDTH - 1) {
        cursol.x = x;
        cursol.y = y;
        swap(1);
    } else if (event.offsetX < 0 && x > 0) {
        cursol.x = x;
        cursol.y = y;
        swap(-1);
    }
}

function onTouchStart(event) {
    startX = event.touches[0].pageX;
    var x = event.target.cellIndex;
    var y = event.target.parentElement.rowIndex;

    cells[cursol.y][cursol.x].style.border = "0px solid";
    cells[0][1].style.border = "0px solid";

    cursol.x = x;
    cursol.y = y;

    cells[y][x].style.border = "5px #808080 solid";
}

function onTouchMove(event) {
    moveX = event.changedTouches[0].pageX;
}

function onTouchEnd(event) {
    if (startX < moveX && cursol.x < WIDTH - 1) {
        swap(1);
    } else if (startX > moveX && cursol.x > 0) {
        swap(-1);
    }
}
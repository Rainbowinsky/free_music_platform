// src/utils/queue.ts
function indexOfSong(queue, songId) {
  if (!songId) return -1;
  return queue.findIndex((item) => item.id === songId);
}
function insertAfterCurrent(queue, currentId, song2) {
  const next = [...queue];
  const existing = indexOfSong(next, song2.id);
  const currentIndex = indexOfSong(next, currentId);
  let insertAt;
  if (existing >= 0) {
    next.splice(existing, 1);
    const shifted = existing < currentIndex ? currentIndex - 1 : currentIndex;
    insertAt = shifted + 1;
  } else {
    insertAt = currentIndex < 0 ? next.length : currentIndex + 1;
  }
  next.splice(insertAt, 0, song2);
  return next;
}
function moveInQueue(queue, from, to) {
  if (from === to) return queue;
  if (from < 0 || to < 0 || from >= queue.length || to >= queue.length) return queue;
  const next = [...queue];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// scripts/_test-queue.mjs
var pass = 0;
var fails = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
  } else {
    fails.push(`${name}
     \u671F\u671B ${e}
     \u5B9E\u9645 ${a}`);
  }
}
var song = (id) => ({ id, name: `\u6B4C${id}`, artist: "A", album: "B", cover: "", src: `/m/${id}.mp3`, duration: 100 });
var ids = (list) => list.map((s) => s.id);
var A = song("a");
var B = song("b");
var C = song("c");
var D = song("d");
var X = song("x");
check("\u627E\u5F97\u5230", indexOfSong([A, B, C], "b"), 1);
check("\u627E\u4E0D\u5230", indexOfSong([A, B, C], "z"), -1);
check("id \u4E3A\u7A7A", indexOfSong([A, B, C], void 0), -1);
check("\u63D2\u5230\u5F53\u524D\u4E4B\u540E", ids(insertAfterCurrent([A, B, C], "b", X)), ["a", "b", "x", "c"]);
check("\u5F53\u524D\u662F\u6700\u540E\u4E00\u9996", ids(insertAfterCurrent([A, B, C], "c", X)), ["a", "b", "c", "x"]);
check("\u6CA1\u6709\u5F53\u524D\u66F2\u76EE\u5219\u8FFD\u52A0\u961F\u5C3E", ids(insertAfterCurrent([A, B], void 0, X)), ["a", "b", "x"]);
check("\u7A7A\u961F\u5217", ids(insertAfterCurrent([], void 0, X)), ["x"]);
check("\u5DF2\u5728\u524D\u9762\u7684\u66F2\u76EE\u5F80\u540E\u632A", ids(insertAfterCurrent([A, B, C, D], "c", B)), ["a", "c", "b", "d"]);
check("\u5DF2\u5728\u540E\u9762\u7684\u66F2\u76EE\u5F80\u524D\u632A", ids(insertAfterCurrent([A, B, C, D], "b", D)), ["a", "b", "d", "c"]);
check("\u7D27\u90BB\u4E0B\u4E00\u9996\u4FDD\u6301\u539F\u4F4D", ids(insertAfterCurrent([A, B, C], "a", B)), ["a", "b", "c"]);
check("\u9996\u5C3E\u4E92\u6362", ids(insertAfterCurrent([A, B, C], "c", A)), ["b", "c", "a"]);
var original = [A, B, C];
insertAfterCurrent(original, "a", X);
check("\u539F\u6570\u7EC4\u672A\u88AB\u6539\u52A8", ids(original), ["a", "b", "c"]);
check("\u5411\u540E\u62D6", ids(moveInQueue([A, B, C, D], 0, 2)), ["b", "c", "a", "d"]);
check("\u5411\u524D\u62D6", ids(moveInQueue([A, B, C, D], 3, 1)), ["a", "d", "b", "c"]);
check("\u539F\u5730\u4E0D\u52A8\u8FD4\u56DE\u539F\u6570\u7EC4", moveInQueue([A, B, C], 1, 1), [A, B, C]);
check("\u8D8A\u754C\u4E0D\u6539\u52A8", ids(moveInQueue([A, B, C], 0, 9)), ["a", "b", "c"]);
check("\u8D1F\u6570\u4E0B\u6807\u4E0D\u6539\u52A8", ids(moveInQueue([A, B, C], -1, 1)), ["a", "b", "c"]);
var dragged = moveInQueue([A, B, C, D], 0, 3);
check("\u62D6\u62FD\u540E\u6309 id \u91CD\u7B97\u5F53\u524D\u4E0B\u6807", indexOfSong(dragged, "a"), 3);
var inserted = insertAfterCurrent([A, B, C, D], "c", A);
check("\u63D2\u961F\u540E\u6309 id \u91CD\u7B97\u5F53\u524D\u4E0B\u6807", indexOfSong(inserted, "c"), 1);
console.log(`\u901A\u8FC7 ${pass} \u9879`);
if (fails.length) {
  console.log(`\u5931\u8D25 ${fails.length} \u9879\uFF1A`);
  for (const f of fails) console.log("  \u2717 " + f);
  process.exit(1);
}

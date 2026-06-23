/* 打包：把 index.html 与 4 个 JS 内联成单个自包含 HTML（iPhone 传一个文件即可离线玩）。
 * 用法：node build.js  → 生成 guandan.html
 */
const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const files = ['src/engine/engine.js', 'src/game/game.js', 'src/ai/ai.js', 'src/ui/ui.js'];
for (const f of files) {
  const code = fs.readFileSync(f, 'utf8');
  const tag = '<script src="' + f + '"></script>';
  if (html.indexOf(tag) < 0) { console.error('未找到 ' + tag); process.exit(1); }
  // 避免内联代码里的 </script> 提前闭合（本项目无，稳妥起见仍转义）
  html = html.replace(tag, '<script>\n' + code.replace(/<\/script>/g, '<\\/script>') + '\n</script>');
}
fs.writeFileSync('guandan.html', html);
console.log('已生成 guandan.html（单文件离线版，' + (html.length / 1024).toFixed(0) + ' KB）');

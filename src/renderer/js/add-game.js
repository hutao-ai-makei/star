/**
 * 打开添加游戏流程：选择 exe → 自动添加 → 可选封面
 */
async function openAddGameDialog() {
  const exePath = await window.electronAPI.selectExeFile();
  if (!exePath) return;

  const game = await window.electronAPI.addGame(exePath);
  if (!game) return;

  games.push(game);
  selectedGameId = game.id;
  renderAll();

  // 可选：选择封面
  const coverPath = await window.electronAPI.selectCoverFile();
  if (coverPath) {
    await window.electronAPI.updateGame(game.id, { coverPath });
    // 重新加载游戏列表以获取最新数据
    games = await window.electronAPI.getGames();
    selectedGameId = game.id;
    renderAll();
  }
}

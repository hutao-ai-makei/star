# Game List Drag-to-Reorder

**Date:** 2026-06-15  
**Status:** approved

## Goal
Replace the up/down ▲▼ buttons in the settings panel game list with drag-and-drop reordering.

## Changes

### 1. Frontend: `src/renderer/js/settings.js`
- Remove `.settings-order-btns` HTML and related event handlers
- Add `draggable="true"` to each `.settings-game-item`
- Add a drag handle (⋮⋮ grip icon) on the left of each item
- Implement drag events: `dragstart`, `dragover`, `drop`, `dragend`
- On drop, call new `reorderGames(orderedIds)` API
- Visual feedback: semi-transparent dragged item, blue insertion indicator line

### 2. Backend: `src/main/store.js`
- New function `reorderGames(orderedIds)` — receives full ordered ID array, assigns sequential `sortOrder` values

### 3. Preload: `src/preload/preload.js`
- New exposed API: `reorderGames: (orderedIds) => ipcRenderer.invoke('reorder-games', orderedIds)`

### 4. Main process: `src/main/index.js`
- New IPC handler: `ipcMain.handle('reorder-games', (_e, orderedIds) => reorderGames(orderedIds))`

### 5. CSS: `src/renderer/css/glass.css`
- Remove `.settings-order-btns` / `.settings-order-btn` styles
- Add `.settings-drag-handle`, `.settings-game-item.dragging`, `.settings-drop-indicator` styles

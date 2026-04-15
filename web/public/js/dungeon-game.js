/* global THREE, gameApi, TownUI */
(function () {
  const COLS = 12;
  const ROWS = 12;
  const CELL = 1;

  const TEX = {
    wall: 'https://arweave.net/OD1cNP8ruEeADeWPzTGeshzPBSqVLH00QRZQGWHQli8',
    floor: 'https://arweave.net/OD1cNP8ruEeADeWPzTGeshzPBSqVLH00QRZQGWHQli8',
    chest: 'https://arweave.net/TmcSXpfuDJPXmh9F3hMvqbgyfVHANpCex7GNnpsmv2M',
    stairs: 'https://arweave.net/BufnZYf3hyWFDo6QJeV3M1YC2UyBqxE75NBl2pBr68c',
    goal: 'https://arweave.net/ol8b1uQnffHbCWTEfwp6A3cTKzZVH3fgQ3sj9xicQw4',
  };

  const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp'];
  /** 本地素材包：0001.gif / 0002.gif …（怪物、物品、地砖通用） */
  const FRAME_EXTS = ['gif', 'png', 'jpg', 'jpeg', 'webp'];

  function pad4(n) {
    const k = Math.max(0, Math.min(9999, Math.floor(Number(n) || 0)));
    return String(k).padStart(4, '0');
  }

  function pushNumberedFrame(out, folder, num) {
    const b = pad4(num);
    FRAME_EXTS.forEach((ext) => out.push(`${folder}/${b}.${ext}`));
  }

  function pushNumberedRange(out, folder, from, to) {
    for (let n = from; n <= to; n++) pushNumberedFrame(out, folder, n);
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isPow2(n) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  /** 适配本地 PNG/JPG 与 Arweave：NPOT 贴图关闭 repeat/mipmap，避免整面黑 */
  function configureTextureForMap(tex, opts) {
    const img = tex.image;
    const w = img && img.width;
    const h = img && img.height;
    const pot = w && h && isPow2(w) && isPow2(h);
    tex.flipY = true;
    tex.generateMipmaps = !!pot;
    tex.minFilter = pot ? THREE.LinearMipMapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (opts && opts.repeatTiles && pot) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const n = opts.repeatTiles;
      tex.repeat.set(n, n);
    } else {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
    }
    tex.needsUpdate = true;
  }

  function configureTextureForSprite(tex) {
    tex.flipY = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1, 1);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }

  /** 物品 48×64 雪碧图：有效像素约在 (16,21) 的 20×20，用于手部武器贴图裁切 */
  const HAND_ITEM_ATLAS = { sheetW: 48, sheetH: 64, cropX: 16, cropY: 21, cropW: 20, cropH: 20 };

  function applyHandItemAtlasCrop(tex) {
    const img = tex.image;
    const iw = img && img.width;
    const ih = img && img.height;
    const A = HAND_ITEM_ATLAS;
    if (iw === A.sheetW && ih === A.sheetH) {
      tex.repeat.set(A.cropW / A.sheetW, A.cropH / A.sheetH);
      tex.offset.set(A.cropX / A.sheetW, (A.sheetH - A.cropY - A.cropH) / A.sheetH);
    } else {
      tex.repeat.set(1, 1);
      tex.offset.set(0, 0);
    }
    tex.flipY = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }

  function findEquippedWeaponByHand(inv, mainHand) {
    return (inv || []).find((x) => {
      if (Number(x.equipped) !== 1 || x.slot !== 'weapon') return false;
      const h = x.weapon_hand;
      if (mainHand) return h == null || h === '' || h === 'main';
      return h === 'off';
    });
  }

  function buildShortestRotationSteps(fromDir, toDir) {
    if (fromDir === toDir) return [];
    const cw = (toDir - fromDir + 4) % 4;
    const ccw = (fromDir - toDir + 4) % 4;
    const steps = [];
    let d = fromDir;
    if (cw <= ccw) {
      for (let i = 0; i < cw; i++) {
        d = (d + 1) % 4;
        steps.push({ nextDir: d, deltaYaw: -Math.PI / 2 });
      }
    } else {
      for (let i = 0; i < ccw; i++) {
        d = (d + 3) % 4;
        steps.push({ nextDir: d, deltaYaw: Math.PI / 2 });
      }
    }
    return steps;
  }

  /**
   * 魔物贴图：有正式编号时只尝试 img/monsters|monster/NNNN.*，再才回退远程，
   * 避免同一 key 这次 0001、下次因 404 落到别的图。
   */
  function urlsMonster(key, remote, catalogEntry, spriteFileIndex) {
    const out = [];
    const n = spriteFileIndex != null ? Math.floor(Number(spriteFileIndex)) : 0;
    if (n > 0) {
      pushNumberedFrame(out, 'img/monsters', n);
      pushNumberedFrame(out, 'img/monster', n);
      if (remote) out.push(remote);
      return out;
    }
    const alias = catalogEntry && catalogEntry.image;
    const pushKeyFiles = (k) => {
      if (!k) return;
      for (let j = 0; j <= 3; j++) {
        const suffix = j === 0 ? '' : '_' + j;
        IMG_EXT.forEach((e) => {
          out.push(`img/monsters/${k}${suffix}.${e}`);
          out.push(`img/monster/${k}${suffix}.${e}`);
        });
      }
    };
    if (alias) {
      if (String(alias).includes('.')) {
        out.push(`img/monsters/${alias}`);
        out.push(`img/monster/${alias}`);
      } else {
        pushKeyFiles(alias);
      }
    }
    pushKeyFiles(key);
    if (remote) out.push(remote);
    return out;
  }

  /** 宝箱仅用 items：0000、0002、0003、0004 四张，按序号轮换 */
  const CHEST_ITEM_FRAMES = [0, 2, 3, 4];

  function urlsChestVariant(chestIndex) {
    const v = CHEST_ITEM_FRAMES[Math.max(0, chestIndex) % CHEST_ITEM_FRAMES.length];
    const out = [];
    pushNumberedFrame(out, 'img/items', v);
    out.push(TEX.chest);
    return out;
  }

  /** 楼梯/传送门固定使用 tiles/0000.*（编号 0 → 0000） */
  function urlsPortalStairs() {
    const out = [];
    pushNumberedFrame(out, 'img/tiles', 0);
    out.push(TEX.stairs);
    return out;
  }

  /** 每 10 层一组：1–10 → 地1/墙2/顶3，11–20 → 4/5/6…；编号按周期取模循环 */
  const TILE_TRIPLE_PERIOD = 9996;

  function tileIndicesForFloor(floor) {
    const f = Math.max(1, Math.floor(Number(floor) || 1));
    const tier = Math.floor((f - 1) / 10);
    const base = 1 + ((tier * 3) % TILE_TRIPLE_PERIOD);
    return { floor: base, wall: base + 1, ceiling: base + 2 };
  }

  function urlsTileSingle(num, fallbackUrl) {
    const out = [];
    const n = Math.max(0, Math.min(9999, Math.floor(Number(num) || 0)));
    pushNumberedFrame(out, 'img/tiles', n);
    if (fallbackUrl) out.push(fallbackUrl);
    return out;
  }

  function chainLoadTexture(loader, urls, mat, repeatTiles) {
    let i = 0;
    function next() {
      if (i >= urls.length) return;
      const u = urls[i++];
      loader.load(
        u,
        (tex) => {
          configureTextureForMap(tex, { repeatTiles: repeatTiles || 0 });
          mat.map = tex;
          mat.needsUpdate = true;
        },
        undefined,
        next
      );
    }
    next();
  }

  function collectDungeonPreloadUrls() {
    const seen = Object.create(null);
    const list = [];
    function add(u) {
      if (!u || typeof u !== 'string') return;
      if (seen[u]) return;
      seen[u] = 1;
      list.push(u);
    }
    Object.keys(TEX).forEach((k) => add(TEX[k]));
    Object.keys(monsterCatalog || {}).forEach((rk) => {
      const def = monsterCatalog[rk];
      if (!def) return;
      if (def.sprite) add(def.sprite);
      if (def.image && String(def.image).includes('.')) {
        add('img/monsters/' + def.image);
        add('img/monster/' + def.image);
      }
    });
    for (let seg = 0; seg < 16; seg++) {
      const ti = tileIndicesForFloor(1 + seg * 10);
      urlsTileSingle(ti.wall, TEX.wall).forEach(add);
      urlsTileSingle(ti.floor, TEX.floor).forEach(add);
      urlsTileSingle(ti.ceiling, TEX.wall).forEach(add);
    }
    const chestPreload = [];
    CHEST_ITEM_FRAMES.forEach((v) => pushNumberedFrame(chestPreload, 'img/items', v));
    chestPreload.forEach(add);
    add(TEX.chest);
    urlsPortalStairs().forEach(add);
    const seenMonsterN = Object.create(null);
    Object.keys(monsterSpriteIndexByKey || {}).forEach((rk) => {
      const num = monsterSpriteIndexByKey[rk];
      if (num == null || num < 1 || seenMonsterN[num]) return;
      seenMonsterN[num] = 1;
      const mtmp = [];
      pushNumberedFrame(mtmp, 'img/monsters', num);
      pushNumberedFrame(mtmp, 'img/monster', num);
      mtmp.forEach(add);
    });
    return list;
  }

  /** 并发预加载图片（含 404），解码进浏览器缓存供 Three.TextureLoader 复用 */
  function preloadImageUrls(urls, onProgress) {
    const total = urls.length;
    const concurrency = 8;
    if (!total) {
      onProgress(1);
      return Promise.resolve();
    }
    let done = 0;
    let nextIndex = 0;
    return new Promise((resolve) => {
      function bump() {
        done++;
        onProgress(Math.min(1, done / total));
        if (done >= total) resolve();
      }
      function startNext() {
        if (nextIndex >= total) return;
        const url = urls[nextIndex++];
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const fin = () => {
          bump();
          startNext();
        };
        img.onload = fin;
        img.onerror = fin;
        img.src = url;
      }
      const n = Math.min(concurrency, total);
      for (let i = 0; i < n; i++) startNext();
    });
  }

  let monsterCatalog = {};
  let monsterSpriteIndexByKey = {};
  /** item_key → image_num（旧背包 image_num=0 时用于地城武器贴图回退） */
  let itemImageNumByKey = {};

  function rebuildMonsterSpriteIndex() {
    monsterSpriteIndexByKey = {};
    const keys = Object.keys(monsterCatalog).sort();
    const used = Object.create(null);
    keys.forEach((k) => {
      const def = monsterCatalog[k];
      const explicit =
        def && def.sprite_index != null
          ? Number(def.sprite_index)
          : def && def.sprite_num != null
            ? Number(def.sprite_num)
            : 0;
      if (explicit > 0 && explicit <= 9999) {
        monsterSpriteIndexByKey[k] = Math.floor(explicit);
        used[monsterSpriteIndexByKey[k]] = true;
      }
    });
    let next = 1;
    keys.forEach((k) => {
      if (monsterSpriteIndexByKey[k] != null) return;
      while (used[next]) next++;
      monsterSpriteIndexByKey[k] = next;
      used[next] = true;
      next++;
    });
  }

  let dungeonMusicConfig = {
    default: ['https://arweave.net/3QaXlF77IDjwKKIsROMldfaE9XWh5cIkM_E6556BreE'],
    ranges: [],
  };

  function pickMusicSourcesForFloor(floor) {
    const ff = Math.max(1, Math.floor(Number(floor) || 1));
    const cfg = dungeonMusicConfig || {};
    const defList = Array.isArray(cfg.default)
      ? cfg.default
      : cfg.default
        ? [cfg.default]
        : [];
    const ranges = Array.isArray(cfg.ranges) ? cfg.ranges : [];
    const hit = ranges.find((r) => {
      const a = Number(r.from_floor);
      const b = Number(r.to_floor);
      return ff >= a && ff <= b;
    });
    if (hit) {
      const s = hit.src != null ? hit.src : hit.sources;
      const arr = Array.isArray(s) ? s : s ? [s] : [];
      if (arr.length) return arr;
    }
    if (ranges.length) {
      const tier = Math.floor((ff - 1) / 10);
      const r = ranges[tier % ranges.length];
      const s = r && (r.src != null ? r.src : r.sources);
      const arr = Array.isArray(s) ? s : s ? [s] : [];
      if (arr.length) return arr;
    }
    return defList.length
      ? defList
      : ['https://arweave.net/3QaXlF77IDjwKKIsROMldfaE9XWh5cIkM_E6556BreE'];
  }

  function urlsItemImageNum(num) {
    const out = [];
    const n = Math.max(0, Number(num) || 0);
    if (n > 0) {
      pushNumberedFrame(out, 'img/items', n);
      pushNumberedFrame(out, 'img/item', n);
    }
    return out;
  }

  const MONSTER_POOL_T1 = ['ginger_grunt', 'snow_spirit', 'candy_slime', 'frost_imp'];
  const MONSTER_POOL_T2 = [
    'ginger_grunt',
    'snow_spirit',
    'candy_slime',
    'frost_imp',
    'coal_golem',
    'elf_archer',
    'carol_wraith',
    'stocking_mimic',
  ];
  const MONSTER_POOL_T3 = [
    'nutcracker',
    'coal_golem',
    'elf_archer',
    'carol_wraith',
    'stocking_mimic',
    'yule_treant',
    'reindeer_fury',
    'candy_slime',
  ];

  function pickMonsterKeyForFloor(floor) {
    const all = Object.keys(monsterCatalog);
    if (!all.length) return null;
    const f = Math.max(1, floor);
    let pool;
    if (f <= 4) pool = MONSTER_POOL_T1;
    else if (f <= 11) pool = MONSTER_POOL_T2;
    else if (f <= 24) pool = MONSTER_POOL_T3;
    else pool = all;
    const valid = pool.filter((k) => monsterCatalog[k]);
    const use = valid.length ? valid : all;
    return use[Math.floor(Math.random() * use.length)];
  }

  function loadJson(url) {
    return fetch(url).then((r) => r.json());
  }

  function scaleMonster(def, floor) {
    const f = Math.max(1, floor);
    const mul = 1 + (f - 1) * 0.11;
    const hp = Math.max(1, Math.round(def.hp * mul + (f - 1) * 2));
    const ac = Math.min(30, Math.round(def.ac + Math.floor((f - 1) / 2)));
    const to_hit = Math.min(20, Math.round(def.to_hit + Math.floor((f - 1) / 3)));
    return {
      hp,
      maxHp: hp,
      ac,
      to_hit,
      damage: def.damage,
      label: def.label || '怪物',
      sprite: def.sprite || TEX.wall,
      desc: def.desc || '',
    };
  }

  function rollDice(expr) {
    const m = String(expr)
      .toLowerCase()
      .trim()
      .match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!m) return 1;
    const n = Math.min(20, Math.max(1, parseInt(m[1], 10)));
    const d = Math.min(100, Math.max(2, parseInt(m[2], 10)));
    let sum = m[3] ? parseInt(m[3], 10) : 0;
    for (let i = 0; i < n; i++) sum += 1 + Math.floor(Math.random() * d);
    return Math.max(1, sum);
  }

  function diceExprMinMax(expr) {
    const m = String(expr)
      .toLowerCase()
      .trim()
      .match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!m) return [1, 1];
    const n = Math.min(20, Math.max(1, parseInt(m[1], 10)));
    const d = Math.min(100, Math.max(2, parseInt(m[2], 10)));
    const mod = m[3] ? parseInt(m[3], 10) : 0;
    const lo = Math.max(1, n + mod);
    const hi = Math.max(1, n * d + mod);
    return [lo, hi];
  }

  function generateMaze(cols, rows) {
    const grid = [];
    for (let y = 0; y < rows; y++) {
      grid[y] = [];
      for (let x = 0; x < cols; x++) {
        grid[y][x] = { walls: [true, true, true, true], visited: false };
      }
    }
    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    function carve(x, y) {
      grid[y][x].visited = true;
      const dirs = shuffle([
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !grid[ny][nx].visited) {
          if (dx === 1) {
            grid[y][x].walls[1] = false;
            grid[ny][nx].walls[3] = false;
          } else if (dx === -1) {
            grid[y][x].walls[3] = false;
            grid[ny][nx].walls[1] = false;
          } else if (dy === 1) {
            grid[y][x].walls[2] = false;
            grid[ny][nx].walls[0] = false;
          } else if (dy === -1) {
            grid[y][x].walls[0] = false;
            grid[ny][nx].walls[2] = false;
          }
          carve(nx, ny);
        }
      }
    }
    carve(0, 0);
    grid[rows - 2][cols - 2].walls = [false, false, false, false];
    return grid;
  }

  function dirToFaceCell(px, py, tx, ty) {
    const dx = tx - px;
    const dy = ty - py;
    if (dx === 1) return 1;
    if (dx === -1) return 3;
    if (dy === -1) return 0;
    if (dy === 1) return 2;
    return null;
  }

  /** 与怪格相邻且中间无墙，才允许近战（禁止隔墙互打） */
  function canMeleeFromCell(game, px, py, m) {
    if (!m || m.hp <= 0 || !game.maze) return false;
    if (Math.abs(m.x - px) + Math.abs(m.y - py) !== 1) return false;
    const d = dirToFaceCell(px, py, m.x, m.y);
    if (d == null) return false;
    return !wallBlocks(game.maze, px, py, d);
  }

  function wallBlocks(maze, x, y, dir) {
    return maze[y][x].walls[dir];
  }

  function stepFrom(x, y, dir) {
    if (dir === 0) return { x, y: y - 1, wallIdx: 0 };
    if (dir === 1) return { x: x + 1, y, wallIdx: 1 };
    if (dir === 2) return { x, y: y + 1, wallIdx: 2 };
    return { x: x - 1, y, wallIdx: 3 };
  }

  function monsterAt(game, x, y) {
    return game.monsters.find((m) => m.x === x && m.y === y && m.hp > 0) || null;
  }

  function chestAt(game, x, y) {
    return game.chests.find((c) => c.x === x && c.y === y && !c.opened) || null;
  }

  function bfs(game, startX, startY, goalTest) {
    const key = (x, y) => x + ',' + y;
    const q = [[startX, startY]];
    const prev = Object.create(null);
    prev[key(startX, startY)] = null;
    const cols = COLS;
    const rows = ROWS;
    while (q.length) {
      const [x, y] = q.shift();
      if (goalTest(x, y)) {
        const path = [];
        let cx = x;
        let cy = y;
        while (cx != null) {
          path.push([cx, cy]);
          const p = prev[key(cx, cy)];
          if (!p) break;
          cx = p[0];
          cy = p[1];
        }
        path.reverse();
        return path;
      }
      for (let d = 0; d < 4; d++) {
        if (wallBlocks(game.maze, x, y, d)) continue;
        const nx = d === 1 ? x + 1 : d === 3 ? x - 1 : x;
        const ny = d === 2 ? y + 1 : d === 0 ? y - 1 : y;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const k = key(nx, ny);
        if (prev[k] !== undefined) continue;
        if (monsterAt(game, nx, ny)) continue;
        prev[k] = [x, y];
        q.push([nx, ny]);
      }
    }
    return null;
  }

  /** 与怪相邻且中间无墙时优先打「眼前」挡路的那只 */
  function pickFightMonster(game) {
    const px = game.player.x;
    const py = game.player.y;
    const adj = game.monsters.filter(
      (m) => m.hp > 0 && canMeleeFromCell(game, px, py, m)
    );
    if (!adj.length) return null;
    const fwd = stepFrom(px, py, game.player.dir);
    const blocking = adj.find((m) => m.x === fwd.x && m.y === fwd.y);
    if (blocking) return blocking;
    for (const m of adj) {
      const d = dirToFaceCell(px, py, m.x, m.y);
      if (d != null && d === game.player.dir) return m;
    }
    return adj[0];
  }

  function nearestMonsterAdjacentCells(game) {
    const goals = [];
    game.monsters.forEach((m) => {
      if (m.hp <= 0) return;
      const adj = [
        [m.x + 1, m.y],
        [m.x - 1, m.y],
        [m.x, m.y + 1],
        [m.x, m.y - 1],
      ];
      adj.forEach(([x, y]) => {
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
        if (monsterAt(game, x, y)) return;
        const d = dirToFaceCell(x, y, m.x, m.y);
        if (d == null) return;
        if (wallBlocks(game.maze, x, y, d)) return;
        goals.push([x, y, m]);
      });
    });
    return goals;
  }

  function pickTarget(game) {
    const px = game.player.x;
    const py = game.player.y;
    const fightM = pickFightMonster(game);
    if (fightM) return { type: 'fight', monster: fightM };
    let best = null;
    let bestLen = 1e9;
    for (const [gx, gy, m] of nearestMonsterAdjacentCells(game)) {
      const path = bfs(game, px, py, (x, y) => x === gx && y === gy);
      if (path && path.length < bestLen) {
        bestLen = path.length;
        best = { type: 'path', path, monster: m };
      }
    }
    if (best) return best;
    for (const c of game.chests) {
      if (c.opened) continue;
      const path = bfs(game, px, py, (x, y) => x === c.x && y === c.y);
      if (path && path.length < bestLen) {
        bestLen = path.length;
        best = { type: 'path', path };
      }
    }
    if (best) return best;
    const sx = COLS - 2;
    const sy = ROWS - 2;
    const path = bfs(game, px, py, (x, y) => x === sx && y === sy);
    if (path) return { type: 'path', path };
    return { type: 'idle' };
  }

  function makeTextureFallback(hex, label) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = hex;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff';
    g.font = '10px sans-serif';
    g.fillText(label, 4, 36);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }

  /** 平面默认中心在原点，贴图常偏上；将几何体整体上移半格，使本地 y=0 为「脚底」贴地 */
  const SPRITE_FOOT_CLEARANCE = 0.02;

  function createSpriteFromUrls(scene, urls, scale, feetYOffset, loader) {
    loader.setCrossOrigin('anonymous');
    const mat = new THREE.MeshBasicMaterial({
      map: makeTextureFallback('#8d6e63', '?'),
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
    });
    let i = 0;
    function next() {
      if (i >= urls.length) return;
      const u = urls[i++];
      loader.load(
        u,
        (tex) => {
          configureTextureForSprite(tex);
          mat.map = tex;
          mat.needsUpdate = true;
        },
        undefined,
        next
      );
    }
    next();
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(scale, scale, scale);
    mesh.position.y = feetYOffset != null ? feetYOffset : SPRITE_FOOT_CLEARANCE;
    scene.add(mesh);
    return mesh;
  }

  const DUNGEON_RARITY_ZH = {
    common: '普通',
    uncommon: '优秀',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说',
  };

  function dungeonDiceTier(dice) {
    const m = String(dice || '').match(/^(\d+)d(\d+)/i);
    const p = m ? Math.max(1, parseInt(m[1], 10) * parseInt(m[2], 10)) : 1;
    if (p <= 4) return 1;
    if (p <= 12) return 2;
    if (p <= 30) return 3;
    return 4;
  }

  const Game = {
    state: { inventory: [], player: null },
    mode: 'town',
    floor: 1,
    scene: null,
    camera: null,
    renderer: null,
    maze: null,
    monsters: [],
    chests: [],
    traps: [],
    meshes: [],
    player: { x: 1, y: 1, dir: 0, hp: 20, hpMax: 20 },
    animationState: {
      isAnimating: false,
      type: null,
      startTime: 0,
      duration: 380,
      startPos: null,
      endPos: null,
      startYaw: 0,
      deltaYaw: 0,
    },
    leftHand: null,
    rightHand: null,
    handPhase: 0,
    localLogLines: [],
    combatLock: false,
    strMod: 0,
    dexMod: 0,
    ac: 10,
    weaponDice: '1d4',
    radarLight: null,
    stairsMesh: null,
    weaponHandR: null,
    weaponHandL: null,
    _weaponHandSigR: '',
    _weaponHandSigL: '',
    trapMitigMin: 0,
    trapMitigMax: 0,
    _bootstrapped: false,
    _rotationQueue: [],
    _rotationTargetKey: '',
    _dungeonSheetSig: '',
    _dungeonLoading: false,
    /** 本会话内素材只完整拉取一次；回城再进地城不重复预加载 */
    _dungeonAssetsReady: false,
    _preloadAllPromise: null,
    /** 回城时自增，作废进行中的后台预加载 UI 回调 */
    _dungeonBgPreloadGen: 0,
    /** 进入地城时从 player 快照的战斗数值；击杀同步后由 applyPlayerPayload 刷新 */
    _dungeonCombat: null,

    toast(msg) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove('show'), 2200);
    },

    flash() {
      const f = document.getElementById('flash');
      if (!f) return;
      f.classList.add('on');
      setTimeout(() => f.classList.remove('on'), 120);
    },

    pushLocalLog(text) {
      const el = document.getElementById('local-combat-log');
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      const line = `[${time}] ${text}`;
      this.localLogLines.unshift(line);
      this.localLogLines = this.localLogLines.slice(0, 50);
      if (!el) return;
      el.innerHTML = '';
      this.localLogLines.forEach((l) => {
        const d = document.createElement('div');
        d.className = 'local-log-line';
        d.textContent = l;
        el.appendChild(d);
      });
    },

    getYawForDir(d) {
      if (d === 0) return 0;
      if (d === 1) return -Math.PI / 2;
      if (d === 2) return Math.PI;
      return Math.PI / 2;
    },

    snapCameraToGrid() {
      if (!this.camera) return;
      this.camera.position.set(this.player.x * CELL, CELL * 0.5, this.player.y * CELL);
      this.camera.rotation.set(0, this.getYawForDir(this.player.dir), 0);
      this.camera.rotation.order = 'YXZ';
    },

    ensureCombatFacingMonster(m) {
      if (!m) return;
      if (!canMeleeFromCell(this, this.player.x, this.player.y, m)) return;
      const fd = dirToFaceCell(this.player.x, this.player.y, m.x, m.y);
      if (fd == null) return;
      this._rotationQueue = [];
      this._rotationTargetKey = m.x + ',' + m.y;
      if (this.animationState.isAnimating && this.animationState.type === 'rotate') {
        this.animationState.isAnimating = false;
        this.animationState.type = null;
      }
      this.player.dir = fd;
      this.snapCameraToGrid();
    },

    updateCamera() {
      if (!this.camera) return;
      const s = this.animationState;
      if (!s.isAnimating) {
        this.snapCameraToGrid();
        return;
      }
      const elapsed = performance.now() - s.startTime;
      let t = Math.min(elapsed / s.duration, 1);
      t = easeInOutQuad(t);
      if (s.type === 'move') {
        const x = s.startPos.x + (s.endPos.x - s.startPos.x) * t;
        const z = s.startPos.z + (s.endPos.z - s.startPos.z) * t;
        this.camera.position.set(x, CELL * 0.5, z);
      } else if (s.type === 'rotate') {
        const yaw = s.startYaw + s.deltaYaw * t;
        this.camera.rotation.set(0, yaw, 0);
      }
      this.camera.rotation.order = 'YXZ';
      if (t >= 1) {
        if (s.type === 'rotate') {
          s.isAnimating = false;
          s.type = null;
          this.snapCameraToGrid();
          if (this._rotationQueue && this._rotationQueue.length) {
            const step = this._rotationQueue.shift();
            this.player.dir = step.nextDir;
            s.isAnimating = true;
            s.type = 'rotate';
            s.startTime = performance.now();
            s.duration = 380;
            s.startYaw = this.camera.rotation.y;
            s.deltaYaw = step.deltaYaw;
          }
        } else {
          s.isAnimating = false;
          s.type = null;
          this.snapCameraToGrid();
        }
      }
    },

    createHands() {
      const handX = 0.14;
      const handGeo = new THREE.BoxGeometry(0.1, 0.05, 0.2);
      const handMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      this.leftHand = new THREE.Mesh(handGeo, handMat);
      this.rightHand = new THREE.Mesh(handGeo.clone(), handMat.clone());
      this.leftHand.position.set(-handX, -0.22, -0.48);
      this.rightHand.position.set(handX, -0.22, -0.48);
      this.leftHand.visible = false;
      this.camera.add(this.leftHand);
      this.camera.add(this.rightHand);
      const wGeo = new THREE.PlaneGeometry(1, 1);
      wGeo.translate(0, 0.5, 0);
      const makeWMat = () =>
        new THREE.MeshBasicMaterial({
          map: makeTextureFallback('#37474f', 'W'),
          transparent: true,
          alphaTest: 0.01,
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        });
      const handScale = 0.39;
      this._handViewX = handX;
      this._weaponViewY = -0.3;
      this.weaponHandR = new THREE.Mesh(wGeo, makeWMat());
      this.weaponHandR.renderOrder = 999;
      this.weaponHandR.frustumCulled = false;
      this.weaponHandR.scale.set(handScale, handScale, handScale);
      this.weaponHandR.position.set(handX, this._weaponViewY, -0.48);
      this.weaponHandR.rotation.set(0, 0, 0);
      this.weaponHandR.visible = false;
      this.camera.add(this.weaponHandR);

      this.weaponHandL = new THREE.Mesh(wGeo.clone(), makeWMat());
      this.weaponHandL.renderOrder = 998;
      this.weaponHandL.frustumCulled = false;
      this.weaponHandL.scale.set(-handScale, handScale, handScale);
      this.weaponHandL.position.set(-handX, this._weaponViewY, -0.48);
      this.weaponHandL.rotation.set(0, 0, 0);
      this.weaponHandL.visible = false;
      this.camera.add(this.weaponHandL);
    },

    _syncOneWeaponHand(mesh, w, sigProp) {
      if (!mesh) return;
      let num = w ? Math.max(0, Number(w.image_num) || 0) : 0;
      if (num < 1 && w && w.item_key) {
        num = Math.max(0, Number(itemImageNumByKey[w.item_key]) || 0);
      }
      if (w && num < 1) {
        num = 1;
      }
      const sig = (w ? w.id : '') + ':' + num + ':' + (this.mode || '');
      if (sig === this[sigProp]) return;
      this[sigProp] = sig;
      const canShow = this.mode === 'dungeon' && w && num >= 1;
      if (!canShow) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      const mat = mesh.material;
      const urls = urlsItemImageNum(num);
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      let i = 0;
      const next = () => {
        if (i >= urls.length) return;
        const u = urls[i++];
        loader.load(
          u,
          (tex) => {
            configureTextureForSprite(tex);
            mat.map = tex;
            mat.needsUpdate = true;
          },
          undefined,
          next
        );
      };
      next();
    },

    syncWeaponHandTexture() {
      if (!this.camera) return;
      const inv = this.state.inventory || [];
      const mainW = findEquippedWeaponByHand(inv, true);
      const offW = findEquippedWeaponByHand(inv, false);
      this._syncOneWeaponHand(this.weaponHandR, mainW, '_weaponHandSigR');
      this._syncOneWeaponHand(this.weaponHandL, offW, '_weaponHandSigL');
      let mainNum = 0;
      if (mainW) {
        mainNum = Math.max(0, Number(mainW.image_num) || 0);
        if (mainNum < 1 && mainW.item_key) {
          mainNum = Math.max(0, Number(itemImageNumByKey[mainW.item_key]) || 0);
        }
        if (mainNum < 1) mainNum = 1;
      }
      if (this.rightHand) {
        const showR = !(this.mode === 'dungeon' && mainW && mainNum >= 1 && this.weaponHandR && this.weaponHandR.visible);
        this.rightHand.visible = showR;
      }
      if (this.leftHand) this.leftHand.visible = false;
    },

    cacheDungeonCombatFromPlayer() {
      const p = this.state.player;
      if (!p) return;
      this._dungeonCombat = {
        strMod: Number(p.str_mod) || 0,
        ac: Number(p.ac) || 10,
        weaponDice: p.weapon_dice || '1d4',
      };
    },

    updateHands() {
      if (!this.rightHand) return;
      const wd = String(this.weaponDice || '1d4');
      let c = 0xcccccc;
      if (wd.includes('2d')) c = 0xffd700;
      else if (wd.includes('1d10') || wd.includes('2d6')) c = 0x00c853;
      else if (wd.includes('1d8') || wd.includes('1d6')) c = 0xd42426;
      if (this.rightHand.visible) this.rightHand.material.color.setHex(c);
      const bob = Math.sin(this.handPhase) * 0.02;
      if (this.rightHand.visible) this.rightHand.position.y = -0.22 + bob;
      const hx = this._handViewX != null ? this._handViewX : 0.14;
      const handY = -0.22 + bob;
      const wy = (this._weaponViewY != null ? this._weaponViewY : -0.3) + bob;
      if (this.weaponHandR && this.weaponHandR.visible) {
        this.weaponHandR.position.set(hx, wy, -0.48);
      }
      if (this.weaponHandL && this.weaponHandL.visible) {
        this.weaponHandL.position.set(-hx, wy, -0.48);
      }
      this.handPhase += 0.06;
      this.syncWeaponHandTexture();
    },

    _applyDungeonBgm(floor) {
      const audio = document.getElementById('bgm');
      if (!audio || this.mode !== 'dungeon') return;
      const urls = pickMusicSourcesForFloor(floor);
      if (!urls || !urls.length) return;
      audio.onerror = null;
      let i = 0;
      const tryOne = () => {
        if (i >= urls.length) {
          audio.onerror = null;
          return;
        }
        const u = urls[i++];
        const onOk = () => {
          audio.removeEventListener('loadeddata', onOk);
          audio.onerror = null;
        };
        audio.addEventListener('loadeddata', onOk);
        audio.onerror = () => {
          audio.removeEventListener('loadeddata', onOk);
          tryOne();
        };
        audio.src = u;
        audio.load();
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
      };
      tryOne();
    },

    applyPlayerPayload(data) {
      if (!data || !data.player) return;
      if (data.username) this.state.username = data.username;
      this.state.player = data.player;
      this.state.inventory = data.inventory || [];
      const p = data.player;
      this.player.hpMax = p.hp_max;
      this.player.hp = Math.min(this.player.hp, p.hp_max);
      this.strMod = p.str_mod;
      this.dexMod = p.dex_mod;
      this.ac = p.ac;
      this.weaponDice = p.weapon_dice;
      this.trapMitigMin = Number(p.trap_mitig_min) || 0;
      this.trapMitigMax = Math.max(this.trapMitigMin, Number(p.trap_mitig_max) || 0);
      this._weaponHandSigR = '';
      this._weaponHandSigL = '';
      if (this.mode === 'dungeon') {
        this.cacheDungeonCombatFromPlayer();
      } else {
        this._dungeonCombat = null;
      }
      this.updateDungeonSheet();
      this.syncWeaponHandTexture();
    },

    escapeHtml(t) {
      const d = document.createElement('div');
      d.textContent = t == null ? '' : String(t);
      return d.innerHTML;
    },

    rarityTagHtml(r) {
      const k = String(r || 'common')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');
      const key = k || 'common';
      const z = DUNGEON_RARITY_ZH[key] || String(r || 'common');
      return `<span class="rarity-tag rarity-${key}">${this.escapeHtml(z)}</span>`;
    },

    diceTagHtml(dice) {
      const t = dungeonDiceTier(dice);
      return `<span class="dice-tag dice-tier-${t}">${this.escapeHtml(String(dice || '1d4'))}</span>`;
    },

    updateDungeonSheet() {
      const el = document.getElementById('dungeon-sheet');
      if (!el || this.mode !== 'dungeon') return;
      const p = this.state.player;
      const inv = this.state.inventory || [];
      const peff =
        p &&
        [
          p.level,
          p.xp,
          p.gold,
          p.str_effective ?? p.str,
          p.dex_effective ?? p.dex,
          p.str_mod,
          p.dex_mod,
          this.ac,
          this.weaponDice,
          p.weapon_hit_dmg_min,
          p.weapon_hit_dmg_max,
          p.trap_mitig_min,
          p.trap_mitig_max,
          p.trap_final_dmg_min,
          p.trap_final_dmg_max,
          p.armor_roll_min,
          p.armor_roll_max,
        ].join(':');
      const sig =
        this.floor +
        ':' +
        Math.floor(this.player.hp) +
        ':' +
        (peff || '') +
        ':' +
        inv.map((x) => x.id + ':' + x.equipped + ':' + (x.weapon_hand || '')).join(',');
      if (sig === this._dungeonSheetSig) return;
      this._dungeonSheetSig = sig;
      const slotDefs = [
        { key: 'weapon_main', label: '主手(右)' },
        { key: 'weapon_off', label: '副手(左)' },
        { key: 'armor', label: '护甲' },
        { key: 'ring', label: '戒指' },
        { key: 'boots', label: '鞋' },
      ];
      let equipHtml = '';
      slotDefs.forEach(({ key, label }) => {
        let eq;
        if (key === 'weapon_main') {
          eq = inv.find(
            (x) =>
              Number(x.equipped) === 1 &&
              x.slot === 'weapon' &&
              (x.weapon_hand == null || x.weapon_hand === '' || x.weapon_hand === 'main')
          );
        } else if (key === 'weapon_off') {
          eq = inv.find((x) => Number(x.equipped) === 1 && x.slot === 'weapon' && x.weapon_hand === 'off');
        } else {
          eq = inv.find((x) => Number(x.equipped) === 1 && x.slot === key);
        }
        const name = eq ? this.escapeHtml(eq.label) : '（空）';
        const meta = eq
          ? `${eq.damage_dice ? this.diceTagHtml(eq.damage_dice) + ' · ' : ''}${this.rarityTagHtml(eq.rarity || 'common')}`
          : '';
        equipHtml += `<div class="ds-slot"><div class="ds-slot-label">${label}</div><div>${name}</div>${
          meta ? `<div class="ds-line">${meta}</div>` : ''
        }</div>`;
      });
      const bag = inv.filter((x) => Number(x.equipped) !== 1).slice(0, 16);
      const bagHtml = bag.length
        ? bag
            .map(
              (it) =>
                `<div>${this.escapeHtml(it.label)} · ${this.rarityTagHtml(it.rarity || 'common')}</div>`
            )
            .join('')
        : '<div>（背包空）</div>';
      let attrHtml = '';
      if (p) {
        const fmt = (n) => (Number(n) >= 0 ? '+' : '') + n;
        const N = (x, d) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : d);
        const se = p.str_effective != null ? p.str_effective : p.str;
        const de = p.dex_effective != null ? p.dex_effective : p.dex;
        const ce = p.con_effective != null ? p.con_effective : p.con;
        const smb = p.str_mod_base;
        const dmb = p.dex_mod_base;
        const strNaked = smb != null ? fmt(smb) : fmt(Math.floor((Number(p.str) - 10) / 2));
        const dexNaked = dmb != null ? fmt(dmb) : fmt(Math.floor((Number(p.dex) - 10) / 2));
        const ad = p.armor_dice || '1d4';
        attrHtml = `
          <div class="ds-line">等级 ${p.level} · 经验 ${p.xp} · 金币 ${p.gold}</div>
          <div class="ds-line">生命 ${Math.max(0, Math.floor(this.player.hp))} / ${this.player.hpMax}（上限 ${p.hp_max}）</div>
          <div class="ds-line">STR：基础 ${p.str} → 有效 ${se}，调整值 ${fmt(p.str_mod)}（裸装调整 ${strNaked}）</div>
          <div class="ds-line">DEX：基础 ${p.dex} → 有效 ${de}，调整值 ${fmt(p.dex_mod)}（裸装调整 ${dexNaked}）</div>
          <div class="ds-line">CON：基础 ${p.con} → 有效 ${ce}</div>
          <div class="ds-line">INT ${p.int_stat} · WIS ${p.wis} · CHA ${p.cha}</div>
          <div class="ds-line">有效 AC ${this.ac}</div>
          <div class="ds-line">武器 ${this.diceTagHtml(this.weaponDice)}：骰面 ${N(p.weapon_roll_min, 1)}～${N(p.weapon_roll_max, 1)} · 命中伤害 ${N(p.weapon_hit_dmg_min, 1)}～${N(p.weapon_hit_dmg_max, 1)}（含力量）</div>
          <div class="ds-line">护甲 ${this.diceTagHtml(ad)}：骰面 ${N(p.armor_roll_min, 1)}～${N(p.armor_roll_max, 1)} · 护甲件 AC +${N(p.armor_ac_bonus, 0)}</div>
          <div class="ds-line">陷阱：基础 ${N(p.trap_raw_min, 4)}～${N(p.trap_raw_max, 11)} · 鞋减震 ${N(p.trap_mitig_min, 0)}～${N(p.trap_mitig_max, 0)} · 最终 ${N(p.trap_final_dmg_min, 1)}～${N(p.trap_final_dmg_max, 11)}</div>`;
      }
      el.innerHTML = `
        <h3>角色属性（含装备）</h3>
        ${attrHtml || '<div class="ds-line">—</div>'}
        <h3>当前装备</h3>
        <div class="ds-equip">${equipHtml}</div>
        <h3>背包（未装备，最多显示 16 件）</h3>
        <div class="ds-bag">${bagHtml}</div>
      `;
    },

    clearWorld() {
      if (!this.scene) return;
      this.meshes.forEach((o) => this.scene.remove(o));
      this.meshes = [];
      this.monsters = [];
      this.chests = [];
      this.traps = [];
      this.stairsMesh = null;
    },

    buildFloor(levelIndex) {
      this.clearWorld();
      this._rotationQueue = [];
      this._rotationTargetKey = '';
      this.floor = levelIndex;
      this.maze = generateMaze(COLS, ROWS);
      this.player.x = 1;
      this.player.y = 1;
      this.player.dir = 0;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const wallTex = makeTextureFallback('#5d4037', 'W');
      const floorTex = makeTextureFallback('#3e2723', 'F');
      floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(4, 4);
      const wallH = 1.2;
      const wallMat = new THREE.MeshLambertMaterial({ map: wallTex });
      const floorMat = new THREE.MeshLambertMaterial({ map: floorTex, color: 0x898989 });
      const ceilTex = makeTextureFallback('#1a237e', 'C');
      const ceilingMat = new THREE.MeshLambertMaterial({ map: ceilTex, color: 0x555555 });
      const ti = tileIndicesForFloor(levelIndex);
      chainLoadTexture(loader, urlsTileSingle(ti.wall, TEX.wall), wallMat, 0);
      chainLoadTexture(loader, urlsTileSingle(ti.floor, TEX.floor), floorMat, 4);
      chainLoadTexture(loader, urlsTileSingle(ti.ceiling, TEX.wall), ceilingMat, 2);

      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), floorMat);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(x * CELL, 0, y * CELL);
          this.scene.add(floor);
          this.meshes.push(floor);
          const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), ceilingMat);
          ceiling.rotation.x = Math.PI / 2;
          ceiling.position.set(x * CELL, wallH, y * CELL);
          this.scene.add(ceiling);
          this.meshes.push(ceiling);
          const wg = new THREE.BoxGeometry(CELL, wallH, 0.1);
          const addW = (mesh) => {
            this.scene.add(mesh);
            this.meshes.push(mesh);
          };
          if (this.maze[y][x].walls[0]) {
            const w = new THREE.Mesh(wg, wallMat);
            w.position.set(x * CELL, wallH / 2, y * CELL - CELL / 2);
            addW(w);
          }
          if (this.maze[y][x].walls[1]) {
            const w = new THREE.Mesh(wg, wallMat);
            w.rotation.y = Math.PI / 2;
            w.position.set(x * CELL + CELL / 2, wallH / 2, y * CELL);
            addW(w);
          }
          if (this.maze[y][x].walls[2]) {
            const w = new THREE.Mesh(wg, wallMat);
            w.position.set(x * CELL, wallH / 2, y * CELL + CELL / 2);
            addW(w);
          }
          if (this.maze[y][x].walls[3]) {
            const w = new THREE.Mesh(wg, wallMat);
            w.rotation.y = Math.PI / 2;
            w.position.set(x * CELL - CELL / 2, wallH / 2, y * CELL);
            addW(w);
          }
        }
      }

      const mCount = Math.min(11, 4 + Math.floor(levelIndex / 2) + (levelIndex % 4 === 0 ? 1 : 0));
      const sx = COLS - 2;
      const sy = ROWS - 2;
      for (let i = 0; i < mCount; i++) {
        let x;
        let y;
        do {
          x = Math.floor(Math.random() * COLS);
          y = Math.floor(Math.random() * ROWS);
        } while (
          (x <= 1 && y <= 1) ||
          (x >= COLS - 2 && y >= ROWS - 2) ||
          (x === sx && y === sy) ||
          monsterAt(this, x, y)
        );
        const pick = pickMonsterKeyForFloor(levelIndex);
        const raw = (pick && monsterCatalog[pick]) || {
          hp: 12,
          ac: 11,
          to_hit: 3,
          damage: '1d6',
          sprite: TEX.wall,
          label: '未知魔物',
          desc: '',
        };
        const def = scaleMonster(raw, levelIndex);
        const spriteNum =
          pick && monsterSpriteIndexByKey[pick] != null ? monsterSpriteIndexByKey[pick] : 1;
        const mesh = createSpriteFromUrls(
          this.scene,
          urlsMonster(
            pick || 'unknown',
            raw.sprite || TEX.wall,
            pick ? monsterCatalog[pick] : null,
            spriteNum
          ),
          0.75,
          SPRITE_FOOT_CLEARANCE,
          loader
        );
        mesh.position.set(x * CELL, 0, y * CELL);
        this.monsters.push({
          x,
          y,
          key: pick || 'unknown',
          hp: def.hp,
          maxHp: def.maxHp,
          ac: def.ac,
          to_hit: def.to_hit,
          damage: def.damage,
          label: def.label || '怪物',
          desc: def.desc,
          mesh,
        });
        this.meshes.push(mesh);
      }

      const chestCount = 3;
      for (let i = 0; i < chestCount; i++) {
        let x;
        let y;
        do {
          x = Math.floor(Math.random() * COLS);
          y = Math.floor(Math.random() * ROWS);
        } while (
          (x <= 1 && y <= 1) ||
          (x >= COLS - 2 && y >= ROWS - 2) ||
          (x === sx && y === sy) ||
          monsterAt(this, x, y) ||
          chestAt(this, x, y)
        );
        const mesh = createSpriteFromUrls(this.scene, urlsChestVariant(i), 0.55, SPRITE_FOOT_CLEARANCE, loader);
        mesh.position.set(x * CELL, 0, y * CELL);
        this.chests.push({ x, y, opened: false, mesh });
        this.meshes.push(mesh);
      }

      for (let i = 0; i < 2; i++) {
        let x;
        let y;
        do {
          x = Math.floor(Math.random() * COLS);
          y = Math.floor(Math.random() * ROWS);
        } while (
          (x <= 1 && y <= 1) ||
          (x === sx && y === sy) ||
          monsterAt(this, x, y)
        );
        this.traps.push({ x, y });
      }

      this.stairsMesh = createSpriteFromUrls(this.scene, urlsPortalStairs(), 0.85, SPRITE_FOOT_CLEARANCE, loader);
      this.stairsMesh.position.set(sx * CELL, 0, sy * CELL);
      this.meshes.push(this.stairsMesh);
      this.animationState.isAnimating = false;
      this.animationState.type = null;
      this.snapCameraToGrid();
      this._applyDungeonBgm(levelIndex);
    },

    faceToward(tx, ty) {
      const want = dirToFaceCell(this.player.x, this.player.y, tx, ty);
      if (want == null) return false;
      const tkey = tx + ',' + ty;
      if (this._rotationTargetKey !== tkey) {
        this._rotationTargetKey = tkey;
        this._rotationQueue = [];
        if (this.animationState.isAnimating && this.animationState.type === 'rotate') {
          this.animationState.isAnimating = false;
          this.animationState.type = null;
          this.snapCameraToGrid();
        }
      }
      if (this.player.dir === want && !this.animationState.isAnimating) {
        this._rotationQueue = [];
        return true;
      }
      if (this.animationState.isAnimating || this.combatLock) return false;
      if (!this._rotationQueue.length) {
        if (this.player.dir === want) return true;
        this._rotationQueue = buildShortestRotationSteps(this.player.dir, want);
      }
      if (!this._rotationQueue.length) return true;
      const step = this._rotationQueue.shift();
      this.player.dir = step.nextDir;
      this.animationState = {
        isAnimating: true,
        type: 'rotate',
        startTime: performance.now(),
        duration: 380,
        startYaw: this.camera.rotation.y,
        deltaYaw: step.deltaYaw,
        startPos: null,
        endPos: null,
      };
      return false;
    },

    tryStepToward(tx, ty) {
      const nx = tx;
      const ny = ty;
      const dx = nx - this.player.x;
      const dy = ny - this.player.y;
      let d = null;
      if (dx === 1) d = 1;
      else if (dx === -1) d = 3;
      else if (dy === 1) d = 2;
      else if (dy === -1) d = 0;
      if (d == null) return;
      if (this.player.dir !== d) {
        this.faceToward(nx, ny);
        return;
      }
      if (this.animationState.isAnimating || this.combatLock) return;
      if (wallBlocks(this.maze, this.player.x, this.player.y, d)) return;
      if (monsterAt(this, nx, ny)) return;
      const sx = this.player.x * CELL;
      const sz = this.player.y * CELL;
      const ex = nx * CELL;
      const ez = ny * CELL;
      this.player.x = nx;
      this.player.y = ny;
      this.animationState = {
        isAnimating: true,
        type: 'move',
        startTime: performance.now(),
        duration: 440,
        startPos: { x: sx, z: sz },
        endPos: { x: ex, z: ez },
        startYaw: 0,
        deltaYaw: 0,
      };
      this.onEnterCell(nx, ny);
    },

    async onEnterCell(x, y) {
      if (this.traps.some((t) => t.x === x && t.y === y)) {
        const raw = 4 + Math.floor(Math.random() * 8);
        const lo = this.trapMitigMin;
        const hi = Math.max(lo, this.trapMitigMax);
        const mitig = lo + Math.floor(Math.random() * (hi - lo + 1));
        const dmg = Math.max(1, raw - mitig);
        this.player.hp -= dmg;
        this.toast('陷阱! 基础 ' + raw + ' · 减免 ' + mitig + ' → -' + dmg + ' HP');
        this.pushLocalLog(
          `第${this.floor}层：触发陷阱，基础 ${raw}，鞋减震 ${mitig}，实际失去 ${dmg} 生命`
        );
        this.flash();
        this.traps = this.traps.filter((t) => !(t.x === x && t.y === y));
        if (this.player.hp <= 0) await this.handleDeath();
      }
      const ch = chestAt(this, x, y);
      if (ch && !ch.opened) {
        this.combatLock = true;
        ch.opened = true;
        this.scene.remove(ch.mesh);
        try {
          const data = await gameApi('mint', { type: 'chest', floor: this.floor });
          this.applyPlayerPayload(data);
          const m = data.mint || {};
          const xpg = Number(m.xp_gained) || 0;
          const gdg = Number(m.gold_gained) || 0;
          let msg = `宝箱：+${xpg} 经验 · +${gdg} 金币`;
          if (m.item) msg += ' · 获得「' + m.item.label + '」';
          this.toast(msg);
          this.pushLocalLog(
            `第${this.floor}层：开启宝箱 · +${xpg} 经验 · +${gdg} 金币` +
              (m.item ? ` · 「${m.item.label}」` : '')
          );
          this.player.hp = Math.min(this.player.hp, this.player.hpMax);
        } catch (e) {
          this.toast('同步失败: ' + (e.message || e));
        } finally {
          this.combatLock = false;
        }
      }
      if (x === COLS - 2 && y === ROWS - 2) {
        const next = this.floor + 1;
        this.toast('进入第 ' + next + ' 层…');
        this.pushLocalLog(`抵达楼梯，进入第 ${next} 层`);
        this.buildFloor(next);
      }
    },

    async handleDeath() {
      this.combatLock = true;
      try {
        await gameApi('death', {});
      } catch (_) {
        /* ignore */
      }
      this.toast('倒下… 从第 1 层重新开始');
      this.player.hp = this.player.hpMax;
      this.floor = 1;
      this.pushLocalLog('角色倒下，从第 1 层重新开始');
      this.buildFloor(1);
      this.combatLock = false;
    },

    async fightOnce(m) {
      if (this.combatLock) return;
      this.combatLock = true;
      if (!canMeleeFromCell(this, this.player.x, this.player.y, m)) {
        this.combatLock = false;
        return;
      }
      this.ensureCombatFacingMonster(m);
      const dc = this._dungeonCombat;
      const sm = dc ? dc.strMod : this.strMod;
      const acLocal = dc ? dc.ac : this.ac;
      const wd = dc ? dc.weaponDice : this.weaponDice;
      const atkRoll = Math.floor(Math.random() * 20) + 1 + sm;
      const hit = atkRoll >= m.ac;
      let msg = '';
      if (hit) {
        const dmg = rollDice(wd) + sm;
        m.hp -= Math.max(1, dmg);
        msg = `命中 ${m.label} (-${dmg})`;
      } else {
        msg = '未命中 ' + m.label;
      }
      if (m.hp > 0) {
        const mRoll = Math.floor(Math.random() * 20) + 1 + m.to_hit;
        const mHit = mRoll >= acLocal;
        if (mHit) {
          const md = rollDice(m.damage);
          this.player.hp -= md;
          msg += ` · 被反击 -${md}`;
          this.flash();
        } else {
          msg += ' · 怪物未命中';
        }
      }
      this.toast(msg);
      this.pushLocalLog(`第${this.floor}层：${msg}`);
      if (m.hp <= 0) {
        this.scene.remove(m.mesh);
        try {
          const data = await gameApi('mint', {
            type: 'kill',
            floor: this.floor,
            monster_key: m.key || 'unknown',
            monster_label: m.label || '',
            monster_stats: {
              max_hp: m.maxHp,
              ac: m.ac,
              to_hit: m.to_hit,
              damage: m.damage || '1d6',
            },
          });
          this.applyPlayerPayload(data);
          const mint = data.mint || {};
          const xpg = Number(mint.xp_gained) || 0;
          const gdg = Number(mint.gold_gained) || 0;
          let extra = `击败：+${xpg} 经验 · +${gdg} 金币`;
          if (mint.item) extra += ' · 获得「' + mint.item.label + '」';
          this.toast(extra);
          this.pushLocalLog(
            `第${this.floor}层：击败 ${m.label} · +${xpg} 经验 · +${gdg} 金币` +
              (mint.item ? ` · 「${mint.item.label}」` : '')
          );
          this.player.hp = Math.min(this.player.hp, this.player.hpMax);
        } catch (e) {
          this.toast('同步失败: ' + (e.message || e));
        }
        this.monsters = this.monsters.filter((x) => x !== m);
      }
      if (this.player.hp <= 0) await this.handleDeath();
      this.combatLock = false;
    },

    /** 仅 mode==='dungeon' 时执行：回城后挂机停止，全局只有一个地城逻辑在跑 */
    autopilotTick() {
      if (this._dungeonLoading) return;
      if (this.mode !== 'dungeon' || this.combatLock) return;
      if (this.animationState.isAnimating) return;
      const target = pickTarget(this);
      if (target.type === 'fight') {
        const m = target.monster;
        const ok = this.faceToward(m.x, m.y);
        if (ok) this.fightOnce(m);
        return;
      }
      if (target.type === 'path' && target.path && target.path.length >= 2) {
        const nx = target.path[1][0];
        const ny = target.path[1][1];
        if (!this.faceToward(nx, ny)) return;
        this.tryStepToward(nx, ny);
        return;
      }
    },

    /**
     * 全量 URL 预加载只执行一次；并发调用共享同一 Promise。
     * @param {function(number): void} [onProgress] 0..1
     */
    preloadAllDungeonAssetsOnce(onProgress) {
      if (this._dungeonAssetsReady) {
        if (onProgress) onProgress(1);
        return Promise.resolve();
      }
      if (this._preloadAllPromise) {
        return this._preloadAllPromise.then(() => {
          if (onProgress) onProgress(1);
        });
      }
      const urls = collectDungeonPreloadUrls();
      const wrap = onProgress || (() => {});
      this._preloadAllPromise = preloadImageUrls(urls, wrap).then(() => {
        this._dungeonAssetsReady = true;
        this._preloadAllPromise = null;
      });
      return this._preloadAllPromise;
    },

    async preloadDungeonAssetsWithBar() {
      const urls = collectDungeonPreloadUrls();
      const fill = document.getElementById('dungeon-load-fill');
      const pct = document.getElementById('dungeon-load-pct');
      const label = document.getElementById('dungeon-load-label');
      const barWrap = document.getElementById('dungeon-load-bar-wrap');
      const setProgress = (r) => {
        const p = Math.min(100, Math.round(r * 100));
        if (fill) fill.style.width = p + '%';
        if (pct) pct.textContent = p + '%';
        if (barWrap) barWrap.setAttribute('aria-valuenow', String(p));
        if (label) label.textContent = '正在加载地城素材（' + urls.length + ' 个地址）…';
      };
      setProgress(0);
      await this.preloadAllDungeonAssetsOnce(setProgress);
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
    },

    async preloadDungeonAssetsInBackgroundWithHint() {
      const myGen = ++this._dungeonBgPreloadGen;
      const hint = document.getElementById('dungeon-bg-preload-hint');
      try {
        await this.preloadAllDungeonAssetsOnce((r) => {
          if (myGen !== this._dungeonBgPreloadGen) return;
          if (!hint) return;
          hint.hidden = false;
          hint.textContent = '素材后台加载 ' + Math.min(100, Math.round(r * 100)) + '%';
        });
        if (myGen !== this._dungeonBgPreloadGen) return;
        if (hint) {
          hint.textContent = '素材已缓存';
          setTimeout(() => {
            if (hint && hint.textContent === '素材已缓存') hint.hidden = true;
          }, 2200);
        }
      } catch (e) {
        if (myGen === this._dungeonBgPreloadGen) {
          this.toast('后台加载: ' + (e.message || e));
          if (hint) hint.hidden = true;
        }
      }
    },

    freezeDungeonForTown() {
      this.mode = 'town';
      if (typeof window.setRpgBodyView === 'function') window.setRpgBodyView('rpg-view-town');
      this._dungeonBgPreloadGen++;
      const hint = document.getElementById('dungeon-bg-preload-hint');
      if (hint) hint.hidden = true;
      this.combatLock = false;
      this.animationState.isAnimating = false;
      this.animationState.type = null;
      this._rotationQueue = [];
      this.snapCameraToGrid();
    },

    _enterDungeonCore() {
      this.combatLock = false;
      this.animationState.isAnimating = false;
      this.animationState.type = null;
      this._rotationQueue = [];
      this.mode = 'dungeon';
      if (typeof window.setRpgBodyView === 'function') window.setRpgBodyView('rpg-view-dungeon');
      const ds = document.getElementById('dungeon-sheet');
      if (ds) ds.hidden = false;
      const btnTown = document.getElementById('btn-town');
      if (btnTown) btnTown.disabled = false;
      if (this.state.player) {
        this.player.hp = this.state.player.hp_max;
        this.player.hpMax = this.state.player.hp_max;
      }
      this.floor = 1;
      this.localLogLines = [];
      this._dungeonSheetSig = '';
      const el = document.getElementById('local-combat-log');
      if (el) el.innerHTML = '';
      this.buildFloor(1);
      this.cacheDungeonCombatFromPlayer();
      this.updateDungeonSheet();
      this.pushLocalLog('进入地下城，开始挂机探索');
      this.toast('挂机探索 — 无限层 · 越深越强');
    },

    openDungeonEntry() {
      const btnEnter = document.getElementById('btn-enter');
      if (btnEnter) btnEnter.disabled = true;
      if (this._dungeonAssetsReady) {
        this._enterDungeonCore();
        if (btnEnter) btnEnter.disabled = false;
        return;
      }
      const ov = document.getElementById('dungeon-load-overlay');
      const choice = document.getElementById('dungeon-load-choice');
      const progress = document.getElementById('dungeon-load-progress');
      const waitBtn = document.getElementById('btn-preload-wait');
      const bgBtn = document.getElementById('btn-preload-bg');
      if (waitBtn) waitBtn.disabled = false;
      if (bgBtn) bgBtn.disabled = false;
      if (!ov || !choice || !progress) {
        this._enterDungeonCore();
        if (btnEnter) btnEnter.disabled = false;
        return;
      }
      ov.hidden = false;
      choice.hidden = false;
      progress.hidden = true;
      const fill = document.getElementById('dungeon-load-fill');
      const pct = document.getElementById('dungeon-load-pct');
      if (fill) fill.style.width = '0%';
      if (pct) pct.textContent = '0%';
    },

    loop() {
      requestAnimationFrame(() => this.loop());
      if (this.scene && this.camera && this.renderer) {
        this.updateCamera();
        this.updateHands();
        const cy = this.camera.rotation.y;
        this.monsters.forEach((m) => {
          m.mesh.rotation.order = 'YXZ';
          m.mesh.rotation.x = 0;
          m.mesh.rotation.z = 0;
          m.mesh.rotation.y = cy;
        });
        this.chests.forEach((c) => {
          c.mesh.rotation.order = 'YXZ';
          c.mesh.rotation.x = 0;
          c.mesh.rotation.z = 0;
          c.mesh.rotation.y = cy;
        });
        if (this.stairsMesh) {
          this.stairsMesh.rotation.order = 'YXZ';
          this.stairsMesh.rotation.x = 0;
          this.stairsMesh.rotation.z = 0;
          this.stairsMesh.rotation.y = cy;
        }
        if (this.radarLight) {
          const t = performance.now() * 0.001;
          const cx = this.camera.position.x;
          const cz = this.camera.position.z;
          this.radarLight.position.set(cx, 1.15, cz);
          this.radarLight.target.position.set(cx + Math.cos(t) * 3 * CELL, 0, cz + Math.sin(t) * 3 * CELL);
          this.radarLight.target.updateMatrixWorld();
        }
        this.renderer.render(this.scene, this.camera);
      }
      const hud = document.getElementById('hud');
      if (hud) {
        if (this.mode === 'dungeon') {
          const p = this.state.player;
          const N = (x, d) => (x != null && x !== '' && !Number.isNaN(Number(x)) ? Number(x) : d);
          if (p) {
            const hitR =
              p.weapon_hit_dmg_min != null
                ? ` 命中${N(p.weapon_hit_dmg_min, 1)}～${N(p.weapon_hit_dmg_max, 1)}`
                : '';
            const tr =
              p.trap_final_dmg_min != null
                ? ` · 陷阱承${N(p.trap_final_dmg_min, 1)}～${N(p.trap_final_dmg_max, 11)}`
                : '';
            hud.innerHTML = `第 ${this.floor} 层 · HP ${Math.max(0, Math.floor(this.player.hp))}/${
              this.player.hpMax
            } · AC ${this.ac} · Lv${p.level} · 武器 ${this.weaponDice}${hitR}${tr}`;
          } else {
            hud.innerHTML = `第 ${this.floor} 层 · 生命 ${Math.max(0, Math.floor(this.player.hp))}/${
              this.player.hpMax
            } · 护甲 ${this.ac} · 武器 ${this.weaponDice}`;
          }
        } else {
          hud.innerHTML = '在主城 — 使用下方面板管理角色，然后进入地下城';
        }
      }
      if (this.mode === 'dungeon') this.updateDungeonSheet();
    },

    initThree() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x050f14);
      const size = Math.min(window.innerWidth, window.innerHeight - 88, 820);
      this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(size, size);
      document.getElementById('game-root').appendChild(this.renderer.domElement);

      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      this.scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffe082, 0.45);
      dir.position.set(2, 6, 2);
      this.scene.add(dir);
      this.radarLight = new THREE.SpotLight(0xff1744, 0.65, 14, Math.PI / 5);
      this.scene.add(this.radarLight);
      this.scene.add(this.camera);
      this.createHands();
      this.syncWeaponHandTexture();

      window.addEventListener('resize', () => {
        const s = Math.min(window.innerWidth, window.innerHeight - 88, 820);
        this.renderer.setSize(s, s);
        this.camera.aspect = 1;
        this.camera.updateProjectionMatrix();
      });
    },

    async _loadDungeonDataJson() {
      await loadJson('data/items.json')
        .then((arr) => {
          itemImageNumByKey = {};
          (Array.isArray(arr) ? arr : []).forEach((t) => {
            if (t && t.id) itemImageNumByKey[t.id] = Math.max(0, Number(t.image_num) || 0);
          });
        })
        .catch(() => {
          itemImageNumByKey = {};
        });
      await loadJson('data/monsters.json').then((j) => {
        monsterCatalog = j || {};
        rebuildMonsterSpriteIndex();
      });
      await loadJson('data/dungeon_music.json')
        .then((j) => {
          if (j && typeof j === 'object') dungeonMusicConfig = j;
        })
        .catch(() => {});
    },

    /** 仅地下城页：加载数据、Three、玩家；不打开主城 UI */
    async bootstrapDungeonScene() {
      await this._loadDungeonDataJson();
      if (!this.renderer) {
        this.initThree();
        setInterval(() => this.autopilotTick(), 90);
        this.loop();
      }
      try {
        const data = await gameApi('player', {});
        this.applyPlayerPayload(data);
      } catch (e) {
        this.toast('API: ' + (e.message || e));
      }
    },

    /** 单页整合模式：登录后进主城（保留兼容） */
    async bootstrap() {
      await this._loadDungeonDataJson();
      if (!this.renderer) {
        this.initThree();
        setInterval(() => this.autopilotTick(), 90);
        this.loop();
      }
      try {
        const data = await gameApi('player', {});
        this.applyPlayerPayload(data);
      } catch (e) {
        this.toast('API: ' + (e.message || e));
      }
      if (!this._bootstrapped) {
        TownUI.initTownUI(this);
        this._bootstrapped = true;
      }
      TownUI.openTown(this);
    },
  };

  window.ChristmasRPG = Game;

  window.setRpgBodyView = function (cls) {
    const b = document.body;
    b.classList.remove('rpg-view-auth', 'rpg-view-town', 'rpg-view-dungeon');
    if (cls) b.classList.add(cls);
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  const g = window.ChristmasRPG;
  const btnTown = document.getElementById('btn-town');
  if (btnTown) {
    btnTown.onclick = () => {
      const ext = typeof window.RPG_RETURN_TOWN === 'string' && window.RPG_RETURN_TOWN;
      if (ext) {
        location.href = ext;
        return;
      }
      g.freezeDungeonForTown();
      const ds = document.getElementById('dungeon-sheet');
      if (ds) ds.hidden = true;
      btnTown.disabled = true;
      TownUI.openTown(g);
    };
  }
  const btnEnter = document.getElementById('btn-enter');
  if (btnEnter) {
    btnEnter.onclick = () => {
      const extDungeon = typeof window.RPG_ENTER_DUNGEON === 'string' && window.RPG_ENTER_DUNGEON;
      if (extDungeon) {
        location.href = extDungeon;
        return;
      }
      TownUI.closeTownEnterDungeon(g);
    };
  }

  const dungeonLoadOverlay = document.getElementById('dungeon-load-overlay');
  if (dungeonLoadOverlay) dungeonLoadOverlay.addEventListener('click', async (ev) => {
    const id = ev.target && ev.target.id;
    if (id !== 'btn-preload-wait' && id !== 'btn-preload-bg') return;
    const waitBtn = document.getElementById('btn-preload-wait');
    const bgBtn = document.getElementById('btn-preload-bg');
    if (waitBtn) waitBtn.disabled = true;
    if (bgBtn) bgBtn.disabled = true;
    const btnEnter = document.getElementById('btn-enter');
    const ov = document.getElementById('dungeon-load-overlay');
    const choice = document.getElementById('dungeon-load-choice');
    const progress = document.getElementById('dungeon-load-progress');

    if (id === 'btn-preload-wait') {
      if (choice) choice.hidden = true;
      if (progress) progress.hidden = false;
      g._dungeonLoading = true;
      try {
        await g.preloadDungeonAssetsWithBar();
      } catch (e) {
        g.toast('预加载异常: ' + (e.message || e));
      } finally {
        g._dungeonLoading = false;
        if (ov) ov.hidden = true;
      }
      g._enterDungeonCore();
      if (waitBtn) waitBtn.disabled = false;
      if (bgBtn) bgBtn.disabled = false;
      if (btnEnter) btnEnter.disabled = false;
      return;
    }

    if (id === 'btn-preload-bg') {
      if (ov) ov.hidden = true;
      g._enterDungeonCore();
      void g.preloadDungeonAssetsInBackgroundWithHint();
      if (waitBtn) waitBtn.disabled = false;
      if (bgBtn) bgBtn.disabled = false;
      if (btnEnter) btnEnter.disabled = false;
    }
  });
});

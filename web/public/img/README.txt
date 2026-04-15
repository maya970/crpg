Place optional local assets here (game tries these before Arweave):

  monsters/0001.gif, 0002.gif, … (png/jpg/webp 同名也可)
    — 每只怪会带一个循环序号，优先加载对应编号；仍可按图鉴 key 回退。

  items/0001.gif, 0002.gif, …
    — 宝箱精灵按槽位序号尝试；失败则试 0001–0064 再回退旧文件名。

  tiles/0001.gif — 墙材质优先
      0002.gif — 地板优先
      0003.gif — 天花板优先
      0004.gif — 楼梯优先（亦试 items/0004）
    — 每种还会扫描 0001–0064 作兜底；再试 wall.png 等与远程贴图。

若文件缺失，使用程序生成的色块与 data/monsters.json 里的远程 sprite。

Local art (optional)

  monsters/0001.gif, 0002.gif, … (png/jpg/webp with same name work too)
    Each creature tries its numbered file first, then falls back to codex keys.

  items/0000.gif … for chests and props
    Chests try a few numbered frames, then scan 0001–0064, then remote URLs.

  tiles/0001.gif — wall
      0002.gif — floor
      0003.gif — ceiling
      0004.gif — stairs (also tries items/0004)
    Each type can scan 0001–0064 as fallback, then wall.png etc. and remote URLs.

If files are missing, the game uses colored placeholders and remote sprites from data/monsters.json.

/** Seed catalog of popular games. Communities and servers can reference these. */
export const GAMES: {
  id: string;
  name: string;
  protocol?: string;
  steamAppId?: number;
  color?: string;
  aliases?: string[];
}[] = [
  { id: 'minecraft', name: 'Minecraft', protocol: 'minecraft', color: '#5b8731', aliases: ['mc'] },
  { id: 'rust', name: 'Rust', protocol: 'rust', steamAppId: 252490, color: '#cd412b' },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    protocol: 'cs2',
    steamAppId: 730,
    color: '#de9b35',
    aliases: ['csgo', 'counter strike'],
  },
  {
    id: 'gta-v',
    name: 'Grand Theft Auto V',
    protocol: 'fivem',
    steamAppId: 271590,
    color: '#2d7d46',
    aliases: ['fivem', 'gta 5', 'gta rp'],
  },
  {
    id: 'ark',
    name: 'ARK: Survival Evolved',
    protocol: 'ark',
    steamAppId: 346110,
    color: '#4a7aa8',
  },
  { id: 'gmod', name: "Garry's Mod", protocol: 'gmod', steamAppId: 4000, color: '#1f8fe5' },
  { id: 'tf2', name: 'Team Fortress 2', protocol: 'tf2', steamAppId: 440, color: '#b8383b' },
  { id: 'valheim', name: 'Valheim', protocol: 'valheim', steamAppId: 892970, color: '#7f6b4d' },
  { id: 'terraria', name: 'Terraria', protocol: 'terraria', steamAppId: 105600, color: '#3a8f3f' },
  { id: 'palworld', name: 'Palworld', protocol: 'palworld', steamAppId: 1623730, color: '#3aa0d8' },
  {
    id: '7-days-to-die',
    name: '7 Days to Die',
    protocol: 'sevendays',
    steamAppId: 251570,
    color: '#8b1e1e',
  },
  { id: 'dayz', name: 'DayZ', protocol: 'dayz', steamAppId: 221100, color: '#5c5c4a' },
  { id: 'squad', name: 'Squad', protocol: 'squad', steamAppId: 393380, color: '#5f7a3a' },
  { id: 'valorant', name: 'VALORANT', color: '#ff4655' },
  { id: 'league-of-legends', name: 'League of Legends', color: '#c89b3c', aliases: ['lol'] },
  { id: 'fortnite', name: 'Fortnite', color: '#9d4dbb' },
  { id: 'apex-legends', name: 'Apex Legends', steamAppId: 1172470, color: '#da292a' },
  { id: 'overwatch-2', name: 'Overwatch 2', color: '#f99e1a' },
  { id: 'dota-2', name: 'Dota 2', steamAppId: 570, color: '#a72714' },
  { id: 'destiny-2', name: 'Destiny 2', steamAppId: 1085660, color: '#3a5f8c' },
  { id: 'world-of-warcraft', name: 'World of Warcraft', color: '#f8b700', aliases: ['wow'] },
  {
    id: 'final-fantasy-xiv',
    name: 'Final Fantasy XIV',
    steamAppId: 39210,
    color: '#6a4ca8',
    aliases: ['ffxiv'],
  },
  {
    id: 'path-of-exile-2',
    name: 'Path of Exile 2',
    steamAppId: 2694490,
    color: '#a3701f',
    aliases: ['poe2'],
  },
  { id: 'helldivers-2', name: 'Helldivers 2', steamAppId: 553850, color: '#f2c200' },
  {
    id: 'baldurs-gate-3',
    name: "Baldur's Gate 3",
    steamAppId: 1086940,
    color: '#7a2b2b',
    aliases: ['bg3'],
  },
  { id: 'elden-ring', name: 'Elden Ring', steamAppId: 1245620, color: '#b09a5b' },
  { id: 'stardew-valley', name: 'Stardew Valley', steamAppId: 413150, color: '#6fa43a' },
  { id: 'rocket-league', name: 'Rocket League', steamAppId: 252950, color: '#1a73e8' },
  { id: 'among-us', name: 'Among Us', steamAppId: 945360, color: '#c51111' },
  { id: 'roblox', name: 'Roblox', color: '#e2231a' },
  { id: 'deep-rock-galactic', name: 'Deep Rock Galactic', steamAppId: 548430, color: '#d17d1b' },
  { id: 'satisfactory', name: 'Satisfactory', steamAppId: 526870, color: '#f39c12' },
  { id: 'other', name: 'Other / multiple games', color: '#6b7280' },
];

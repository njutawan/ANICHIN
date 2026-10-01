import { db } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Romance',
  'Supernatural', 'Mystery', 'Slice of Life', 'Mecha', 'School', 'Historical',
  'Horror', 'Psychological', 'Sports', 'Music', 'Thriller', 'Magic', 'Demons',
];

type AnimeSeed = {
  slug: string;
  title: string;
  titleJp: string;
  titleEn?: string;
  synopsis: string;
  type: string;
  status: string;
  studio: string;
  source: string;
  releasedYear: number;
  season: string;
  score: number;
  rating: string;
  views: number;
  duration: string;
  airedDay: string;
  featured?: boolean;
  trending?: boolean;
  popular?: boolean;
  rank?: number;
  totalEpisodes?: number;
  releasedEpisodes?: number;
  genres: string[];
};

const ANIMES: AnimeSeed[] = [
  {
    slug: 'shadow-blade', title: 'Shadow Blade', titleJp: '影の刃', titleEn: 'Kage no Yaiba',
    synopsis: 'In a world where darkness devours kingdoms, a lone swordsman wields a cursed crimson blade that feeds on the souls of those it cuts. Bound by a tragic past, he hunts the demon lords who shattered his clan—only to discover the blade itself may be the greatest evil of all. As shadows lengthen across the realm, every strike brings him closer to a truth that could save humanity, or end it.',
    type: 'TV', status: 'Ongoing', studio: 'Ufotable', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 9.2, rating: 'R-17', views: 1284500, duration: '24 min', airedDay: 'Sunday',
    featured: true, trending: true, popular: true, rank: 1, totalEpisodes: 24, releasedEpisodes: 12,
    genres: ['Action', 'Supernatural', 'Demons', 'Fantasy', 'Adventure'],
  },
  {
    slug: 'celestial-academy', title: 'Celestial Academy', titleJp: '星の学園', titleEn: 'Hoshi no Gakuen',
    synopsis: 'Hidden among the stars lies an academy where gifted students learn to bend the cosmos itself. When a seemingly ordinary girl is accepted, she discovers her bloodline carries the dormant power of the First Star—a magic capable of rewriting reality. But ancient factions will stop at nothing to claim her power before she learns to control it.',
    type: 'TV', status: 'Ongoing', studio: 'A-1 Pictures', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 8.7, rating: 'PG-13', views: 982300, duration: '24 min', airedDay: 'Monday',
    featured: true, trending: true, popular: true, rank: 2, totalEpisodes: 12, releasedEpisodes: 8,
    genres: ['Fantasy', 'Magic', 'School', 'Adventure', 'Drama'],
  },
  {
    slug: 'neon-samurai', title: 'Neon Samurai', titleJp: 'ネオン侍', titleEn: 'Neon Samurai',
    synopsis: 'Neo-Tokyo, 2099. A disgraced samurai awakens from cryo-sleep to find his clan wiped out and the city ruled by digital overlords. Armed with his ancestral katana—now fused with quantum circuitry—he carves a path through neon-soaked streets to avenge his fallen brothers and reclaim his honor in a world that forgot what it means to be a warrior.',
    type: 'TV', status: 'Ongoing', studio: 'Trigger', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.9, rating: 'R-17', views: 876200, duration: '24 min', airedDay: 'Saturday',
    featured: true, trending: true, popular: true, rank: 3, totalEpisodes: 13, releasedEpisodes: 10,
    genres: ['Action', 'Sci-Fi', 'Adventure', 'Cyberpunk' as any, 'Drama'],
  },
  {
    slug: 'spirit-realm', title: 'Spirit Realm Saga', titleJp: '霊界譚', titleEn: 'Reikai Monogatari',
    synopsis: 'When a young shrine maiden accidentally tears the veil between worlds, she becomes the unwilling guardian of balance between humans and spirits. Joined by a trickster fox spirit and a brooding oni outcast, she journeys through floating islands and forgotten temples to seal the rift before both realms collapse into chaos.',
    type: 'TV', status: 'Ongoing', studio: 'MAPPA', source: 'Manga', releasedYear: 2024, season: 'Summer',
    score: 8.5, rating: 'PG-13', views: 743100, duration: '23 min', airedDay: 'Wednesday',
    featured: true, trending: true, popular: true, rank: 4, totalEpisodes: 24, releasedEpisodes: 14,
    genres: ['Adventure', 'Supernatural', 'Fantasy', 'Action', 'Magic'],
  },
  {
    slug: 'crystal-kingdom', title: 'Crystal Kingdom', titleJp: '水晶王国', titleEn: 'Suishō Ōkoku',
    synopsis: 'The last heir to a crystalline throne must reclaim her kingdom from the Frost Tyrant who plunged it into eternal winter. With a band of unlikely heroes—a rogue ice mage, a talking crystal beast, and a knight with a frozen heart—she races to light the seven primal crystals before the world is locked in ice forever.',
    type: 'TV', status: 'Ongoing', studio: 'Wit Studio', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 8.3, rating: 'PG-13', views: 654800, duration: '24 min', airedDay: 'Friday',
    trending: true, popular: true, rank: 5, totalEpisodes: 12, releasedEpisodes: 6,
    genres: ['Fantasy', 'Adventure', 'Magic', 'Drama'],
  },
  {
    slug: 'mecha-warriors', title: 'Mecha Warriors United', titleJp: '機甲戦士', titleEn: 'Kikō Senshi',
    synopsis: 'When the Vortex invaders shattered Earth\'s last defense line, a ragtag squadron of pilots must unite five ancient mech titans to form the legendary Unity. But syncing minds across rival factions may cost them their sanity—and their humanity—in the final war for survival.',
    type: 'TV', status: 'Ongoing', studio: 'Sunrise', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.6, rating: 'PG-13', views: 598700, duration: '24 min', airedDay: 'Sunday',
    featured: true, trending: true, popular: true, rank: 6, totalEpisodes: 26, releasedEpisodes: 11,
    genres: ['Mecha', 'Action', 'Sci-Fi', 'Drama', 'Adventure'],
  },
  {
    slug: 'cherry-blossom', title: 'Cherry Blossom Romance', titleJp: '桜の恋', titleEn: 'Sakura no Koi',
    synopsis: 'Two high school students—both haunted by the same recurring dream of a cherry blossom tree—discover their fates have been intertwined across a thousand lifetimes. As spring blossoms, they must decide whether to break the cycle of tragic love or let destiny bloom one final time.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.8, rating: 'PG-13', views: 521400, duration: '24 min', airedDay: 'Thursday',
    trending: true, popular: true, rank: 7, totalEpisodes: 13, releasedEpisodes: 9,
    genres: ['Romance', 'Slice of Life', 'School', 'Drama', 'Supernatural'],
  },
  {
    slug: 'demon-hunter', title: 'Demon Hunter', titleJp: '鬼狩り', titleEn: 'Onigari',
    synopsis: 'After his sister is transformed into a demon, a kind-hearted boy takes up the mantle of the Demon Hunters—an ancient order sworn to eradicate the night. Wielding a sun-forged blade, he searches for a cure while battling the Twelve Demon Moons in a war that will redefine the boundary between human and monster.',
    type: 'TV', status: 'Ongoing', studio: 'ufotable', source: 'Manga', releasedYear: 2023, season: 'Spring',
    score: 9.0, rating: 'R-17', views: 1432800, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 8, totalEpisodes: 26, releasedEpisodes: 18,
    genres: ['Action', 'Supernatural', 'Demons', 'Adventure', 'Historical'],
  },
  {
    slug: 'star-voyager', title: 'Star Voyager', titleJp: '星の航海者', titleEn: 'Hoshi no Kōkakusha',
    synopsis: 'Commander Aria Vanguard leads the deep-space vessel Horizon beyond the mapped galaxy, chasing a signal that could be humanity\'s first contact—or its last warning. As the crew navigates warring star systems and ancient cosmic ruins, every light-year brings them closer to a revelation that rewrites what it means to be human.',
    type: 'TV', status: 'Ongoing', studio: 'Bones', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.4, rating: 'PG-13', views: 412900, duration: '24 min', airedDay: 'Tuesday',
    trending: true, popular: true, rank: 9, totalEpisodes: 24, releasedEpisodes: 7,
    genres: ['Sci-Fi', 'Adventure', 'Action', 'Drama', 'Space' as any],
  },
  {
    slug: 'dragon-legacy', title: "Dragon's Legacy", titleJp: '竜の遺産', titleEn: 'Ryū no Isan',
    synopsis: 'Born with a dragon\'s soul trapped in human flesh, young Kael must master the fire within before it consumes him. Hunted by the Dragonblood Order and guided by the last of the Sky Dragons, he races to awaken the eight sealed dragon hearts and prevent the resurrection of the World-Ender.',
    type: 'TV', status: 'Ongoing', studio: 'MAPPA', source: 'Light Novel', releasedYear: 2024, season: 'Summer',
    score: 8.7, rating: 'PG-13', views: 687500, duration: '24 min', airedDay: 'Sunday',
    featured: true, trending: true, popular: true, rank: 10, totalEpisodes: 24, releasedEpisodes: 16,
    genres: ['Fantasy', 'Action', 'Adventure', 'Supernatural', 'Magic'],
  },
  {
    slug: 'phantom-detective', title: 'Phantom Detective', titleJp: '幻の探偵', titleEn: 'Maboroshi no Tantei',
    synopsis: 'In a fog-drenched Victorian metropolis, a detective who can speak with the recently dead takes on cases the police dare not touch. But when a string of impossible murders points to a killer who shouldn\'t exist, he must confront the ghost of his own unfinished past to solve the case—and save his own soul.',
    type: 'TV', status: 'Ongoing', studio: 'Production I.G', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.2, rating: 'PG-13', views: 298400, duration: '23 min', airedDay: 'Friday',
    trending: true, popular: true, rank: 11, totalEpisodes: 12, releasedEpisodes: 5,
    genres: ['Mystery', 'Supernatural', 'Thriller', 'Historical', 'Drama'],
  },
  {
    slug: 'eternal-warriors', title: 'Eternal Warriors', titleJp: '永遠の戦士', titleEn: 'Eien no Senshi',
    synopsis: 'Three warriors, bound by a blood oath across centuries, are reborn in every age of conflict to defend the realm from an ancient darkness that rises with every era. As the final cycle begins, they must remember who they were—or the world will forget it ever existed.',
    type: 'TV', status: 'Ongoing', studio: 'Madhouse', source: 'Manga', releasedYear: 2024, season: 'Summer',
    score: 8.1, rating: 'R-17', views: 267300, duration: '24 min', airedDay: 'Wednesday',
    popular: true, rank: 12, totalEpisodes: 24, releasedEpisodes: 13,
    genres: ['Action', 'Historical', 'Adventure', 'Drama', 'Supernatural'],
  },
  {
    slug: 'frost-wizard', title: 'Frost Wizard', titleJp: '氷の魔術師', titleEn: 'Kōri no Majutsushi',
    synopsis: 'Exiled for practicing forbidden ice magic, a young wizard journeys to the Frozen Spire to learn the truth behind her power—only to find she is the last heir of the Winter Crown, destined to either restore the broken season or freeze the world to save it.',
    type: 'TV', status: 'Upcoming', studio: 'A-1 Pictures', source: 'Light Novel', releasedYear: 2025, season: 'Spring',
    score: 8.0, rating: 'PG-13', views: 198600, duration: '24 min', airedDay: 'Monday',
    popular: true, rank: 13, totalEpisodes: 12, releasedEpisodes: 12,
    genres: ['Fantasy', 'Magic', 'Adventure', 'Drama'],
  },
  {
    slug: 'ember-knight', title: 'Ember Knight', titleJp: '炎の騎士', titleEn: 'Honō no Kishi',
    synopsis: 'A disgraced knight inherits a flame that never dies—a power said to belong only to kings. Hunted by the tyrant who betrayed him, he rallies a rebellion of the forgotten to reclaim a throne he never wanted, one ember at a time.',
    type: 'TV', status: 'Ongoing', studio: 'Wit Studio', source: 'Manga', releasedYear: 2024, season: 'Spring',
    score: 8.3, rating: 'PG-13', views: 312400, duration: '24 min', airedDay: 'Thursday',
    popular: true, rank: 14, totalEpisodes: 24, releasedEpisodes: 8,
    genres: ['Action', 'Fantasy', 'Adventure', 'Drama'],
  },
  {
    slug: 'serene-garden', title: 'Serene Garden', titleJp: '静かな庭', titleEn: 'Shizukana Niwa',
    synopsis: 'A retired assassin inherits her late grandmother\'s countryside garden—and discovers the soil grows more than flowers. As quiet village mysteries bloom around her, she must choose between the peace she sought and the protection of those she\'s grown to love.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.5, rating: 'PG-13', views: 178900, duration: '23 min', airedDay: 'Tuesday',
    popular: true, rank: 15, totalEpisodes: 12, releasedEpisodes: 10,
    genres: ['Slice of Life', 'Mystery', 'Drama', 'Comedy'],
  },
  {
    slug: 'thunder-god', title: 'Thunder God', titleJp: '雷神', titleEn: 'Raijin',
    synopsis: 'When the seals binding the Thunder God weaken, a high school delinquent accidentally inherits the deity\'s power. Now he must balance college entrance exams with saving a city from the storm demons the gods forgot to chain.',
    type: 'TV', status: 'Ongoing', studio: 'Bones', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.4, rating: 'PG-13', views: 421700, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 16, totalEpisodes: 12, releasedEpisodes: 4,
    genres: ['Action', 'Supernatural', 'School', 'Comedy', 'Adventure'],
  },
  {
    slug: 'ocean-queen', title: 'Ocean Queen', titleJp: '海の女王', titleEn: 'Umi no Joō',
    synopsis: 'The last princess of a drowned kingdom rises from the deep to reclaim her throne from the sea warlord who sank it. With a tide-singing voice and a spear that commands storms, she gathers an army of the ocean\'s forgotten children.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Original', releasedYear: 2024, season: 'Summer',
    score: 8.2, rating: 'PG-13', views: 234500, duration: '24 min', airedDay: 'Friday',
    popular: true, rank: 17, totalEpisodes: 12, releasedEpisodes: 7,
    genres: ['Fantasy', 'Adventure', 'Action', 'Drama'],
  },
  {
    slug: 'phantom-blade', title: 'Phantom Blade', titleJp: '幻刀', titleEn: 'Maboroshi no Katana',
    synopsis: 'A masterless swordsman is haunted by a blade that only cuts what no longer should exist—memories, regrets, ghosts of choices never made. When a girl begs him to cut the memory of her murdered brother\'s killer, he must decide which of his own ghosts to finally let go.',
    type: 'Movie', status: 'Completed', studio: 'ufotable', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.9, rating: 'R-17', views: 389200, duration: '112 min', airedDay: null as any,
    popular: true, rank: 18, totalEpisodes: 1, releasedEpisodes: 1,
    genres: ['Action', 'Supernatural', 'Drama', 'Psychological'],
  },
  {
    slug: 'iron-fortress', title: 'Iron Fortress', titleJp: '鉄の要塞', titleEn: 'Tetsu no Yōsai',
    synopsis: 'The last free city stands behind walls of living iron, defended by mech-riders who fuse with the fortress itself. When the architect of the walls defects to the enemy, a young rider must journey beyond the steel to discover the terrible price of their survival.',
    type: 'TV', status: 'Ongoing', studio: 'Wit Studio', source: 'Manga', releasedYear: 2024, season: 'Winter',
    score: 8.3, rating: 'R-17', views: 367100, duration: '24 min', airedDay: 'Sunday',
    popular: true, rank: 19, totalEpisodes: 24, releasedEpisodes: 12,
    genres: ['Mecha', 'Action', 'Drama', 'Sci-Fi', 'Thriller'],
  },
  {
    slug: 'moonlight-waltz', title: 'Moonlight Waltz', titleJp: '月光の円舞', titleEn: 'Gekkō no Enbu',
    synopsis: 'A blind pianist inherits a haunted music hall where every full moon, the spirits of lost musicians perform their final, fatal symphonies. To free them, she must learn the waltz that ended them all—a piece rumored to grant one impossible wish.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.1, rating: 'PG-13', views: 156300, duration: '24 min', airedDay: 'Wednesday',
    popular: true, rank: 20, totalEpisodes: 12, releasedEpisodes: 3,
    genres: ['Music', 'Supernatural', 'Drama', 'Mystery', 'Slice of Life'],
  },
  {
    slug: 'beast-tamer', title: 'Beast Tamer', titleJp: '獣使い', titleEn: 'Kemonotsukai',
    synopsis: 'Kicked out of the hero\'s party for being "useless," a beast tamer discovers his true power: the loyalty of the world\'s most fearsome magical beasts. Together with a dragon, a phoenix, and a sly fox-spirit, he sets out to prove that kindness is the strongest magic of all.',
    type: 'TV', status: 'Ongoing', studio: 'EMT Squared', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 7.9, rating: 'PG-13', views: 287600, duration: '24 min', airedDay: 'Monday',
    popular: true, rank: 21, totalEpisodes: 12, releasedEpisodes: 6,
    genres: ['Adventure', 'Comedy', 'Fantasy', 'Action'],
  },
  {
    slug: 'void-hunter', title: 'Void Hunter', titleJp: '虚空の狩人', titleEn: 'Kokū no Karyūdo',
    synopsis: 'In a city where memories can be stolen and sold, a "void hunter" tracks those who erase themselves from existence. When his own past starts vanishing, he has seven days to catch the thief—or forget everyone he ever loved.',
    type: 'TV', status: 'Ongoing', studio: 'Production I.G', source: 'Original', releasedYear: 2024, season: 'Summer',
    score: 8.6, rating: 'R-17', views: 343800, duration: '24 min', airedDay: 'Thursday',
    trending: true, popular: true, rank: 22, totalEpisodes: 12, releasedEpisodes: 11,
    genres: ['Sci-Fi', 'Mystery', 'Thriller', 'Psychological', 'Action'],
  },
  {
    slug: 'samurai-spirit', title: 'Samurai Spirit', titleJp: '侍の魂', titleEn: 'Samurai no Tamashī',
    synopsis: 'A wandering ronin in the twilight of the samurai era agrees to protect a village from bandits, only to discover the bandits are deserters from his old regiment—and the war he fled is far from over. A meditation on honor, regret, and the cost of a single blade drawn too late.',
    type: 'TV', status: 'Completed', studio: 'Madhouse', source: 'Manga', releasedYear: 2023, season: 'Fall',
    score: 9.1, rating: 'R-17', views: 678900, duration: '24 min', airedDay: null as any,
    popular: true, rank: 23, totalEpisodes: 12, releasedEpisodes: 12,
    genres: ['Action', 'Historical', 'Drama', 'Adventure'],
  },
  {
    slug: 'crimson-rose', title: 'Crimson Rose', titleJp: '紅薔薇', titleEn: 'Beni Bara',
    synopsis: 'A florist by day and a phantom thief by night, Rosa steals back stolen heirlooms and returns them to their rightful owners. But when she crosses paths with the detective hunting her, neither knows they\'ve already met—at the altar, in another life.',
    type: 'TV', status: 'Ongoing', studio: 'CloverWorks', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.4, rating: 'PG-13', views: 245700, duration: '23 min', airedDay: 'Friday',
    popular: true, rank: 24, totalEpisodes: 12, releasedEpisodes: 8,
    genres: ['Romance', 'Mystery', 'Action', 'Drama', 'Comedy'],
  },
  {
    slug: 'celestial-blade', title: 'Celestial Blade', titleJp: '天の剣', titleEn: 'Ten no Ken',
    synopsis: 'A fallen angel is given one year on Earth to redeem herself by wielding a sword forged from a dying star. But the demons she once commanded have not forgotten their queen—and they want her back, even if it means burning heaven to do it.',
    type: 'TV', status: 'Ongoing', studio: 'Wit Studio', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.6, rating: 'R-17', views: 412300, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 25, totalEpisodes: 24, releasedEpisodes: 5,
    genres: ['Action', 'Supernatural', 'Fantasy', 'Drama', 'Adventure'],
  },
  {
    slug: 'whisper-of-time', title: 'Whisper of Time', titleJp: '時の囁き', titleEn: 'Toki no Sasayaki',
    synopsis: 'A librarian discovers a book that lets her read one minute into the future. As she pieces together a tragedy that hasn\'t happened yet, she must decide whether to change fate—or let the story unfold as written.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 8.7, rating: 'PG-13', views: 198400, duration: '23 min', airedDay: 'Wednesday',
    trending: true, popular: true, rank: 26, totalEpisodes: 12, releasedEpisodes: 4,
    genres: ['Drama', 'Supernatural', 'Slice of Life', 'Mystery', 'Romance'],
  },
  {
    slug: 'crimson-ironclad', title: 'Crimson Ironclad', titleJp: '紅の鉄騎', titleEn: 'Kurenai no Tekki',
    synopsis: 'In a kingdom of steam and steel, a disgraced knight pilots a forbidden crimson mech—the only machine capable of standing against the Empire\'s army of clockwork colossi. But every battle erodes the line between woman and weapon.',
    type: 'TV', status: 'Ongoing', studio: 'Sunrise', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.3, rating: 'R-17', views: 287900, duration: '24 min', airedDay: 'Tuesday',
    popular: true, rank: 27, totalEpisodes: 24, releasedEpisodes: 6,
    genres: ['Mecha', 'Action', 'Sci-Fi', 'Drama', 'Adventure'],
  },
  {
    slug: 'summer-rain-song', title: 'Summer Rain Song', titleJp: '夏の雨の歌', titleEn: 'Natsu no Ame no Uta',
    synopsis: 'Two strangers share an umbrella during a sudden downpour—and a melody neither can forget. As summer stretches on, they keep meeting under the same bridge, neither knowing the other is keeping a secret that could end their fragile song before it begins.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Original', releasedYear: 2024, season: 'Summer',
    score: 8.5, rating: 'PG-13', views: 156700, duration: '23 min', airedDay: 'Thursday',
    popular: true, rank: 28, totalEpisodes: 12, releasedEpisodes: 9,
    genres: ['Romance', 'Slice of Life', 'Music', 'Drama'],
  },
  {
    slug: 'astral-knights', title: 'Astral Knights', titleJp: '星騎士団', titleEn: 'Hoshi Kishidan',
    synopsis: 'When the constellation of Orion falls from the night sky, five teenagers inherit the armor of the fallen stars. To restore the heavens, they must defeat the twelve Void Princes—each one a piece of the night that refuses to be put back.',
    type: 'TV', status: 'Ongoing', studio: 'Bones', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.4, rating: 'PG-13', views: 334200, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 29, totalEpisodes: 24, releasedEpisodes: 7,
    genres: ['Action', 'Supernatural', 'Adventure', 'Fantasy', 'School'],
  },
  {
    slug: 'midnight-bakery', title: 'Midnight Bakery', titleJp: '真夜中のパン屋', titleEn: 'Mayonaka no Pan-ya',
    synopsis: 'A tiny bakery opens only at midnight and only serves those who have lost something they cannot name. Each loaf is baked with a memory—and every customer leaves with one less weight on their heart, and one more thread of a much larger mystery.',
    type: 'TV', status: 'Ongoing', studio: 'CloverWorks', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.2, rating: 'PG-13', views: 142800, duration: '23 min', airedDay: 'Monday',
    popular: true, rank: 30, totalEpisodes: 12, releasedEpisodes: 11,
    genres: ['Slice of Life', 'Supernatural', 'Drama', 'Mystery', 'Comedy'],
  },
  {
    slug: 'iron-blood-orphan', title: 'Iron Blood Orphan', titleJp: '鉄血の孤児', titleEn: 'Tecchi no Minashigo',
    synopsis: 'A child soldier inherits a derelict war-mech and a single, impossible order: protect the last fertile valley on a dying planet. As empires converge on the green, she must choose whether the price of peace is worth the cost of her own soul.',
    type: 'TV', status: 'Ongoing', studio: 'Sunrise', source: 'Original', releasedYear: 2024, season: 'Winter',
    score: 8.8, rating: 'R-17', views: 567300, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 31, totalEpisodes: 24, releasedEpisodes: 12,
    genres: ['Mecha', 'Action', 'Drama', 'Sci-Fi', 'Thriller'],
  },
  {
    slug: 'celestial-tea-house', title: 'Celestial Tea House', titleJp: '星の茶屋', titleEn: 'Hoshi no Chaya',
    synopsis: 'High above the clouds floats a tea house that serves travelers between worlds. Its newest apprentice, a runaway from the realm below, must learn to brew the seven sacred teas before the owner\'s secret is discovered by the celestial tax collectors.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 8.0, rating: 'PG-13', views: 98700, duration: '23 min', airedDay: 'Friday',
    popular: true, rank: 32, totalEpisodes: 12, releasedEpisodes: 3,
    genres: ['Fantasy', 'Slice of Life', 'Comedy', 'Adventure'],
  },
  {
    slug: 'phantom-cat-cafe', title: 'Phantom Cat Cafe', titleJp: '幻猫カフェ', titleEn: 'Maboroshi Neko Kafe',
    synopsis: 'When the city\'s stray cats begin manifesting human forms at a struggling café, the owner discovers they\'re the reincarnated spirits of her late grandmother\'s customers. To keep the café open, she must help each cat resolve its unfinished business before they fade forever.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Manga', releasedYear: 2024, season: 'Summer',
    score: 8.1, rating: 'PG-13', views: 134600, duration: '23 min', airedDay: 'Wednesday',
    popular: true, rank: 33, totalEpisodes: 12, releasedEpisodes: 10,
    genres: ['Supernatural', 'Slice of Life', 'Comedy', 'Drama', 'Mystery'],
  },
  {
    slug: 'storm-rider-saga', title: 'Storm Rider Saga', titleJp: '嵐の騎士譚', titleEn: 'Arashi no Kishi-dan',
    synopsis: 'A weather-witch who can ride typhoons like horses is conscripted by a sky-pirate captain to find the Eye of the Eternal Storm—a vortex said to grant one wish. But the closer they fly, the more the witch remembers the wish she already made, and forgot.',
    type: 'TV', status: 'Ongoing', studio: 'MAPPA', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.5, rating: 'PG-13', views: 312800, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 34, totalEpisodes: 24, releasedEpisodes: 5,
    genres: ['Adventure', 'Fantasy', 'Action', 'Supernatural', 'Drama'],
  },
  {
    slug: 'frozen-crown', title: 'Frozen Crown', titleJp: '氷の王冠', titleEn: 'Kōri no Ōkan',
    synopsis: 'A queen wakes from a hundred-year sleep to find her kingdom entombed in ice and her throne occupied by a sorcerer wearing her face. To reclaim her crown, she must ally with the very rebels who overthrew her dynasty a century ago.',
    type: 'TV', status: 'Ongoing', studio: 'Madhouse', source: 'Light Novel', releasedYear: 2024, season: 'Winter',
    score: 8.4, rating: 'PG-13', views: 256400, duration: '24 min', airedDay: 'Tuesday',
    popular: true, rank: 35, totalEpisodes: 24, releasedEpisodes: 8,
    genres: ['Fantasy', 'Adventure', 'Drama', 'Action', 'Mystery'],
  },
  {
    slug: 'last-train-home', title: 'Last Train Home', titleJp: '終電の家', titleEn: 'Shūden no Ie',
    synopsis: 'Every night, a train conductor drives the last service to a station that doesn\'t exist on any map. Its passengers are those who haven\'t yet decided whether to live or die—and he has until dawn to help them choose.',
    type: 'TV', status: 'Completed', studio: 'Production I.G', source: 'Original', releasedYear: 2024, season: 'Spring',
    score: 9.0, rating: 'R-17', views: 478200, duration: '24 min', airedDay: null as any,
    popular: true, rank: 36, totalEpisodes: 12, releasedEpisodes: 12,
    genres: ['Drama', 'Psychological', 'Supernatural', 'Slice of Life'],
  },
  {
    slug: 'silver-wolf-pact', title: 'Silver Wolf Pact', titleJp: '銀狼の契り', titleEn: 'Ginrō no Chigiri',
    synopsis: 'A village girl rescues a wounded silver wolf and binds her life to its—only to discover the wolf is the exiled prince of a kingdom of beast-riders. Together they must reclaim his throne before the blood moon rises and the pact consumes them both.',
    type: 'TV', status: 'Ongoing', studio: 'A-1 Pictures', source: 'Light Novel', releasedYear: 2024, season: 'Fall',
    score: 8.3, rating: 'PG-13', views: 187600, duration: '24 min', airedDay: 'Friday',
    popular: true, rank: 37, totalEpisodes: 12, releasedEpisodes: 4,
    genres: ['Fantasy', 'Adventure', 'Romance', 'Supernatural', 'Action'],
  },
  {
    slug: 'echo-of-swords', title: 'Echo of Swords', titleJp: '剣の残響', titleEn: 'Ken no Zankyō',
    synopsis: 'In an era of peace, the legendary swordsmen of a fallen empire wander the land, forbidden to draw their blades. When a young apprentice inherits a sword that has never been unsheathed, the silence of a generation threatens to shatter.',
    type: 'TV', status: 'Ongoing', studio: 'ufotable', source: 'Manga', releasedYear: 2024, season: 'Summer',
    score: 8.7, rating: 'R-17', views: 523400, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 38, totalEpisodes: 24, releasedEpisodes: 14,
    genres: ['Action', 'Historical', 'Drama', 'Adventure', 'Supernatural'],
  },
  {
    slug: 'garden-of-glass', title: 'Garden of Glass', titleJp: '硝子の庭', titleEn: 'Garasu no Niwa',
    synopsis: 'A glass-blower\'s apprentice in a city of artisans discovers her creations come alive at night—and one of them, a fragile glass dragon, has begun to remember a life it never had. A meditation on craft, memory, and the souls we shape without knowing.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.2, rating: 'PG-13', views: 112900, duration: '23 min', airedDay: 'Monday',
    popular: true, rank: 39, totalEpisodes: 12, releasedEpisodes: 6,
    genres: ['Slice of Life', 'Supernatural', 'Drama', 'Fantasy'],
  },
  {
    slug: 'black-iron-verdict', title: 'Black Iron Verdict', titleJp: '黒鉄の裁き', titleEn: 'Kurogane no Sabaki',
    synopsis: 'In a city where justice is dispensed by armored Inquisitors, a young judge begins to doubt the system when she sentences a man she knows is innocent. To uncover the truth, she must don the black iron herself—and face the very court she once served.',
    type: 'TV', status: 'Ongoing', studio: 'Production I.G', source: 'Manga', releasedYear: 2024, season: 'Winter',
    score: 8.5, rating: 'R-17', views: 298400, duration: '24 min', airedDay: 'Wednesday',
    trending: true, popular: true, rank: 40, totalEpisodes: 24, releasedEpisodes: 10,
    genres: ['Action', 'Mystery', 'Thriller', 'Psychological', 'Drama'],
  },
  {
    slug: 'aurora-bladesong', title: 'Aurora Bladesong', titleJp: '極光の剣歌', titleEn: 'Kyokkō no Kenka',
    synopsis: 'In the frozen north, a bard inherits a sword that sings the melody of the aurora—and with it, the power to cut through the veil between worlds. As she hunts the silence that devoured her village, she must learn that some songs are meant to be forgotten.',
    type: 'TV', status: 'Ongoing', studio: 'Madhouse', source: 'Light Novel', releasedYear: 2024, season: 'Winter',
    score: 8.6, rating: 'PG-13', views: 234500, duration: '24 min', airedDay: 'Thursday',
    trending: true, popular: true, rank: 41, totalEpisodes: 12, releasedEpisodes: 3,
    genres: ['Fantasy', 'Adventure', 'Music', 'Supernatural', 'Drama'],
  },
  {
    slug: 'ashen-crown', title: 'Ashen Crown', titleJp: '灰の王冠', titleEn: 'Hai no Ōkan',
    synopsis: 'A deposed prince returns to a kingdom of ash and bone, where the dead whisper from every wall. To reclaim his throne, he must don the crown of his enemy—a crown that devours the soul of its wearer.',
    type: 'TV', status: 'Ongoing', studio: 'Wit Studio', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.4, rating: 'R-17', views: 312800, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 42, totalEpisodes: 24, releasedEpisodes: 4,
    genres: ['Fantasy', 'Action', 'Drama', 'Supernatural', 'Historical'],
  },
  {
    slug: 'vermillion-tide', title: 'Vermillion Tide', titleJp: '朱色の潮', titleEn: 'Shuiro no Shio',
    synopsis: 'A fishing village cursed by a crimson sea discovers that every hundred years, the tide brings a bride. This year, the bride is a girl who can speak to the leviathan beneath the waves—and it is waking up.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Original', releasedYear: 2024, season: 'Summer',
    score: 8.2, rating: 'PG-13', views: 167900, duration: '23 min', airedDay: 'Wednesday',
    popular: true, rank: 43, totalEpisodes: 12, releasedEpisodes: 7,
    genres: ['Mystery', 'Supernatural', 'Horror', 'Drama', 'Fantasy'],
  },
  {
    slug: 'paper-lantern', title: 'Paper Lantern', titleJp: '紙灯籠', titleEn: 'Kami Tōrō',
    synopsis: 'A traveling lantern-maker discovers her paper creations are portals to forgotten memories. As she lights the way for ghosts seeking closure, she follows a thread that leads to her own forgotten past.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.3, rating: 'PG-13', views: 145600, duration: '23 min', airedDay: 'Monday',
    popular: true, rank: 44, totalEpisodes: 12, releasedEpisodes: 5,
    genres: ['Slice of Life', 'Supernatural', 'Drama', 'Mystery'],
  },
  {
    slug: 'obsidian-chess', title: 'Obsidian Chess', titleJp: '黒曜のチェス', titleEn: 'Kokuyō no Chesu',
    synopsis: 'A genius shogi player discovers her matches are being used by an ancient intelligence to determine the fate of nations. As the endgame approaches, she must outplay not just her opponent, but the game itself.',
    type: 'TV', status: 'Ongoing', studio: 'Production I.G', source: 'Manga', releasedYear: 2024, season: 'Winter',
    score: 8.5, rating: 'PG-13', views: 198300, duration: '24 min', airedDay: 'Friday',
    trending: true, popular: true, rank: 45, totalEpisodes: 24, releasedEpisodes: 9,
    genres: ['Psychological', 'Mystery', 'Drama', 'Supernatural', 'Thriller'],
  },
  {
    slug: 'silver-compass', title: 'Silver Compass', titleJp: '銀の羅針盤', titleEn: 'Gin no Rashinban',
    synopsis: 'A young navigator inherits a compass that points not north, but toward destiny. When the compass begins spinning wildly, she must sail to the edge of the mapped world to discover what it\'s trying to tell her.',
    type: 'TV', status: 'Ongoing', studio: 'Bones', source: 'Original', releasedYear: 2024, season: 'Spring',
    score: 8.1, rating: 'PG-13', views: 123400, duration: '24 min', airedDay: 'Tuesday',
    popular: true, rank: 46, totalEpisodes: 12, releasedEpisodes: 8,
    genres: ['Adventure', 'Fantasy', 'Action', 'Mystery'],
  },
  {
    slug: 'crimson-lullaby', title: 'Crimson Lullaby', titleJp: '紅の揺り籠', titleEn: 'Kurenai no Yurikago',
    synopsis: 'A lullaby that kills those who hear it sweeps through a city of insomniacs. A deaf girl who feels its vibrations in her bones may be the only one who can stop it—but only if she can stay awake long enough.',
    type: 'TV', status: 'Ongoing', studio: 'MAPPA', source: 'Original', releasedYear: 2024, season: 'Fall',
    score: 8.4, rating: 'R-17', views: 267800, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 47, totalEpisodes: 12, releasedEpisodes: 2,
    genres: ['Horror', 'Supernatural', 'Thriller', 'Mystery', 'Psychological'],
  },
  {
    slug: 'gilded-cage', title: 'Gilded Cage', titleJp: '金の檻', titleEn: 'Kin no Ori',
    synopsis: 'An orphan is adopted into the richest family in the kingdom—only to discover the gilded cage is a breeding ground for gods. As she uncovers the family\'s dark ritual, she must decide whether to become a god or burn the cage down.',
    type: 'TV', status: 'Ongoing', studio: 'CloverWorks', source: 'Light Novel', releasedYear: 2024, season: 'Summer',
    score: 8.3, rating: 'PG-13', views: 187600, duration: '24 min', airedDay: 'Friday',
    popular: true, rank: 48, totalEpisodes: 12, releasedEpisodes: 6,
    genres: ['Drama', 'Supernatural', 'Mystery', 'Psychological'],
  },
  {
    slug: 'thunderfall', title: 'Thunderfall', titleJp: '雷落ち', titleEn: 'Ikazuchi-ochi',
    synopsis: 'When lightning strikes a monk\'s temple, it brings with it a fragment of a fallen god. As the monk learns to wield the divine lightning, he attracts the attention of the nine thunder-kings who cast the god down.',
    type: 'TV', status: 'Ongoing', studio: 'A-1 Pictures', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.5, rating: 'PG-13', views: 298400, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 49, totalEpisodes: 24, releasedEpisodes: 4,
    genres: ['Action', 'Supernatural', 'Adventure', 'Fantasy'],
  },
  {
    slug: 'hollow-empire', title: 'Hollow Empire', titleJp: '空洞帝国', titleEn: 'Kūdō Teikoku',
    synopsis: 'The last city of a hollowed-out world floats above an endless void. When a young engineer discovers the city is sinking, she must descend into the void to find the legendary anchors that once held the world together.',
    type: 'TV', status: 'Ongoing', studio: 'Sunrise', source: 'Original', releasedYear: 2024, season: 'Winter',
    score: 8.2, rating: 'PG-13', views: 156700, duration: '24 min', airedDay: 'Wednesday',
    popular: true, rank: 50, totalEpisodes: 24, releasedEpisodes: 7,
    genres: ['Sci-Fi', 'Adventure', 'Action', 'Drama', 'Mystery'],
  },
  {
    slug: 'wisteria-garden', title: 'Wisteria Garden', titleJp: '藤の庭', titleEn: 'Fuji no Niwa',
    synopsis: 'A florist inherits a garden where wisteria blooms only at twilight—and only for those who are about to die. When a stranger asks her to grow wisteria for him, she discovers he\'s already been dead for a hundred years.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.0, rating: 'PG-13', views: 98700, duration: '23 min', airedDay: 'Monday',
    popular: true, rank: 51, totalEpisodes: 12, releasedEpisodes: 5,
    genres: ['Romance', 'Supernatural', 'Drama', 'Slice of Life', 'Mystery'],
  },
  {
    slug: 'blade-of-dawn', title: 'Blade of Dawn', titleJp: '暁の剣', titleEn: 'Akatsuki no Ken',
    synopsis: 'A swordsman who can only draw his blade at sunrise must protect a princess who can only sleep at dawn. Their impossible schedules make them the kingdom\'s most unlikely—and most dangerous—defenders.',
    type: 'TV', status: 'Ongoing', studio: 'ufotable', source: 'Light Novel', releasedYear: 2024, season: 'Summer',
    score: 8.6, rating: 'R-17', views: 389200, duration: '24 min', airedDay: 'Saturday',
    trending: true, popular: true, rank: 52, totalEpisodes: 24, releasedEpisodes: 8,
    genres: ['Action', 'Romance', 'Fantasy', 'Adventure', 'Supernatural'],
  },
  {
    slug: 'inkbound', title: 'Inkbound', titleJp: '墨の絆', titleEn: 'Sumi no Kizuna',
    synopsis: 'A calligrapher discovers that the characters she writes come alive—and one of them, a demon she accidentally summoned, is bound to her by the ink in her veins. Together they hunt the characters she\'s lost control of.',
    type: 'TV', status: 'Ongoing', studio: 'Production I.G', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.3, rating: 'PG-13', views: 178900, duration: '24 min', airedDay: 'Tuesday',
    popular: true, rank: 53, totalEpisodes: 12, releasedEpisodes: 3,
    genres: ['Supernatural', 'Action', 'Adventure', 'Fantasy', 'Drama'],
  },
  {
    slug: 'starlight-requiem', title: 'Starlight Requiem', titleJp: '星屑の鎮魂歌', titleEn: 'Hoshikuzu no Chinkonka',
    synopsis: 'A conductor who can hear the music of dying stars must perform a requiem for a galaxy about to collapse. Her orchestra is a crew of misfits, each carrying a fragment of the song that could save—or end—everything.',
    type: 'TV', status: 'Ongoing', studio: 'Kyoto Animation', source: 'Original', releasedYear: 2024, season: 'Winter',
    score: 8.7, rating: 'PG-13', views: 312400, duration: '24 min', airedDay: 'Thursday',
    trending: true, popular: true, rank: 54, totalEpisodes: 24, releasedEpisodes: 6,
    genres: ['Sci-Fi', 'Music', 'Drama', 'Adventure', 'Supernatural'],
  },
  {
    slug: 'phantom-parade', title: 'Phantom Parade', titleJp: '幻のパレード', titleEn: 'Maboroshi no Parēdo',
    synopsis: 'Every hundred years, a parade of ghosts marches through the city, granting one wish to the living who dare to watch. A girl who lost her brother joins the parade to find him—and discovers the parade has been looking for her, too.',
    type: 'TV', status: 'Ongoing', studio: 'CloverWorks', source: 'Original', releasedYear: 2024, season: 'Summer',
    score: 8.1, rating: 'PG-13', views: 134600, duration: '23 min', airedDay: 'Friday',
    popular: true, rank: 55, totalEpisodes: 12, releasedEpisodes: 4,
    genres: ['Supernatural', 'Drama', 'Fantasy', 'Mystery'],
  },
  {
    slug: 'iron-widow', title: 'Iron Widow', titleJp: '鉄の未亡人', titleEn: 'Tetsu no Mibōjin',
    synopsis: 'After her mech-pilot husband dies in battle, a war widow discovers his death wasn\'t an accident—it was an execution. To find the truth, she dons his iron armor and enters the tournament that killed him.',
    type: 'TV', status: 'Ongoing', studio: 'Sunrise', source: 'Manga', releasedYear: 2024, season: 'Fall',
    score: 8.5, rating: 'R-17', views: 256700, duration: '24 min', airedDay: 'Sunday',
    trending: true, popular: true, rank: 56, totalEpisodes: 24, releasedEpisodes: 5,
    genres: ['Mecha', 'Action', 'Drama', 'Mystery', 'Thriller'],
  },
  {
    slug: 'moonlit-orchard', title: 'Moonlit Orchard', titleJp: '月夜の果樹園', titleEn: 'Tsukiyo no Kaju-en',
    synopsis: 'A fruit farmer discovers her moonlit harvests grant whoever eats them a single perfect memory of a life they never lived. As the village lines up for her fruit, she must decide what to do with the memories no one wants.',
    type: 'TV', status: 'Ongoing', studio: 'P.A. Works', source: 'Light Novel', releasedYear: 2024, season: 'Spring',
    score: 8.0, rating: 'PG-13', views: 87600, duration: '23 min', airedDay: 'Monday',
    popular: true, rank: 57, totalEpisodes: 12, releasedEpisodes: 7,
    genres: ['Slice of Life', 'Supernatural', 'Drama', 'Fantasy'],
  },
  {
    slug: 'crimson-archive', title: 'Crimson Archive', titleJp: '紅の書庫', titleEn: 'Kurenai no Shoko',
    synopsis: 'A librarian discovers a forbidden archive that contains every death that hasn\'t happened yet. When she reads her own name, she has seven days to find the author—or become the next entry.',
    type: 'TV', status: 'Upcoming', studio: 'Madhouse', source: 'Light Novel', releasedYear: 2025, season: 'Winter',
    score: 8.4, rating: 'R-17', views: 223800, duration: '24 min', airedDay: 'Wednesday',
    trending: true, popular: true, rank: 58, totalEpisodes: 12, releasedEpisodes: 2,
    genres: ['Mystery', 'Supernatural', 'Thriller', 'Psychological', 'Horror'],
  },
  {
    slug: 'golden-kite', title: 'Golden Kite', titleJp: '金の鳶', titleEn: 'Kin no Tobu',
    synopsis: 'A kite-maker in a war-torn kingdom discovers her golden kites can carry prayers to the gods. As both sides of the war demand her services, she must decide which prayers are worth answering—and which gods are worth waking.',
    type: 'TV', status: 'Upcoming', studio: 'Wit Studio', source: 'Original', releasedYear: 2025, season: 'Spring',
    score: 8.2, rating: 'PG-13', views: 167500, duration: '24 min', airedDay: 'Saturday',
    popular: true, rank: 59, totalEpisodes: 12, releasedEpisodes: 6,
    genres: ['Fantasy', 'Drama', 'Supernatural', 'Adventure', 'Historical'],
  },
  {
    slug: 'velvet-throne', title: 'Velvet Throne', titleJp: '天鵝絨の玉座', titleEn: 'Tenjōmō no Gyokuza',
    synopsis: 'A courtesan with a photographic memory becomes the power behind a dying throne. As she manipulates the kingdom from the shadows, she discovers the throne has been manipulating her for far longer.',
    type: 'TV', status: 'Upcoming', studio: 'A-1 Pictures', source: 'Light Novel', releasedYear: 2025, season: 'Spring',
    score: 8.6, rating: 'R-17', views: 345600, duration: '24 min', airedDay: 'Friday',
    trending: true, popular: true, rank: 60, totalEpisodes: 24, releasedEpisodes: 3,
    genres: ['Drama', 'Historical', 'Psychological', 'Romance', 'Mystery'],
  },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Clearing existing data...');
  await db.animeRelation.deleteMany();
  await db.episode.deleteMany();
  await db.animeGenre.deleteMany();
  await db.animeCharacter.deleteMany();
  await db.animeStaff.deleteMany();
  await db.character.deleteMany();
  await db.staff.deleteMany();
  await db.genre.deleteMany();
  await db.anime.deleteMany();

  console.log('Creating genres...');
  const genreMap = new Map<string, string>();
  const allGenres = new Set<string>();
  ANIMES.forEach(a => a.genres.forEach(g => allGenres.add(g)));
  GENRES.forEach(g => allGenres.add(g));
  for (const name of Array.from(allGenres)) {
    const g = await db.genre.create({ data: { name, slug: slugify(name) } });
    genreMap.set(name, g.id);
  }

  // Pre-create a pool of characters and staff (reused across anime)
  console.log('Creating character pool...');
  const characterPool = [
    { name: 'Kaito Arashi', nameJp: '嵐海斗', role: 'Main Protagonist', desc: 'A determined young swordsman haunted by his clan\'s massacre.' },
    { name: 'Yuki Hoshino', nameJp: '星野雪', role: 'Main Heroine', desc: 'A shrine maiden with dormant celestial powers.' },
    { name: 'Rin Asakura', nameJp: '朝倉凛', role: 'Supporting', desc: 'A witty tactician with a tragic past.' },
    { name: 'Sora Mizushima', nameJp: '水島空', role: 'Supporting', desc: 'A quiet prodigy bound by duty.' },
    { name: 'Akane Kuroda', nameJp: '黒田茜', role: 'Antagonist', desc: 'A fallen knight seeking vengeance against the kingdom.' },
    { name: 'Ren Takami', nameJp: '高見蓮', role: 'Main Protagonist', desc: 'A carefree wanderer with a hidden lineage.' },
    { name: 'Hana Shiratori', nameJp: '白鳥花', role: 'Main Heroine', desc: 'A mysterious girl who speaks with spirits.' },
    { name: 'Goro Onigawara', nameJp: '鬼瓦五郎', role: 'Supporting', desc: 'A gruff warrior with a soft heart.' },
    { name: 'Mei Suzuno', nameJp: '鈴野芽衣', role: 'Supporting', desc: 'A brilliant inventor in a steampunk world.' },
    { name: 'Tatsuya Ryuusei', nameJp: '流星辰也', role: 'Antagonist', desc: 'A charismatic cult leader with god-like powers.' },
    { name: 'Aoi Natsukawa', nameJp: '夏川葵', role: 'Main Protagonist', desc: 'A shy librarian who discovers time magic.' },
    { name: 'Kana Furuya', nameJp: '古屋佳奈', role: 'Main Heroine', desc: 'A phantom thief with a heart of gold.' },
    { name: 'Sakuya Hiiragi', nameJp: '柊朔也', role: 'Supporting', desc: 'A demon hunter with a cursed bloodline.' },
    { name: 'Koharu Tendo', nameJp: '天道心春', role: 'Supporting', desc: 'A mecha pilot haunted by her past missions.' },
    { name: 'Ibara Kageyama', nameJp: '影山茨', role: 'Antagonist', desc: 'A shadow manipulator serving a forgotten god.' },
    { name: 'Yamato Tsukishima', nameJp: '月島大和', role: 'Main Protagonist', desc: 'A detective who can speak with the dead.' },
    { name: 'Satsuki Kamizaki', nameJp: '上崎皐月', role: 'Main Heroine', desc: 'A weather-witch who rides typhoons.' },
    { name: 'Hikaru Nanase', nameJp: '七瀬光', role: 'Supporting', desc: 'A musician searching for a lost melody.' },
    { name: 'Nanami Kouda', nameJp: '幸田七海', role: 'Supporting', desc: 'A beast-tamer with a fox spirit companion.' },
    { name: 'Subaru Ichinose', nameJp: '一ノ瀬昴', role: 'Antagonist', desc: 'A fallen prince orchestrating the kingdom\'s ruin.' },
  ];
  const charMap = new Map<string, string>();
  for (const c of characterPool) {
    const slug = slugify(c.name);
    const ch = await db.character.create({
      data: { slug, name: c.name, nameJp: c.nameJp, role: c.role, description: c.desc, image: null },
    });
    charMap.set(c.name, ch.id);
  }

  console.log('Creating staff pool...');
  const staffPool = [
    { name: 'Hayao Mizuki', nameJp: '水木速夫', role: 'Director' },
    { name: 'Akira Tanaka', nameJp: '田中明', role: 'Series Director' },
    { name: 'Yoko Kanno', nameJp: '菅野洋子', role: 'Music Composer' },
    { name: 'Kenji Nakamura', nameJp: '中村健二', role: 'Character Designer' },
    { name: 'Sawako Natori', nameJp: '名取澤子', role: 'Script Writer' },
    { name: 'Takahiro Sato', nameJp: '佐藤隆弘', role: 'Animation Director' },
    { name: 'Mayumi Ono', nameJp: '小野真由美', role: 'Art Director' },
    { name: 'Daisuke Iwasaki', nameJp: '岩崎大輔', role: 'Sound Director' },
    { name: 'Reiko Yoshida', nameJp: '吉田玲子', role: 'Script Writer' },
    { name: 'Hiroshi Kamiya', nameJp: '神谷浩史', role: 'Voice Director' },
  ];
  const staffMap = new Map<string, string>();
  for (const s of staffPool) {
    const slug = slugify(s.name);
    const st = await db.staff.create({ data: { slug, name: s.name, nameJp: s.nameJp, role: s.role, image: null } });
    staffMap.set(s.name, st.id);
  }

  console.log('Creating anime + episodes...');
  const now = Date.now();
  let i = 0;
  const animeIdMap = new Map<string, string>(); // slug -> id
  for (const a of ANIMES) {
    const poster = `/anime/poster-${a.slug}.svg`;
    const banner = fs.existsSync(path.join(process.cwd(), 'public', 'anime', `banner-${a.slug}.svg`))
      ? `/anime/banner-${a.slug}.svg`
      : null;
    const anime = await db.anime.create({
      data: {
        slug: a.slug,
        title: a.title,
        titleEn: a.titleEn ?? null,
        titleJp: a.titleJp,
        synopsis: a.synopsis,
        poster,
        banner,
        type: a.type,
        status: a.status,
        studio: a.studio,
        source: a.source,
        releasedYear: a.releasedYear,
        season: a.season,
        score: a.score,
        rating: a.rating,
        views: a.views,
        duration: a.duration,
        airedDay: a.airedDay ?? null,
        featured: a.featured ?? false,
        trending: a.trending ?? false,
        popular: a.popular ?? false,
        rank: a.rank ?? null,
        totalEpisodes: a.totalEpisodes ?? null,
        releasedEpisodes: a.releasedEpisodes ?? null,
        genres: { create: a.genres.map(name => ({ genreId: genreMap.get(name)! })) },
        // Assign 4-6 characters per anime (rotating from pool based on index)
        characters: {
          create: characterPool
            .slice((i * 4) % (characterPool.length - 5), (i * 4) % (characterPool.length - 5) + 5)
            .map((c) => ({ characterId: charMap.get(c.name)!, role: c.role })),
        },
        // Assign 3-4 staff per anime (rotating from pool)
        staff: {
          create: staffPool
            .slice((i * 3) % (staffPool.length - 3), (i * 3) % (staffPool.length - 3) + 4)
            .map((s) => ({ staffId: staffMap.get(s.name)!, role: s.role })),
        },
      },
    });

    // Create episodes for ongoing/released anime
    const epCount = a.releasedEpisodes ?? 0;
    for (let n = 1; n <= epCount; n++) {
      // Make the latest episode (n === epCount) released recently
      // ~40% of anime have today's latest episode; rest spread out
      let hoursAgo: number;
      if (n === epCount && i % 3 === 0) {
        // Latest episode released within last 24h
        hoursAgo = (i % 12); // 0-11 hours ago
      } else {
        hoursAgo = (epCount - n) * 30 + (i % 5) * 6;
      }
      const releasedAt = new Date(now - hoursAgo * 3600 * 1000);
      await db.episode.create({
        data: {
          animeId: anime.id,
          number: n,
          title: `Episode ${n}`,
          thumbnail: poster,
          duration: a.duration,
          releasedAt,
          views: Math.floor(a.views / Math.max(epCount, 1) * (0.5 + 1 / n)),
          download720: `https://example.com/dl/${a.slug}/${n}/720p`,
          download1080: `https://example.com/dl/${a.slug}/${n}/1080p`,
          download480: `https://example.com/dl/${a.slug}/${n}/480p`,
        },
      });
    }
    i++;
    animeIdMap.set(a.slug, anime.id);
    console.log(`  ${a.title}: ${epCount} episodes`);
  }

  // Create anime relations (sequels/prequels/spin-offs)
  console.log('Creating anime relations...');
  const RELATIONS: { from: string; to: string; type: string }[] = [
    { from: 'shadow-blade', to: 'celestial-blade', type: 'Side Story' },
    { from: 'shadow-blade', to: 'echo-of-swords', type: 'Spin-off' },
    { from: 'demon-hunter', to: 'spirit-realm', type: 'Sequel' },
    { from: 'neon-samurai', to: 'iron-widow', type: 'Alternative' },
    { from: 'dragon-legacy', to: 'storm-rider-saga', type: 'Prequel' },
    { from: 'crystal-kingdom', to: 'frozen-crown', type: 'Sequel' },
    { from: 'celestial-academy', to: 'astral-knights', type: 'Spin-off' },
    { from: 'mecha-warriors', to: 'iron-blood-orphan', type: 'Prequel' },
    { from: 'phantom-detective', to: 'crimson-archive', type: 'Side Story' },
    { from: 'starlight-requiem', to: 'star-voyager', type: 'Alternative' },
    { from: 'cherry-blossom', to: 'summer-rain-song', type: 'Sequel' },
    { from: 'thunder-god', to: 'thunderfall', type: 'Sequel' },
    { from: 'ocean-queen', to: 'vermillion-tide', type: 'Prequel' },
    { from: 'phantom-blade', to: 'inkbound', type: 'Side Story' },
    { from: 'iron-fortress', to: 'hollow-empire', type: 'Alternative' },
    { from: 'eternal-warriors', to: 'velvet-throne', type: 'Spin-off' },
    { from: 'frost-wizard', to: 'aurora-bladesong', type: 'Side Story' },
    { from: 'ember-knight', to: 'ashen-crown', type: 'Sequel' },
    { from: 'serene-garden', to: 'wisteria-garden', type: 'Alternative' },
    { from: 'beast-tamer', to: 'silver-wolf-pact', type: 'Side Story' },
    { from: 'void-hunter', to: 'obsidian-chess', type: 'Spin-off' },
    { from: 'samurai-spirit', to: 'blade-of-dawn', type: 'Prequel' },
    { from: 'crimson-rose', to: 'gilded-cage', type: 'Sequel' },
    { from: 'moonlight-waltz', to: 'paper-lantern', type: 'Side Story' },
    { from: 'last-train-home', to: 'golden-kite', type: 'Spin-off' },
  ];
  for (const rel of RELATIONS) {
    const fromId = animeIdMap.get(rel.from);
    const toId = animeIdMap.get(rel.to);
    if (fromId && toId) {
      await db.animeRelation.create({
        data: { fromAnimeId: fromId, toAnimeId: toId, relation: rel.type },
      });
    }
  }
  console.log(`  ${RELATIONS.length} relations created`);

  const counts = {
    anime: await db.anime.count(),
    genres: await db.genre.count(),
    episodes: await db.episode.count(),
    characters: await db.character.count(),
    staff: await db.staff.count(),
    relations: await db.animeRelation.count(),
  };
  console.log('Seed complete:', counts);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(async () => { await db.$disconnect(); });

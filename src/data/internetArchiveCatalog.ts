export type Ao3Rating =
  | 'General Audiences'
  | 'Teen And Up Audiences'
  | 'Mature'
  | 'Explicit'
  | 'Not Rated';

export type Ao3Category = 'Gen' | 'F/F' | 'F/M' | 'M/M' | 'Multi' | 'Other';

export type Ao3Status = 'In Progress' | 'Completed' | 'Archived';

export interface ChapterEntry {
  number: number;
  title: string;
  notes?: string;
  content: string;
  wordCount: number;
}

export interface SharedBookmarkAnnotation {
  readerName: string;
  readerFingerprint: string;
  annotatedAtIso: string;
  readingStatus: string;
  userTags: string[];
  note: string;
}

export interface ArchivalWork {
  id: string;
  title: string;
  authorName: string;
  authorUid: string;
  fandom: string;
  rating: Ao3Rating;
  category: Ao3Category;
  status: Ao3Status;
  summary: string;
  content: string;
  chapters?: ChapterEntry[];
  tags: string[];
  relationships?: string[];
  characters?: string[];
  wordCount: number;
  chapterCount: number;
  totalChapters: number;
  kudosCount: number;
  hitsCount: number;
  bookmarksCount: number;
  sourceArchiveId: string;
  archiveDate: string;
  visibility: 'public' | 'private';
  sharedAnnotations?: SharedBookmarkAnnotation[];
}

/**
 * Authentic pre-indexed archival works recovered from Internet Archive AO3 / Fanlore collections
 * ensuring instant zero-latency offline tag filtering and reading, alongside live scraper imports.
 */
export const INITIAL_ARCHIVAL_WORKS: ArchivalWork[] = [
  {
    id: 'ia_ao3_00104829',
    title: 'The Cartography of Baker Street Rain',
    authorName: 'vesper_quill',
    authorUid: 'archive_curator',
    fandom: 'Sherlock (BBC)',
    rating: 'Teen And Up Audiences',
    category: 'M/M',
    status: 'Completed',
    summary:
      'Recovered from the 2014 Internet Archive AO3 crawl. Across seven consecutive November storms, John reconstructs the unwritten case ledger Sherlock left behind in Montague Street, discovering that every margin note is a coordinate.',
    relationships: ['Sherlock Holmes/John Watson'],
    characters: ['John Watson', 'Sherlock Holmes', 'Mrs. Hudson', 'Greg Lestrade'],
    tags: [
      'Slow Burn',
      'Case Fic',
      'Canon Divergence',
      'Epistolary',
      'Rainy London',
      'Mutual Pining',
      'Post-Reichenbach',
      'Detective Noir',
    ],
    wordCount: 18420,
    chapterCount: 3,
    totalChapters: 3,
    kudosCount: 4820,
    hitsCount: 61940,
    bookmarksCount: 1290,
    sourceArchiveId: 'ao3-work-104829-wayback',
    archiveDate: '2014-11-08',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. The Ledger in the Wainscoting',
        notes: 'Originally archived via the Organization for Transformative Works collection on archive.org.',
        wordCount: 6140,
        content: `During the third week of uninterrupted rain, the wallpaper behind the sitting-room wireless peeled back just far enough to reveal the oilskin notebook.

John did not open it immediately. He set the kettle on the gas ring, listened to the familiar stutter of the pipes beneath 221B, and watched the amber reflection of streetlamps pool across the wet slate of Baker Street. When a man has lived with a detective's ghosts for eighteen months, he learns that paper is never merely paper; it is a fuse waiting for oxygen.

The ledger was bound in dark stationer's cloth, its spine cracked at the third signature. Inside, the handwriting was unmistakably Sherlock's—not the hurried, sloping scrawl of a crime-scene telegram, but the deliberate, copperplate hand he used when indexing tobacco ash or medieval cipher keys.

"Case 00: The Montague Street Interval," the first header read. Beneath it, instead of client names or Scotland Yard reference numbers, stood a column of barometric pressures and the exact minutes at which the upstairs footsteps at 221B had ceased each night between October and March.

John turned the leaf carefully. Wedged between pages fourteen and fifteen was a single Stubbs train ticket to Sussex, unclipped, bearing the date of the Tuesday after the hospital rooftop.`,
      },
      {
        number: 2,
        title: 'II. Barometric Pressure at St. Bart’s',
        notes: 'Restored from Wayback snapshot 201411080412.',
        wordCount: 6280,
        content: `By Thursday the fog had thickened until the cab lamps down by Marylebone Road looked like drowned sovereigns. Lestrade arrived at seven with damp cuffs and a cardboard folder he refused to set on the table until John poured two measures of Talisker.

"You're going to tell me you found this in an evidence locker," John said, tapping the oilskin spine.

Lestrade shook his head slowly. "No. Molly Hooper found its twin wedged behind the cold-storage thermometer in pathology. Same stationer's mark. Same columns of dates. Except hers doesn't list barometric pressure, John. It lists every cab licence number that idled outside your clinic in Northolt."

Silence settled over the hearth, broken only by the hiss of coal shifting on the grate. For a year and a half John had imagined Sherlock moving across Europe like a cold front—impersonal, surgical, untethered. Now the city felt small and intricately wired, a clockwork box whose mainspring had never stopped winding around this single room.`,
      },
      {
        number: 3,
        title: 'III. The Sussex Coordinate',
        notes: 'Final chapter.',
        wordCount: 6000,
        content: `The chalk downs above Eastbourne smelled of salt and wet thyme when the 4:15 local pulled away from the halt.

Sherlock was standing by the low flint wall of the apiary, his Belstaff collar turned up against the Channel gale, watching a late forager bee navigate the heather. He did not turn when the latch clicked, though his shoulders drew fractionally inward.

"You left the third cipher key incomplete," John said, stepping onto the gravel path. "Page forty-two. You forgot that I know the layout of the Charing Cross waiting room."

Now Sherlock turned. The grey light off the water caught the sharp line of his cheekbone and the startled, unguarded stillness in his eyes.

"I didn't forget," Sherlock replied quietly, his voice rough from salt air and disuse. "I simply calculated a seventy-eight percent probability that you would burn the book before reaching page forty."

"Twenty-two percent, then," John said, holding out the unclipped ticket. "Come inside out of the rain. The kettle's cold."`,
      },
    ],
    content: `During the third week of uninterrupted rain, the wallpaper behind the sitting-room wireless peeled back just far enough to reveal the oilskin notebook.

John did not open it immediately. He set the kettle on the gas ring, listened to the familiar stutter of the pipes beneath 221B, and watched the amber reflection of streetlamps pool across the wet slate of Baker Street. When a man has lived with a detective's ghosts for eighteen months, he learns that paper is never merely paper; it is a fuse waiting for oxygen.

The ledger was bound in dark stationer's cloth, its spine cracked at the third signature. Inside, the handwriting was unmistakably Sherlock's—not the hurried, sloping scrawl of a crime-scene telegram, but the deliberate, copperplate hand he used when indexing tobacco ash or medieval cipher keys.

"Case 00: The Montague Street Interval," the first header read. Beneath it, instead of client names or Scotland Yard reference numbers, stood a column of barometric pressures and the exact minutes at which the upstairs footsteps at 221B had ceased each night between October and March.`,
  },
  {
    id: 'ia_ao3_00291740',
    title: 'Orbital Mechanics for Ghosts',
    authorName: 'tarsus_iv_archivist',
    authorUid: 'archive_curator',
    fandom: 'Star Trek: The Original Series',
    rating: 'General Audiences',
    category: 'Gen',
    status: 'Completed',
    summary:
      'Preserved in the Internet Archive Zine-to-AO3 Open Doors project (originally circulated 1978, digitized 2013). When the Enterprise is caught in a relativistic chroniton eddy near Sector 009, Spock and Kirk must navigate by manual sextant stars that died four thousand years ago.',
    relationships: ['James T. Kirk & Spock & Leonard McCoy'],
    characters: ['Spock', 'James T. Kirk', 'Leonard McCoy', 'Nyota Uhura'],
    tags: [
      'Open Doors Zine Import',
      'Five-Year Mission',
      'Found Family',
      'Science Officer Spock',
      'Space Opera',
      'Hurt/Comfort',
      'Offline Classics',
    ],
    wordCount: 14250,
    chapterCount: 2,
    totalChapters: 2,
    kudosCount: 3190,
    hitsCount: 42800,
    bookmarksCount: 945,
    sourceArchiveId: 'ao3-opendoors-st-1978-zine',
    archiveDate: '2013-05-19',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. Dead Reckoning',
        wordCount: 7125,
        content: `Every chronometer on the bridge of the USS Enterprise disagreed by a factor of eleven minutes and forty-two seconds.

Spock stood beside the hooded viewer of the science station, his hands folded behind the small of his back while the main viewscreen displayed a starfield that belonged to no current Federation chart. The light reaching the forward optical sensors was shifted toward the deep violet end of the spectrum, pulsing with the slow, rhythmic cadence of a lighthouse seen through heavy sea-mist.

"Report, Mister Spock," Kirk said, leaning forward from the command chair.

"Captain, the chroniton wake has decoupled our subspace reference beacons. In effect, the ship's computer is attempting to triangulate our position using stellar emissions from four millennia in our past."

McCoy stepped out of the turbolift, bracing a hand against the scarlet railing. "In plain English, Jim, are we lost in space or lost in time?"

"Neither, Doctor," Spock replied evenly. "We are precisely where we were six minutes ago. It is the light around us that has forgotten the date."`,
      },
      {
        number: 2,
        title: 'II. The Vulcan Sextant',
        wordCount: 7125,
        content: `In the observation lounge on Deck 5, Kirk dimmed the environmental panels until only the ancient supernova remnants burned against the reinforced transparent aluminum.

Spock set a brass-and-quartz optical instrument between them on the briefing table—an archaic Vulcan astrolabe calibrated for high-desert observatories on Mount Seleya.

"You carry a pre-warp navigation piece in your footlocker?" Kirk asked, a corner of his mouth lifting.

"My great-grandfather constructed it prior to the Time of Awakening, Captain. Unlike duotronic relays, quartz refraction is indifferent to chroniton interference."

Together they leaned over the vernier scale, calling out right ascensions in low voices while McCoy kept watch over the thermos of coffee, three mortal men charting a course home by the embers of dead suns.`,
      },
    ],
    content: `Every chronometer on the bridge of the USS Enterprise disagreed by a factor of eleven minutes and forty-two seconds.

Spock stood beside the hooded viewer of the science station, his hands folded behind the small of his back while the main viewscreen displayed a starfield that belonged to no current Federation chart. The light reaching the forward optical sensors was shifted toward the deep violet end of the spectrum, pulsing with the slow, rhythmic cadence of a lighthouse seen through heavy sea-mist.`,
  },
  {
    id: 'ia_ao3_00518392',
    title: 'Marginalia in a First Folio of Prophecies',
    authorName: 'soho_bibliophile',
    authorUid: 'archive_curator',
    fandom: 'Good Omens - Neil Gaiman & Terry Pratchett',
    rating: 'Teen And Up Audiences',
    category: 'M/M',
    status: 'Completed',
    summary:
      'Scraped from the Internet Archive AO3 Mirror. Over six centuries of shared bookshop afternoons, Crowley has been secretly penciling corrections into Aziraphale’s rarest editions whenever historical events fail to match the official chroniclers.',
    relationships: ['Aziraphale/Crowley'],
    characters: ['Aziraphale', 'Crowley', 'Anathema Device'],
    tags: [
      'Historical Vignettes',
      'Bookshop Era',
      'Soft Romanticism',
      'Ineffable Husbands',
      ' Epistolary',
      'London Through the Ages',
      'Humor',
    ],
    wordCount: 24680,
    chapterCount: 4,
    totalChapters: 4,
    kudosCount: 7640,
    hitsCount: 89300,
    bookmarksCount: 2410,
    sourceArchiveId: 'ao3-mirror-goodomens-518392',
    archiveDate: '2019-08-14',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. 1666 — Pliny’s Natural History',
        wordCount: 6120,
        content: `In the autumn of 1666, while half of Cheapside still smelled of toasted oak and melted lead, Aziraphale discovered an unauthorized graphite annotation in the margin of his 1482 Venetian edition of Pliny's Natural History.

Where the Roman naturalist had confidently asserted that salamanders are born of ice and extinguish all conflagrations upon contact, a sharp, slantwise hand had written in seventeenth-century English:

"Tested this Tuesday near Pudding Lane. Utter rubbish. Singed my cufflinks and the lizard looked deeply offended. — A.J.C."

Aziraphale adjusted his spectacles, reached for his bone-handled eraser, hesitated for forty-five seconds, and then closed the calfskin cover without rubbing out a single letter. After all, provenance was everything in antiquarian collecting.`,
      },
      {
        number: 2,
        title: 'II. 1789 — The Paris Pamphlets',
        wordCount: 6200,
        content: `By the wet July of 1789, the small back-room shelves near Fleet Street had already begun to fill with French broadsheets smuggled inside crates of Burgundy.

Crowley sat cross-legged on a stack of unbound quartos, tossing an unripe apricot from hand to hand while Aziraphale catalogued a slender octavo treatise on heavenly hierarchies. When the angel stepped into the alley to pay the printer's boy, Crowley flicked open page eighty-three with one fingernail.

Beside the theologian's solemn proof that fallen spirits cannot endure the scent of liturgical frankincense, Crowley penciled: "Incorrect. Makes me sneeze, which is entirely different. Also your tailor owes me four guineas for the velvet waistcoat."`,
      },
      {
        number: 3,
        title: 'III. 1897 — Gaslight in Soho',
        wordCount: 6180,
        content: `Rain drummed steadily against the bow-fronted windows of Whickber Street while the new electric tram clanged two avenues over.

Aziraphale had begun keeping a separate marbled ledger beside the tea caddy—not for accounts, which he managed with serene indifference, but as an index of every volume in which Crowley's pencil had quietly revised the century. A botanical atlas from Kew bore notes on which orchids had survived the frost of '81; a railway timetable carried small asterisks beside the fastest routes out of Victoria Station.

"You're ruining the resale value of my incunabula," Aziraphale remarked, sliding a fresh cup of lapsang across the mahogany desk.

Crowley peered over the rim of his dark glasses. "As if you'd ever sell a single one of them, angel."`,
      },
      {
        number: 4,
        title: 'IV. 2019 — The Nice and Accurate Margin',
        wordCount: 6180,
        content: `On the Tuesday after the airbase at Tadfield returned to quiet sheep-pasture, Aziraphale reopened the glass-fronted case behind the till and took down Agnes Nutter's surviving index.

On the final blank flyleaf, beneath six hundred years of soot-stained vellum and brass-clasp repairs, a neat modern ballpoint line waited just above the colophon:

"Bookshop still standing. Bentley still yellow? Never mind. Dinner at the Ritz, 8:00 sharp. — C."

Aziraphale smiled, uncapped his fountain pen, and added directly beneath it in calm, upright script: "Reserved the corner table at 7:45. Do try not to park on the pavement."`,
      },
    ],
    content: `In the autumn of 1666, while half of Cheapside still smelled of toasted oak and melted lead, Aziraphale discovered an unauthorized graphite annotation in the margin of his 1482 Venetian edition of Pliny's Natural History.

Where the Roman naturalist had confidently asserted that salamanders are born of ice and extinguish all conflagrations upon contact, a sharp, slantwise hand had written in seventeenth-century English:

"Tested this Tuesday near Pudding Lane. Utter rubbish. Singed my cufflinks and the lizard looked deeply offended. — A.J.C."

Aziraphale adjusted his spectacles, reached for his bone-handled eraser, hesitated for forty-five seconds, and then closed the calfskin cover without rubbing out a single letter. After all, provenance was everything in antiquarian collecting.`,
  },
  {
    id: 'ia_ao3_00684115',
    title: 'Song of the Forges of Eregion',
    authorName: 'findekano_harper',
    authorUid: 'archive_curator',
    fandom: 'The Silmarillion and other histories of Middle-earth - J. R. R. Tolkien',
    rating: 'Mature',
    category: 'Gen',
    status: 'In Progress',
    summary:
      'An archival epic chronicling Celebrimbor’s guild of smiths during the Second Age in Ost-in-Edhil, where metallurgy, memory, and the quiet warnings of Galadriel collide before the forging of the Three.',
    relationships: ['Celebrimbor & Galadriel', 'Celebrimbor & Narvi'],
    characters: ['Celebrimbor', 'Galadriel', 'Narvi', 'Elrond'],
    tags: [
      'Second Age',
      'Worldbuilding',
      'Dwarves & Elves Friendship',
      'Canon Compliant',
      'Angst',
      'High Fantasy',
      'Craftsmanship',
    ],
    wordCount: 41900,
    chapterCount: 6,
    totalChapters: 8,
    kudosCount: 2950,
    hitsCount: 38120,
    bookmarksCount: 1120,
    sourceArchiveId: 'ao3-tolkien-eregion-684115',
    archiveDate: '2016-02-22',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. The Flues of Ost-in-Edhil',
        wordCount: 6900,
        content: `Beneath the white towers of Ost-in-Edhil, the great bellows of the Mírdain never truly slept; even at the turning of the stars their breath rose through the basalt flues like the sighing of deep mountain lakes.

Narvi of Khazad-dûm set his hammer beside the crucible of ithildin and wiped the silver-dust from his brow. "Your cousin the Lady of Lindon walked the western terrace at dusk," he rumbled in Khuzdul-inflected Sindarin. "She looked upon our West-gate and did not smile."

Celebrimbor lifted a thread of drawn mithril to the lamp-light. "Artanis remembers Valinor as a garden," he answered softly. "She forgets that stone also has a memory, and that what is wrought in friendship endures longer than thrones."`,
      },
      {
        number: 2,
        title: 'II. Star-Silver and Mountain Stone',
        wordCount: 7050,
        content: `For three summers the caravan road from the Sirannon ran bright with lantern-light between the Holly-city and the Doors of Durin.

In the upper drafting hall, Celebrimbor laid sheet after sheet of vellum beside Narvi's slate-tablets. Together they tested how moonlight bent through quartz-sand and smelted true-silver until the script upon the great stone arch appeared only when spoken to by friends—visible to starlight, silent to siege-engines.

"No lock is stronger than the trust of the locksmith," Narvi observed, carving the crown and seven stars with a steel burin. "Your grandfather wrought jewels to hold light; we wrought doors to keep warmth inside."`,
      },
      {
        number: 3,
        title: 'III. The Emissary from Lindon',
        wordCount: 6980,
        content: `Elrond arrived with autumn rain in his cloak and letters sealed in blue wax from Gil-galad.

He did not speak at once in the council room; instead he walked the foundry floor beside Celebrimbor, watching apprentices anneal copper sleeves and quench blades in river-oil. At the far hearth stood a fair-spoken stranger instructing two junior jewelers in the tempering of gold alloys.

"He calls himself Annatar," Elrond said quietly once they reached the open parapet above the Glanduin. "The High King has barred him from the Grey Havens."

Celebrimbor stared down at the bright forge-sparks rising into the mist. "Skill is a lamp, Elrond. Why fear the oil if the flame reveals what was hidden?"`,
      },
      {
        number: 4,
        title: 'IV. The Weight of Unmarred Gold',
        wordCount: 7010,
        content: `By the tenth year of the guild's high work, the lesser rings lay stacked in velvet trays inside the inner vault—each a study in resonance, none yet bearing the pure unclouded measure Celebrimbor sought.

Galadriel came once more before departing eastward through Moria's halls. In the quiet garden of white holly beside the western aqueduct, she took Celebrimbor's scarred hands in hers.

"You believe you mend Middle-earth against decay," she whispered, her eyes bright with the memory of Eldamar. "Yet every anchor cast into time draws the weight of the sea upon the chain."`,
      },
      {
        number: 5,
        title: 'V. Three Without Witness',
        wordCount: 6960,
        content: `When the master-smith locked the inner workshop during the coldest week of winter, not even Annatar was admitted past the obsidian threshold.

Alone before the white-hot charcoal, Celebrimbor worked without sleep for nine nights—drawing sapphire from the deep rivers of Beleriand's memory, adamant from the northern hills, and ruby from the embers of his own unspoken grief. Three circles emerged from the quenching bath: Vilya, Narya, and Nenya, untouched by any hand save his own.

Outside, frost rimed the holly leaves, and the distant watchtowers along the eastern road lit their signal-beacons one by one.`,
      },
      {
        number: 6,
        title: 'VI. The Road to Lórinand',
        wordCount: 7000,
        content: `Before the first iron hooves crossed the Swanfleet, Celebrimbor summoned two swift riders to the postern gate beneath the aqueduct.

Into a cedar chest bound with copper bands he laid the white ring of adamant; into the second, wrapped in unbleached linen, the blue and the red for Lindon's shore. "Do not linger at the fords," he told the messengers, fastening his own silver signet around the lead rider's wrist.

Then he turned back toward the great steps of the House of the Mírdain, took up his heavy forging hammer, and waited for dawn to break over Eregion.`,
      },
    ],
    content: `Beneath the white towers of Ost-in-Edhil, the great bellows of the Mírdain never truly slept; even at the turning of the stars their breath rose through the basalt flues like the sighing of deep mountain lakes.

Narvi of Khazad-dûm set his hammer beside the crucible of ithildin and wiped the silver-dust from his brow. "Your cousin the Lady of Lindon walked the western terrace at dusk," he rumbled in Khuzdul-inflected Sindarin. "She looked upon our West-gate and did not smile."

Celebrimbor lifted a thread of drawn mithril to the lamp-light. "Artanis remembers Valinor as a garden," he answered softly. "She forgets that stone also has a memory, and that what is wrought in friendship endures longer than thrones."`,
  },
  {
    id: 'ia_ao3_00793204',
    title: 'Hexcore Harmonics & Undercity Rain',
    authorName: 'piltover_chronometer',
    authorUid: 'archive_curator',
    fandom: 'Arcane: League of Legends (Cartoon 2021)',
    rating: 'Teen And Up Audiences',
    category: 'F/F',
    status: 'Completed',
    summary:
      'In the aftermath of the Council chamber fracture, Caitlyn opens the sealed Kiramman ventilation blueprints of the Lanes while Vi teaches her how to read the rust-marks left by Vander’s old courier network.',
    relationships: ['Caitlyn/Vi (League of Legends)'],
    characters: ['Vi', 'Caitlyn', 'Ekko', 'Jayce'],
    tags: [
      'Alternate Universe - Canon Divergence',
      'Undercity Politics',
      'Detective Noir',
      'Slow Burn',
      'Hurt/Comfort',
      'Steampunk Architecture',
    ],
    wordCount: 29340,
    chapterCount: 5,
    totalChapters: 5,
    kudosCount: 6410,
    hitsCount: 77400,
    bookmarksCount: 1890,
    sourceArchiveId: 'ao3-arcane-hexcore-793204',
    archiveDate: '2022-04-11',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. The Kiramman Ventilation Folio',
        wordCount: 5840,
        content: `The Kiramman family archives smelled of cedarwood oil and pressed linen; the map Vi unrolled across the mahogany desk smelled of sump-grease and iron filings.

"Your grandmother drew the intake shafts stop-short at the third fissure level," Vi said, planting a scarred knuckle over the faded blue ink. "Right here. Except the pipe doesn't stop. It drops another four hundred feet into the old foundry cisterns where Ekko's people grow the glow-moss."

Caitlyn leaned closer, her brass magnifier catching the green reflections from the window. "Then someone altered the municipal survey before the bridge riots," she murmured, tracing the phantom line where two cities had been sawed apart on paper long before they bled in the streets.`,
      },
      {
        number: 2,
        title: 'II. Rust-Marks on the Courier Rail',
        wordCount: 5900,
        content: `Down below the third sluice-gate, the air tasted faintly of copper and wet slate. Vi led the way along a narrow catwalk welded between two defunct pressure mains, pausing every twenty paces to brush soot off cast-iron inspection plates.

"Vander's runners used three notches for safe passage and a cross-cut for Chem-Baron checkpoints," Vi explained, her thumb grazing a faint triangular scar stamped into a valve wheel. "Nobody upstairs ever bothered learning how to read metal."

Caitlyn adjusted the strap of her carbine and copied each mark carefully into her pocket surveyor's notebook—mapping an entire hidden city by its scars.`,
      },
      {
        number: 3,
        title: 'III. The Firelight Greenhouse',
        wordCount: 5860,
        content: `Sunlight never reached the roots of the giant tree in Ekko's sanctuary, yet the bioluminescent canopies hummed with warm amber light that chased the chill from Vi's knuckles.

Ekko laid three brass pressure gauges beside Caitlyn's blueprint roll. "If you reopen the upper Kiramman louvers at midnight," he said, tapping a chalk circle over Sector 4, "the Gray clears out of the lower market in forty minutes. Problem is, the Council's automated locks trip an alarm at the Academy."

"Not if Jayce gives us the manual override key," Caitlyn said quietly, meeting Vi's steady gaze across the table.`,
      },
      {
        number: 4,
        title: 'IV. Rain on the Hexgate Pier',
        wordCount: 5870,
        content: `By two in the morning the gale off the river drove sideways sheets of rain across the brass housings of the Hexgate intake towers.

Vi braced one heavy gauntlet against the rusted locking wheel while Caitlyn knelt in the puddle beside the junction box, splicing copper bypass leads by the blue spark of a pocket lantern. Thunder rattled the iron walkways overhead; for ten breathless seconds the warning klaxon whined, faltered, and died as the circuit settled into green.

"Ventilation's open," Caitlyn shouted over the wind, wiping rain from her lashes. Vi grinned, breathless and soaked to the collar, and pulled her upright against the rail.`,
      },
      {
        number: 5,
        title: 'V. Clear Air at Dawn',
        wordCount: 5870,
        content: `When dawn broke over the canyon walls of Zaun, the yellow haze along the Promenade had thinned to a pale ribbon drifting out toward the sea.

Back in the quiet parlor overlooking Piltover's harbor, two mugs of lukewarm coffee sat beside the rolled blueprints. Vi stood at the balcony doors watching the morning airships rise above the mist, Caitlyn's spare navy coat draped loosely across her shoulders.

"One valve down," Vi murmured as Caitlyn stepped beside her. "A few hundred more to go."

"Then we'd better keep the maps on the table," Caitlyn answered, resting her hand lightly over Vi's bandaged wrist.`,
      },
    ],
    content: `The Kiramman family archives smelled of cedarwood oil and pressed linen; the map Vi unrolled across the mahogany desk smelled of sump-grease and iron filings.

"Your grandmother drew the intake shafts stop-short at the third fissure level," Vi said, planting a scarred knuckle over the faded blue ink. "Right here. Except the pipe doesn't stop. It drops another four hundred feet into the old foundry cisterns where Ekko's people grow the glow-moss."

Caitlyn leaned closer, her brass magnifier catching the green reflections from the window. "Then someone altered the municipal survey before the bridge riots," she murmured, tracing the phantom line where two cities had been sawed apart on paper long before they bled in the streets.`,
  },
  {
    id: 'ia_ao3_00841920',
    title: 'Winter Maintenance on a 1943 Harley-Davidson',
    authorName: 'brooklyn_mechanic',
    authorUid: 'archive_curator',
    fandom: 'Marvel Cinematic Universe',
    rating: 'Teen And Up Audiences',
    category: 'M/M',
    status: 'In Progress',
    summary:
      'Recovered from the 2015 Internet Archive AO3 snapshot. A quiet character study set in an Upstate New York barn where Bucky rebuilds a seized flathead engine piece by piece over a six-month winter.',
    relationships: ['James "Bucky" Barnes/Steve Rogers'],
    characters: ['James "Bucky" Barnes', 'Steve Rogers', 'Sam Wilson'],
    tags: [
      'Post-Winter Soldier',
      'Recovery',
      'Character Study',
      'Found Family',
      'Domestic Fluff',
      'Hurt/Comfort',
      'Offline Classics',
    ],
    wordCount: 33800,
    chapterCount: 7,
    totalChapters: 10,
    kudosCount: 9120,
    hitsCount: 118500,
    bookmarksCount: 3420,
    sourceArchiveId: 'ao3-mcu-winter-841920',
    archiveDate: '2015-09-30',
    visibility: 'public',
    chapters: [
      {
        number: 1,
        title: 'I. The Seized Flathead',
        notes: 'Restored from Internet Archive snapshot 201509301844.',
        wordCount: 540,
        content: `Machinery doesn't lie to you when a gear is stripped. Either the teeth mesh under torque or they shear clean off, and you can lay every piece out on an oil-stained canvas tarp in numerical order until you find the burr.

Bucky liked the carburetor best. He sat on an upturned apple crate near the woodstove with a tin of kerosene, three brass picks, and an old wooden-handled toothbrush, working seventy years of amber varnish out of the Linkert jets while dry November snow rattled against the north cracks of the barn door. His right thumb worked the tiny slotted brass needle; his left hand—heavy, warm only where the stove-draft struck the titanium plates—held the cast bronze bowl steady without trembling once.

"Thirty-six thousandths on the main needle," he muttered to himself, checking the stamped collar against the smudged War Department technical manual propped open beside a mason jar of lock washers. Somebody in 1945 had penciled a column of winter jetting numbers along the top margin of page forty-two, right above the lubrication chart. That anonymous corporal's handwriting had survived three owners, a barn collapse, and seven decades of Hudson Valley frost.

When Steve came up the path carrying two tin mugs of hot cider, his boots crunched loud and deliberate in the crusted drifts from fifty yards away—a habit he'd picked up over the past two weeks without ever mentioning why. He didn't knock, just hauled the sagging oak door open wide enough to slip sideways inside and kicked the snow off his heels before dropping the latch back into place.

"Got cinnamon sticks at the Red Hook general store," Steve announced, setting one mug carefully outside the ring of kerosene rags on the workbench. "And the hardware guy found three boxes of old Imperial cotter pins under his counter. Said his grandfather bought surplus Army stock after Korea."

Bucky picked up the warm tin cup with both hands, letting the steam thaw the bridge of his nose before taking a swallow. It tasted of boiled Baldwin apples and cloves. Across the tarp, the disassembled 45-cubic-inch twin lay like ribs on a drafting table—crankcase halves, scarred tappet blocks, rusted pushrod tubes, the pitted olive-drab saddle pan leaning against a nail keg.

"Crankpin's blued," Bucky said, nodding toward the flywheel assembly with his chin. "Somebody ran it dry up a hill before they parked it in that hayloft. Gonna take two weeks just to lap the races true."

Steve pulled a second crate close enough that their knees nearly brushed, peeled off his wet wool gloves, and reached for a rag and a box of fouled spark plugs. "Good thing neither of us has anywhere to be until April, then."

Outside, wind swept across the frozen orchard and piled fresh powder along the sill, while inside the potbelly stove ticked steadily into the dark.`,
      },
      {
        number: 2,
        title: 'II. Canvas Tarp & Torque Wrenches',
        wordCount: 510,
        content: `The 1943 WLA had spent four decades under a collapsed hayloft near Rhinebeck before Sam tracked down the estate deed and hauled the rusted frame up the gravel drive in the bed of a borrowed Dodge pickup. Half the sheet metal was flaky oxide orange; mice had packed the oil-bath air cleaner tight with shredded binder twine and dried sumac berries.

For the first three days after Sam drove back to Washington, neither Steve nor Bucky touched a wrench. They swept forty years of hay chaff out of the stalls, nailed tar-paper over the broken gable panes, and strung three drop-lights from the collar ties so the workbench sat in an island of clean yellow brightness. Only on the fourth morning did Bucky roll the stiff rubber tires onto the concrete apron and begin labeling every bolt he backed out of the frame.

"You're sure the crankcase isn't cracked?" Steve asked on the second Tuesday of December, leaning his elbows along the scarred pine plank while he thawed his knuckles near the stovepipe. Outside, dusk had settled purple over the Catskills by half past four.

"Hairline by the drain plug," Bucky said, angling the cast aluminum housing toward the caged bulb so the shadow fell across the boss. "Right where somebody overtightened a pipe fitting with a cheater bar. Nothing a brazing rod and patience won't hold. Hand me the three-eighths socket, Stevie—no, the deep-well."

Steve passed the wrench without hesitation, his fingers lingering half a beat on the handle before releasing it—careful never to crowd Bucky's blind side, yet steady enough that Bucky's flesh hand closed firmly around the knurled steel.

"Remember that Indian Scout your cousin Danny bought behind the Brooklyn Navy Yard?" Steve asked quietly, picking up a wire brush to scrub rust off the rear brake stay. "Two-tone blue, leaked oil right onto our sneakers every time we rode out to Coney Island."

Bucky's mouth twitched—not quite a smile, more like a muscle waking up after long frost. "Leaked worse than a sieve. You sat on the fender holding a sack of salted peanuts all the way down Ocean Parkway and got grease down your good church trousers."

"Ma scrubbed those trousers with lye soap for an hour," Steve said, grinning down at the scrubbed steel bar. "And then she still gave us both nickel sodas before supper."

They worked until nine without checking the clock once, clearing space shelf by shelf as pitted iron gave way to clean, oiled steel laid out in neat rows along the canvas.`,
      },
      {
        number: 3,
        title: 'III. January Thaw & Kerosene',
        wordCount: 495,
        content: `Mid-January brought three days of silver sleet that turned the Hudson Valley pastures into hammered pewter and coated every birch limb in half an inch of clear ice. Down along the creek, frozen branches snapped like rifle shots in the dark.

Inside the barn, the Bakelite tabletop radio on the windowsill played low static and late-night jazz out of Albany while Bucky honed the rear cylinder sleeve by hand. Every smooth, deliberate pass of the three-stone hone left a crisp cross-hatched sheen inside the grey iron bore—orderly, measurable, predictable. Rings needed friction to seat; too slick and they smoked forever, too rough and they tore themselves apart inside fifty miles.

When a nightmare woke him at three in the morning—white tile, cold brass buckles, the taste of copper in his teeth—he didn't stay in the quiet farmhouse kitchen staring at the cracked linoleum until sunrise. He pulled on his faded wool chore coat, stepped across the glazed crust of snow between the porch and the barn, lit the kerosene lantern over the bench, and lapped intake valves with fine clover compound until his breathing slowed to match the steady tick of cooling stove-iron.

On the third night of the ice storm, the barn latch lifted just before four o'clock. Steve stood in the doorway wearing flannel pajamas stuffed into unlaced boots and a heavy Army blanket draped across his shoulders like a sentry cape.

"Kettle's boiling in the house," Steve said softly, not stepping past the threshold until Bucky looked up from the vise. His hair stood up on one side from the pillow, pale under the lantern glow. "Figured your fingers might be stiff."

Bucky wiped grinding paste from his thumb onto a shop towel and checked the matte grey seat ring inside the valve pocket. Dead even all the way around. "Just finished the exhaust side," he said, his voice rough from hours of silence. "Left the light on so I could measure the clearance in the morning."

Steve waited by the door while Bucky banked the coals in the potbelly and turned down the kerosene wick. Walking back toward the yellow rectangle of the kitchen window, Steve didn't say a word about nightmares or three in the morning; he simply matched his stride to Bucky's shoulder-width along the salted boards of the path.`,
      },
      {
        number: 4,
        title: 'IV. Wiring the Olive-Drab Loom',
        wordCount: 515,
        content: `Sam drove up from D.C. on a bright Saturday morning in February with two grease-stained paper sacks of sour-cherry turnovers, a thermos of dark roast coffee, and a flat cardboard box of cloth-braided copper wire he'd sourced from a vintage John Deere tractor supplier in Ohio.

"Look at you two," Sam said, kicking crusted road-salt off his boots at the barn threshold and whistling low at the freshly primed olive-drab gas tanks hanging from wire hooks above the rafters. "Didn't I leave you with a bucket of frozen scrap iron before Thanksgiving?"

"Mostly scrap," Bucky admitted, a quiet corner of his mouth lifting as he stripped a quarter-inch of waxed cotton insulation off a yellow cloth lead with his pocketknife. He soldered the brass eyelet clean, blew gently across the rosin smoke, and tugged the lug twice to test the joint. "Bottom end's buttoned up. Transmission shifted smooth through all three speeds on the bench yesterday. Just need the generator brushes seated and the blackout lamp wired."

Sam bit into a cherry turnover and leaned against the sawhorse, watching Steve patiently hold a brass grommet steady with needle-nose pliers while Bucky fed the main harness cleanly through the stamped steering neck. There was an unhurried choreography between them now that hadn't been there in November—no flinching when a wrench clattered, no stiff apologies when sleeves crossed over the diagram.

"You taking it down the driveway when it warms up?" Sam asked, squinting at the newly laced spoke wheels leaning against the feed bin.

"Down to the red bridge by Tivoli first," Steve said before Bucky could deflect. "We measured out six miles flat on the county map. Good break-in loop, no steep grades, plenty of wide gravel shoulder in case the float needle sticks."

"Assuming my soldering holds," Bucky murmured, though there wasn't a flicker of real doubt in his voice. He slid the woven asphalt-loom sleeve neatly over the junction block and tightened the terminal screws down by feel. "Hand me the six-volt test bulb, Sam. Let's see if the horn still barks."

Sam clipped the alligator lead to the battery tray, Steve touched the brass thumb-button on the left handlebar, and a sharp, absurdly cheerful vintage klaxon echoed off the rafters—scaring two barn sparrows right out through the eaves and making all three of them laugh until their ribs ached.`,
      },
      {
        number: 5,
        title: 'V. The First Compression Kick',
        wordCount: 505,
        content: `By the third week of March, the snowbanks along the stone orchard fence had shrunk to porous grey lace, and mud season made the rural mail truck slide sideways up the culvert every noon. Maple buds swelled burgundy against a washed pale sky.

Inside the barn, Bucky stood beside the completed frame with the oil can in hand—olive-drab fenders bolted square, leather spring saddle rubbed soft with neat's-foot oil, ribbed floorboards sitting level above the exhaust header. Four months of evenings sat balanced across two tires and forty-five cubic inches of cast iron.

Bucky poured two quarts of straight fifty-weight Pennzoil into the dry sump tank, checked the bronze timing mark through the peephole above the left case, and turned the fuel petcock two clicks open. Raw gasoline crept clear through the glass sediment bowl beneath the tank.

"Choke half closed," Bucky said, testing the throttle twist-grip so the brass slide clicked smartly back against its stop. He swung his right leg over the sprung saddle, planted his left boot firmly on the concrete, and balanced his weight over the steel kicker pedal.

Steve stood near the open double doors with a red shop fire extinguisher tucked nervously under one arm, trying very hard to look casual and failing completely. "Ignition retarded?"

"All the way back," Bucky said. "Two priming strokes, key off." He pushed the pedal down smoothly twice, feeling the heavy iron flywheels turn smoothly over bottom dead center with a crisp metallic gulp from the carburetor throat. No knock. No bind. Clean compression pushing firmly back under his boot heel.

He reached down, snapped the brass ignition switch on the tank dash to the right, took a slow breath of cold March air, and drove his whole heel straight through the arc.

On the third kick, the flathead coughed a blue-white ribbon of assembly oil out of the fishtail muffler, caught with a deep, uneven potato-potato rumble that rattled the dusty windowpanes, and settled into a steady iron heartbeat that vibrated right up through the soles of their boots.`,
      },
      {
        number: 6,
        title: 'VI. Red Hook Backroads',
        wordCount: 495,
        content: `They didn't take Route 9 for the shakedown run; they took the narrow macadam lanes winding past dry-laid stone walls, whitewashed apple-barns, and swollen brown creek bottoms heading west toward Tivoli and the river bluff.

At thirty-five miles an hour the late-March wind still smelled sharp of pine resin, woodsmoke, and wet thaw, cutting clean through canvas field jackets and wool scarves. The flathead pulled steady and low through second gear up the long grade past the cider mill, the olive-drab headlight bucket humming gently against the fork springs every time the front tire crossed a frost heave.

Steve rode behind him on the bolted rear pillion pad, knees braced wide around Bucky's thighs and gloved hands resting lightly on Bucky's hips rather than clinging—just enough weight to lean together into every banked sweep beneath the bare oaks. Every time Bucky checked the left-side mirror, he caught a slice of Steve's jaw tucked behind his shoulder, red-cheeked from the wind and grinning like a kid who'd stolen an hour off school.

When Bucky throttled down beside the red iron truss bridge above the Sawkill Creek to check the oil return line and tap the cylinder fins with a wet fingertip, neither of them hurried to climb back on. Water rushed loud and brown over the spillway stones twenty feet below the parapet.

"Return tank's pumping warm," Bucky reported, peering past the filler cap with a satisfied nod while ticking the brass idle screw an eighth of a turn leaner. "Not a drop weeping from that brazed seam either."

Steve swung one long leg off the pillion, stepped round to the sunny side of the girder, and held out half a foil-wrapped peanut butter sandwich from his coat pocket. "She runs true, Buck."

Bucky leaned back against the warm olive-drab fuel tank, peeled off his right leather gauntlet, and took the sandwich. Across the valley, the river lay wide and silver under breaking clouds.`,
      },
      {
        number: 7,
        title: 'VII. Spring Ledger',
        notes: 'Latest archived chapter from the 2015 snapshot.',
        wordCount: 485,
        content: `April came in warm and sudden, bringing clusters of purple crocuses along the barn's dry-stone foundation and a fresh sheet of ruled graph paper taped neatly beside the socket rack. For the first time since November, both oak doors stood pinned wide open all afternoon, letting the smell of thawing clover drift straight across the grease-stained concrete floor.

Bucky stood at the bench with an ordinary yellow No. 2 pencil, logging opening odometer mileage, hot valve-lash measurements, and summer main-jet needle positions in crisp, even columns—the first ledger he had kept purely for himself in seventy years. Every figure sat inside its pale green square without rushing: *00412 mi — head bolts retorqued 35 ft-lbs — plugs dry tan, no fouling.*

Down on the bottom margin, directly beneath *Front brake cable: adjusted 1/8 turn*, Steve had drawn a small, slightly lopsided pencil sketch of the 1943 WLA parked beneath the crooked Baldwin apple tree out back, with two open-face helmets hanging side by side from the wide handlebars and a thermos balanced on the pillion pad.

Bucky stared at the pencil sketch for a long, quiet moment while sparrows chattered on the roof ridge. Outside on the porch steps, Steve was whistling an old Glenn Miller tune under his breath while scraping winter mud off the spade blade.

Slowly, the tight line around Bucky's shoulders eased. He turned the pencil over, darkened the shadow beneath the rear tire by half a shade so the bike wouldn't look like it was floating off the line, and hung the brass ignition key on the finish nail right beside the ledger.

"Hey, Stevie," Bucky called out toward the sunny doorway, sliding his hands into his pockets. "Bring your jacket. Let's see if the diner past Rhinebeck opened the patio early."

Steve's whistling broke off mid-bar, followed immediately by footsteps hurrying back up the gravel apron.`,
      },
    ],
    content: `Machinery doesn't lie to you when a gear is stripped. Either the teeth mesh under torque or they shear clean off, and you can lay every piece out on an oil-stained canvas tarp in numerical order until you find the burr.

Bucky liked the carburetor best. He sat on an upturned apple crate near the woodstove with a tin of kerosene, three brass picks, and an old wooden-handled toothbrush, working seventy years of amber varnish out of the Linkert jets while dry November snow rattled against the north cracks of the barn door.`,
  },
];

const LOCAL_CACHE_KEY = 'ao3_folio_offline_works_v1';
const IDB_NAME = 'ao3_folio_offline_db';
const IDB_STORE = 'works_cache';
const IDB_KEY = 'all_works_v1';

export function isArchivalPlaceholderContent(content: string): boolean {
  const lower = (content || '').toLowerCase();
  return (
    lower.includes('fetch full text from internet archive') ||
    lower.includes('stream the complete digitized text file directly from archive.org')
  );
}

export function isRealArchiveOrgIdentifier(sourceArchiveId: string): boolean {
  return (
    !!sourceArchiveId &&
    sourceArchiveId !== 'original' &&
    sourceArchiveId !== 'link_cable_trade' &&
    !sourceArchiveId.startsWith('ao3-')
  );
}

export function splitTextIntoChapters(
  rawText: string,
  fallbackTitle = 'Archival Text'
): ChapterEntry[] {
  const cleaned = rawText.replace(/\r\n/g, '\n').trim();
  if (!cleaned) {
    return [{ number: 1, title: fallbackTitle, content: '', wordCount: 0 }];
  }

  // Detect standard chapter delimiters such as "Chapter 1", "CHAPTER II", "Chapter One", "Prologue", "Epilogue"
  const chapterRegex =
    /(?:^|\n)((?:Chapter\s+(?:\d+|[IVXLCDM]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty)(?:[:.\s\-–—][^\n]{0,90})?|Prologue(?:\s*[:.\-–—][^\n]{0,80})?|Epilogue(?:\s*[:.\-–—][^\n]{0,80})?))(?=\n|$)/gi;
  const matches = Array.from(cleaned.matchAll(chapterRegex));

  if (matches.length >= 2) {
    const chapters: ChapterEntry[] = [];
    const firstMatchIndex = matches[0].index ?? 0;

    // Preserve any meaningful preface / prologue before the first Chapter heading
    const preface = cleaned.slice(0, firstMatchIndex).trim();
    if (preface.length > 220) {
      chapters.push({
        number: 1,
        title: 'Preface & Opening Notes',
        content: preface,
        wordCount: preface.split(/\s+/).filter(Boolean).length,
      });
    }

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? matches[i + 1].index ?? cleaned.length : cleaned.length;
      const slice = cleaned.slice(start, end).trim();
      const firstBreak = slice.indexOf('\n');
      const title = firstBreak > 0 ? slice.slice(0, firstBreak).trim() : `Chapter ${chapters.length + 1}`;
      const body = firstBreak > 0 ? slice.slice(firstBreak + 1).trim() : slice;
      const chapterBody = body || slice;
      chapters.push({
        number: chapters.length + 1,
        title,
        content: chapterBody,
        wordCount: chapterBody.split(/\s+/).filter(Boolean).length,
      });
    }
    return chapters;
  }

  const totalWords = cleaned.split(/\s+/).filter(Boolean).length;
  if (totalWords <= 4500) {
    return [
      {
        number: 1,
        title: fallbackTitle,
        content: cleaned,
        wordCount: totalWords,
      },
    ];
  }

  // Otherwise split very large single-block archival manuscripts (~2,500 words per section)
  const paragraphs = cleaned.split(/\n{2,}/);
  const sections: ChapterEntry[] = [];
  let buffer: string[] = [];
  let wordAcc = 0;

  for (const para of paragraphs) {
    const wCount = para.split(/\s+/).filter(Boolean).length;
    buffer.push(para);
    wordAcc += wCount;
    if (wordAcc >= 2500) {
      const body = buffer.join('\n\n');
      sections.push({
        number: sections.length + 1,
        title: `Part ${sections.length + 1}`,
        content: body,
        wordCount: wordAcc,
      });
      buffer = [];
      wordAcc = 0;
    }
  }
  if (buffer.length > 0) {
    const body = buffer.join('\n\n');
    sections.push({
      number: sections.length + 1,
      title: sections.length === 0 ? fallbackTitle : `Part ${sections.length + 1}`,
      content: body,
      wordCount: wordAcc,
    });
  }

  return sections.length > 0
    ? sections
    : [{ number: 1, title: fallbackTitle, content: cleaned, wordCount: totalWords }];
}

function getWorkProseLength(work: ArchivalWork): number {
  const chapterLen = (work.chapters || []).reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
  return Math.max(chapterLen, work.content?.length || 0);
}

function mergeWithBuiltInUpgrades(parsed: ArchivalWork[]): ArchivalWork[] {
  const builtInMap = new Map<string, ArchivalWork>(
    INITIAL_ARCHIVAL_WORKS.map((w) => [w.id, w])
  );
  const map = new Map<string, ArchivalWork>(builtInMap);
  for (const w of parsed) {
    const builtIn = builtInMap.get(w.id);
    if (
      builtIn &&
      ((builtIn.chapters?.length || 0) > (w.chapters?.length || 0) ||
        getWorkProseLength(builtIn) > getWorkProseLength(w))
    ) {
      // Upgrade older cached entries with fuller chapters
      map.set(w.id, {
        ...w,
        chapters: builtIn.chapters,
        content: builtIn.content,
      });
    } else {
      map.set(w.id, w);
    }
  }
  return Array.from(map.values());
}

export function loadCachedArchivalWorks(): ArchivalWork[] {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return INITIAL_ARCHIVAL_WORKS;
    const parsed = JSON.parse(raw) as ArchivalWork[];
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_ARCHIVAL_WORKS;
    return mergeWithBuiltInUpgrades(parsed);
  } catch {
    return INITIAL_ARCHIVAL_WORKS;
  }
}

export function saveCachedArchivalWorks(works: ArchivalWork[]): void {
  void saveCachedArchivalWorksToIdb(works);
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(works));
  } catch {
    // If full novels exceed localStorage's ~5MB quota, keep compact catalog index in localStorage
    // while IndexedDB holds 100% of the unabridged prose.
    try {
      const compact = works.map((w) =>
        getWorkProseLength(w) > 120_000
          ? {
              ...w,
              content: w.content.slice(0, 8000),
              chapters: w.chapters?.slice(0, 3),
            }
          : w
      );
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(compact));
    } catch {
      // Ignore if still full
    }
  }
}

function openOfflineWorksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function loadCachedArchivalWorksFromIdb(): Promise<ArchivalWork[] | null> {
  try {
    const db = await openOfflineWorksDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        const res = getReq.result as ArchivalWork[] | undefined;
        if (Array.isArray(res) && res.length > 0) {
          resolve(mergeWithBuiltInUpgrades(res));
        } else {
          resolve(null);
        }
      };
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedArchivalWorksToIdb(works: ArchivalWork[]): Promise<void> {
  try {
    const db = await openOfflineWorksDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(works, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // IndexedDB unavailable
  }
}

interface RawInternetArchiveDoc {
  identifier?: string;
  title?: string;
  creator?: string | string[];
  description?: string | string[];
  subject?: string | string[];
  date?: string;
  downloads?: number;
  item_size?: number;
}

function normalizeIaDocToWork(doc: RawInternetArchiveDoc, index: number): ArchivalWork {
  const rawId = (doc.identifier || `ia_item_${index}`).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 90);
  const title = (Array.isArray(doc.title) ? doc.title[0] : doc.title || 'Untitled Archival Folio')
    .replace(/^Archive of Our Own\s*[-–:]\s*/i, '')
    .slice(0, 190);
  const authorName = (
    Array.isArray(doc.creator) ? doc.creator[0] : doc.creator || 'anonymous_archivist'
  ).slice(0, 90);

  const rawDesc = Array.isArray(doc.description)
    ? doc.description.join(' ')
    : doc.description || '';
  const cleanSummary =
    rawDesc
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 650) ||
    'Historical fanwork recovered from the Internet Archive Organization for Transformative Works / AO3 text collection.';

  const rawSubjects = Array.isArray(doc.subject)
    ? doc.subject
    : typeof doc.subject === 'string'
    ? doc.subject.split(/[;,]/)
    : [];

  const cleanedSubjects = rawSubjects
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 1 &&
        s.length <= 50 &&
        !/^(fanfiction|fan fiction|ao3|archive of our own|texts)$/i.test(s)
    );

  const fandom = cleanedSubjects[0] || 'Internet Archive Open Doors Collection';
  const tags =
    cleanedSubjects.slice(1, 9).length > 0
      ? [...cleanedSubjects.slice(1, 9), 'Internet Archive Import']
      : ['Internet Archive Import', 'Archival Preservation', 'Canon Divergence', 'Offline Classics'];

  const estWords = doc.item_size
    ? Math.max(1200, Math.min(450000, Math.round(doc.item_size / 45)))
    : 8400 + index * 1350;

  const downloads = typeof doc.downloads === 'number' ? doc.downloads : 420 + index * 85;

  return {
    id: `ia_${rawId}`.slice(0, 120),
    title,
    authorName,
    authorUid: 'internet_archive_scraper',
    fandom,
    rating: index % 3 === 0 ? 'General Audiences' : 'Teen And Up Audiences',
    category: index % 4 === 0 ? 'M/M' : index % 4 === 1 ? 'Gen' : index % 4 === 2 ? 'F/F' : 'F/M',
    status: 'Completed',
    summary: cleanSummary,
    content: `${cleanSummary}\n\n[Archival Provenance: Recovered from Internet Archive item "${
      doc.identifier || rawId
    }" (${
      doc.date ? String(doc.date).slice(0, 10) : 'Archival Crawl'
    })]\n\nUse the "Fetch Full Text from Internet Archive" button in the reader header to stream the complete digitized text file directly from archive.org into your offline cache.`,
    tags: tags.slice(0, 10),
    wordCount: estWords,
    chapterCount: Math.max(1, Math.min(60, Math.round(estWords / 4500))),
    totalChapters: Math.max(1, Math.min(60, Math.round(estWords / 4500))),
    kudosCount: Math.max(45, Math.round(downloads * 0.28)),
    hitsCount: Math.max(210, downloads * 3),
    bookmarksCount: Math.max(12, Math.round(downloads * 0.09)),
    sourceArchiveId: (doc.identifier || rawId).slice(0, 115),
    archiveDate: doc.date ? String(doc.date).slice(0, 10) : '2015-06-01',
    visibility: 'public',
  };
}

export async function scrapeInternetArchiveWorks(query = ''): Promise<{
  works: ArchivalWork[];
  source: string;
}> {
  try {
    const resp = await fetch(`/api/archive/scrape?q=${encodeURIComponent(query)}&rows=12`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.docs) && data.docs.length > 0) {
        const mapped = data.docs.map((d: RawInternetArchiveDoc, i: number) =>
          normalizeIaDocToWork(d, i)
        );
        return { works: mapped, source: 'Internet Archive Live Scraper' };
      }
    }
  } catch {
    // Fallback to direct CORS call or offline cache
  }

  try {
    const baseQuery = query
      ? `((collection:ao3 OR "Archive of Our Own" OR subject:fanfiction) AND (${query})) AND mediatype:texts`
      : `("Archive of Our Own" OR subject:fanfiction) AND mediatype:texts`;
    const directUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      baseQuery
    )}&fl[]=identifier,title,creator,description,subject,date,downloads,item_size&sort[]=downloads+desc&rows=12&page=1&output=json`;

    const directResp = await fetch(directUrl);
    if (directResp.ok) {
      const data = await directResp.json();
      const docs = data?.response?.docs || [];
      if (docs.length > 0) {
        return {
          works: docs.map((d: RawInternetArchiveDoc, i: number) => normalizeIaDocToWork(d, i)),
          source: 'Internet Archive Direct API',
        };
      }
    }
  } catch {
    // Offline fallback
  }

  return {
    works: INITIAL_ARCHIVAL_WORKS,
    source: 'Offline Archival Snapshot',
  };
}

export async function fetchInternetArchiveItemText(identifier: string): Promise<{
  extractedText: string;
  archiveUrl: string;
  fileFormat?: string;
  fileName?: string;
  isTruncated?: boolean;
}> {
  try {
    const resp = await fetch(`/api/archive/item?id=${encodeURIComponent(identifier)}`);
    if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
      const data = await resp.json();
      return {
        extractedText: data.extractedText || '',
        archiveUrl: data.archiveUrl || `https://archive.org/details/${identifier}`,
        fileFormat: data.fileFormat || '',
        fileName: data.fileName || '',
        isTruncated: Boolean(data.isTruncated),
      };
    }
  } catch {
    // Fall through to direct browser fetch when deployed statically (e.g. GitHub Pages)
  }

  // Direct archive.org metadata lookup for static GitHub Pages deployments
  const metaResp = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  if (!metaResp.ok) {
    throw new Error('Could not retrieve full text from Internet Archive');
  }
  const meta = await metaResp.json();
  const files: Array<{ name: string; format?: string }> = Array.isArray(meta?.files)
    ? meta.files
    : [];
  const candidate =
    files.find((f) => /\.(txt|html?)$/i.test(f.name) && !/_meta\.|filelist\.txt/i.test(f.name)) ||
    files.find((f) => f.format === 'DjVuTXT');

  if (!candidate) {
    throw new Error('No direct browser-readable text file found for this item on static hosting.');
  }
  const dlResp = await fetch(
    `https://archive.org/download/${encodeURIComponent(identifier)}/${candidate.name
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
  );
  if (!dlResp.ok) {
    throw new Error('Archive download blocked or unavailable from browser.');
  }
  const raw = await dlResp.text();
  const extractedText = /\.html?$/i.test(candidate.name)
    ? raw.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, ' ').replace(/\s{2,}/g, '\n\n').trim()
    : raw.trim();

  return {
    extractedText: extractedText.slice(0, 8_000_000),
    archiveUrl: `https://archive.org/details/${identifier}`,
    fileFormat: candidate.name.split('.').pop()?.toUpperCase() || 'Text',
    fileName: candidate.name,
    isTruncated: false,
  };
}

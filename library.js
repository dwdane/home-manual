// library.js
// The maintenance task library.
//
// Every task the app knows how to schedule lives here. The house profile
// (schedule.js DEFAULT_PROFILE) decides which of these apply: a slab house
// never sees crawlspace checks, no dog means no vaccine reminders.
//
// Task shape:
//   key      Stable identifier. Task instances remember their library key so
//            future library updates can be matched back to existing tasks.
//   title    Short imperative line shown in the list.
//   cat      Category key (see CATS below).
//   why      One line of rationale, shown in the task drawer.
//   every    Strict interval: { n, unit } where unit is 'w' | 'm' | 'y'.
//            Next due = last completion + interval.
//   windows  Seasonal windows: array of [startMonth, endMonth] (1-12,
//            inclusive). The task recurs once per window, every `yearGap`
//            years. A task has `every` OR `windows`, never both.
//   yearGap  For windowed tasks: recur every N years (default 1).
//   requires Profile requirements, same semantics as the inspector template:
//            boolean values must match truthiness, string values must match
//            exactly. Omit for tasks every house gets.
//   asset    Suggested asset category to link (so the task drawer can jump to
//            the thing's model/size/consumable info).
//
// Month windows are written for a temperate northern-hemisphere climate.
// Users can edit any task's schedule after seeding, so these are defaults,
// not law.

export const CATS = {
  hvac:   { name: 'Air & Heat',        icon: '\u2668' },   // ♨
  water:  { name: 'Water & Plumbing',  icon: '\u2614' },   // ☔
  ext:    { name: 'Exterior',          icon: '\u2302' },   // ⌂
  safety: { name: 'Safety',           icon: '\u26A0' },   // ⚠
  clean:  { name: 'Deep Cleaning',     icon: '\u2726' },   // ✦
  garden: { name: 'Garden & Yard',     icon: '\u273F' },   // ✿
  pet:    { name: 'Pets',              icon: '\u2764' },   // ❤
  warr:   { name: 'Warranty',          icon: '\u2691' },   // ⚑
};

export const LIBRARY = [

  // -------------------------------------------------------------------------
  // Air & Heat
  // -------------------------------------------------------------------------
  { key: 'hvac-filter', title: 'Replace HVAC air filter', cat: 'hvac',
    every: { n: 3, unit: 'm' }, requires: { forcedAir: true }, asset: 'hvac',
    why: 'A clogged filter strains the blower and cuts airflow. 1in filters every 1-3 months; 4-5in media filters every 6-12.' },
  { key: 'hvac-ac-service', title: 'AC serviced before cooling season', cat: 'hvac',
    windows: [[3, 5]], requires: { centralAir: true }, asset: 'hvac',
    why: 'Refrigerant charge, coil condition, and capacitor health checked before the first heat wave, not during it.' },
  { key: 'hvac-heat-service', title: 'Furnace / heat serviced before winter', cat: 'hvac',
    windows: [[9, 10]], requires: { forcedAir: true }, asset: 'hvac',
    why: 'Heat exchanger cracks and ignition problems found in October cost less than in January.' },
  { key: 'hvac-condensate', title: 'Flush AC condensate drain line', cat: 'hvac',
    windows: [[4, 5], [7, 8]], requires: { centralAir: true },
    why: 'A cup of vinegar down the line keeps algae from clogging it and overflowing the pan into the ceiling.' },
  { key: 'hvac-condenser', title: 'Clean outdoor condenser coils and clear 2ft around unit', cat: 'hvac',
    windows: [[4, 5]], requires: { centralAir: true }, asset: 'hvac',
    why: 'Cottonwood fluff and grass clippings on the coil can cut efficiency 20% or more.' },
  { key: 'hvac-registers', title: 'Vacuum supply and return registers', cat: 'hvac',
    every: { n: 6, unit: 'm' }, requires: { forcedAir: true },
    why: 'Dust on the grilles is dust headed for the coil and the filter.' },
  { key: 'hvac-humidifier', title: 'Replace whole-house humidifier pad', cat: 'hvac',
    windows: [[10, 11]], requires: { humidifier: true }, asset: 'hvac',
    why: 'A scaled-up pad grows mold and stops humidifying. New pad at the start of every heating season.' },
  { key: 'fireplace-gas-service', title: 'Gas fireplace inspected and serviced', cat: 'hvac',
    windows: [[9, 11]], requires: { fireplace: 'gas' }, asset: 'fireplace',
    why: 'Burner, pilot, and venting checked yearly. Ventless units especially: the room is the flue.' },
  { key: 'chimney-sweep', title: 'Chimney swept and inspected', cat: 'hvac',
    windows: [[8, 10]], requires: { fireplace: 'wood' },
    why: 'Creosote is chimney-fire fuel. Sweep before the season, every year you burn.' },
  { key: 'erv-filter', title: 'Clean ERV/HRV core and filters', cat: 'hvac',
    every: { n: 6, unit: 'm' }, requires: { erv: true },
    why: 'A blocked ventilator core means the fresh-air system is just a fan making noise.' },

  // -------------------------------------------------------------------------
  // Water & Plumbing
  // -------------------------------------------------------------------------
  { key: 'wh-tank-flush', title: 'Flush water heater tank', cat: 'water',
    windows: [[9, 10]], requires: { waterHeater: 'tank' }, asset: 'waterheater',
    why: 'Sediment on the bottom of the tank insulates the burner from the water and shortens tank life.' },
  { key: 'wh-anode', title: 'Check water heater anode rod', cat: 'water',
    windows: [[9, 10]], yearGap: 3, requires: { waterHeater: 'tank' }, asset: 'waterheater',
    why: 'The sacrificial rod corrodes so the tank does not. Once it is gone, the tank starts dying.' },
  { key: 'wh-tankless-descale', title: 'Descale tankless water heater', cat: 'water',
    windows: [[9, 10]], requires: { waterHeater: 'tankless' }, asset: 'waterheater',
    why: 'A vinegar flush through the heat exchanger. Hard water can scale one up in a single year.' },
  { key: 'wh-tpr', title: 'Test water heater T&P relief valve', cat: 'water',
    windows: [[9, 10]], requires: { waterHeater: 'tank' }, asset: 'waterheater',
    why: 'Lift the lever, confirm it discharges and reseats. A seized valve on a failing thermostat is how tanks become rockets.' },
  { key: 'shower-filter', title: 'Replace shower hard-water filter cartridge', cat: 'water',
    every: { n: 6, unit: 'm' }, requires: { showerFilter: true }, asset: 'showerfilter',
    why: 'Spent cartridges stop softening and start restricting flow. Keep the size and link in Things so reordering is one tap.' },
  { key: 'fridge-filter', title: 'Replace refrigerator water filter', cat: 'water',
    every: { n: 6, unit: 'm' }, requires: { fridgeFilter: true }, asset: 'fridge',
    why: 'Most manufacturers rate them for 6 months. The model number lives in Things.' },
  { key: 'sediment-filter', title: 'Replace whole-house sediment filter', cat: 'water',
    every: { n: 3, unit: 'm' }, requires: { sedimentFilter: true }, asset: 'waterfilter',
    why: 'A loaded filter drops house water pressure before it drops anything else.' },
  { key: 'softener-salt', title: 'Check and top up water softener salt', cat: 'water',
    every: { n: 1, unit: 'm' }, requires: { softener: true }, asset: 'softener',
    why: 'Keep the brine tank at least half full, and break up any salt bridge with a broom handle.' },
  { key: 'sump-test', title: 'Test sump pump (pour a bucket of water)', cat: 'water',
    every: { n: 3, unit: 'm' }, requires: { sumpPump: true },
    why: 'The float sticks in the dry months and you find out in the wet ones. Test it, and the check valve.' },
  { key: 'septic-pump', title: 'Septic tank pumped', cat: 'water',
    windows: [[5, 9]], yearGap: 3, requires: { septic: true },
    why: 'Every 3-5 years depending on household size. Skipping it turns a $500 service into a $15,000 drain field.' },
  { key: 'well-test', title: 'Well water tested (bacteria, nitrates)', cat: 'water',
    windows: [[4, 6]], requires: { well: true },
    why: 'Annual test through the county or a certified lab. Wells change without telling you.' },
  { key: 'disposal-clean', title: 'Freshen garbage disposal (ice + citrus)', cat: 'water',
    every: { n: 1, unit: 'm' }, requires: { disposal: true },
    why: 'Ice knocks buildup off the impellers; citrus peel handles the smell.' },
  { key: 'dw-filter', title: 'Clean dishwasher filter and spray arms', cat: 'water',
    every: { n: 1, unit: 'm' }, asset: 'dishwasher',
    why: 'The filter in the sump catches food that otherwise re-plates onto your dishes.' },
  { key: 'washer-gasket', title: 'Wipe washer door gasket and leave door ajar', cat: 'water',
    every: { n: 1, unit: 'm' }, requires: { frontLoadWasher: true }, asset: 'washer',
    why: 'Front-loader gaskets grow mildew in weeks if sealed wet. Wipe the folds, check for trapped socks.' },
  { key: 'washer-clean-cycle', title: 'Run washer tub-clean cycle', cat: 'water',
    every: { n: 2, unit: 'm' }, asset: 'washer',
    why: 'Hot cycle with washer cleaner or bleach clears the residue that makes towels smell.' },
  { key: 'washer-hoses', title: 'Inspect washing machine supply hoses', cat: 'water',
    every: { n: 6, unit: 'm' }, asset: 'washer',
    why: 'A burst supply hose floods at 5+ gallons a minute, usually while you are out. Replace rubber with braided stainless at any bulge.' },
  { key: 'under-sink', title: 'Check under every sink for leaks and swelling', cat: 'water',
    every: { n: 6, unit: 'm' },
    why: 'Slow supply-line drips destroy cabinet floors silently. Feel the fittings, look at the cabinet bottom.' },
  { key: 'toilet-dye', title: 'Toilet leak test (dye tablet in tank)', cat: 'water',
    every: { n: 1, unit: 'y' },
    why: 'Color in the bowl without flushing means the flapper is leaking - often hundreds of gallons a day.' },
  { key: 'aerators', title: 'Clean faucet aerators and showerheads', cat: 'water',
    every: { n: 6, unit: 'm' },
    why: 'Unscrew and soak in vinegar. Restores flow, especially with hard water.' },
  { key: 'shutoff-exercise', title: 'Exercise main water shutoff and fixture stops', cat: 'water',
    every: { n: 1, unit: 'y' },
    why: 'Valves seize open. The night a pipe bursts is the wrong time to learn yours will not turn.' },

  // -------------------------------------------------------------------------
  // Exterior
  // -------------------------------------------------------------------------
  { key: 'gutters', title: 'Clean gutters and confirm downspouts run clear', cat: 'ext',
    windows: [[4, 5], [10, 11]], requires: { gutters: true },
    why: 'Overflowing gutters dump water at the foundation - the number one cause of wet basements and crawlspaces.' },
  { key: 'roof-look', title: 'Roof visual inspection from the ground (binoculars)', cat: 'ext',
    windows: [[4, 5], [9, 10]],
    why: 'Lifted shingles, slipped flashing, moss. Catching it from the driveway is free; catching it from a ceiling stain is not.' },
  { key: 'ext-caulk', title: 'Inspect exterior caulk and penetrations', cat: 'ext',
    windows: [[4, 6]],
    why: 'Windows, doors, hose bibs, dryer vent, cable entries. Failed caulk is how water gets into walls.' },
  { key: 'grading', title: 'Check grading and downspout extensions after heavy rain', cat: 'ext',
    windows: [[3, 5]],
    why: 'Soil settles, especially at a new house. Water should visibly run away from the foundation, never pond against it.' },
  { key: 'siding-wash', title: 'Wash siding and check for damage', cat: 'ext',
    windows: [[5, 7]],
    why: 'A yearly rinse stops mildew, and you will spot woodpecker holes and popped trim while doing it.' },
  { key: 'garage-door', title: 'Garage door: lubricate and test safety reverse', cat: 'ext',
    every: { n: 6, unit: 'm' }, requires: { garage: true }, asset: 'garagedoor',
    why: 'Silicone lube on rollers and hinges, then put a 2x4 under the door - it must reverse on contact.' },
  { key: 'deck-check', title: 'Deck: check fasteners, ledger, and finish', cat: 'ext',
    windows: [[4, 5]], requires: { deck: true },
    why: 'The ledger connection to the house is where decks fail. Probe for soft wood, look for pulled fasteners.' },
  { key: 'deck-seal', title: 'Deck cleaned and resealed', cat: 'ext',
    windows: [[5, 6]], yearGap: 2, requires: { deck: true },
    why: 'Water beading is the test. When drops soak in instead of beading, it is time.' },
  { key: 'driveway-seal', title: 'Seal driveway cracks', cat: 'ext',
    windows: [[8, 9]], yearGap: 2,
    why: 'Water in a crack becomes ice in a crack becomes a bigger crack. Seal before freeze season.' },
  { key: 'crawl-check', title: 'Crawlspace check: moisture, pests, insulation', cat: 'ext',
    every: { n: 6, unit: 'm' }, requires: { foundation: 'crawl' },
    why: 'Nobody looks until something smells. Standing water, fallen insulation, and rodent sign all announce themselves early down there.' },
  { key: 'basement-look', title: 'Walk basement perimeter for cracks and dampness', cat: 'ext',
    every: { n: 6, unit: 'm' }, requires: { foundation: 'basement' },
    why: 'Efflorescence (white mineral haze) on the wall means water is moving through it.' },
  { key: 'pest-inspect', title: 'Termite / pest inspection', cat: 'ext',
    windows: [[3, 5]],
    why: 'Annual professional look, or DIY: mud tubes on the foundation, frass, soft baseboards.' },
  { key: 'hose-bibs-winter', title: 'Disconnect hoses, drain and cover hose bibs', cat: 'ext',
    windows: [[10, 11]], requires: { climate: 'freezing' },
    why: 'A connected hose holds water in the bib, the bib freezes, and the pipe splits inside the wall.' },
  { key: 'window-weeps', title: 'Clear window weep holes', cat: 'ext',
    windows: [[4, 5]],
    why: 'Blocked weeps trap water inside the window frame until it finds the drywall.' },

  // -------------------------------------------------------------------------
  // Safety
  // -------------------------------------------------------------------------
  { key: 'smoke-test', title: 'Test all smoke and CO detectors', cat: 'safety',
    every: { n: 1, unit: 'm' },
    why: 'Hold the button on every unit. Thirty seconds a month for the single highest-value task in this app.' },
  { key: 'smoke-batteries', title: 'Replace detector batteries', cat: 'safety',
    windows: [[11, 11]],
    why: 'Once a year, all at once, whether they chirp or not. Daylight-saving weekend is the classic anchor.' },
  { key: 'detector-age', title: 'Check detector ages (replace at 10 years)', cat: 'safety',
    every: { n: 1, unit: 'y' },
    why: 'The manufacture date is printed on the back. Sensors die of old age while the test button still works.' },
  { key: 'extinguisher', title: 'Check fire extinguisher gauges and mounts', cat: 'safety',
    every: { n: 6, unit: 'm' },
    why: 'Needle in the green, pin seated, nothing stacked in front of it. Kitchen and garage minimum.' },
  { key: 'dryer-vent', title: 'Clean dryer vent duct to the exterior', cat: 'safety',
    every: { n: 1, unit: 'y' }, asset: 'dryer',
    why: 'Lint in the duct - not the lint screen, the duct - causes thousands of house fires a year. Clothes taking two cycles is the warning sign.' },
  { key: 'gfci-test', title: 'Test GFCI outlets (TEST then RESET)', cat: 'safety',
    every: { n: 6, unit: 'm' },
    why: 'Kitchens, baths, garage, exterior. A GFCI that will not trip is just an outlet.' },
  { key: 'emergency-kit', title: 'Check emergency kit and flashlights', cat: 'safety',
    every: { n: 1, unit: 'y' },
    why: 'Water, batteries, meds, and the flashlight that actually turns on. Rotate expired stock.' },
  { key: 'radon-test', title: 'Radon test', cat: 'safety',
    windows: [[11, 2]], yearGap: 2,
    why: 'Cheap charcoal kit in the lowest living level, in winter with the house closed up. Second-leading cause of lung cancer.' },

  // -------------------------------------------------------------------------
  // Deep cleaning
  // -------------------------------------------------------------------------
  { key: 'windows-clean', title: 'Wash windows inside and out, wipe tracks', cat: 'clean',
    windows: [[4, 5], [9, 10]],
    why: 'Twice a year, tracks included - grit in the track is what wears out the seals.' },
  { key: 'fridge-coils', title: 'Vacuum refrigerator condenser coils', cat: 'clean',
    every: { n: 6, unit: 'm' }, asset: 'fridge',
    why: 'Dusty coils make the compressor run hot and long. Coil brush behind the kick plate or rear panel.' },
  { key: 'hood-filter', title: 'Degrease range hood filter', cat: 'clean',
    every: { n: 3, unit: 'm' }, asset: 'hood',
    why: 'A saturated filter stops capturing grease and starts being a fire load over the stove.' },
  { key: 'oven-clean', title: 'Deep clean oven', cat: 'clean',
    every: { n: 6, unit: 'm' }, asset: 'oven',
    why: 'Before it smokes. If using self-clean, remove the racks and open windows.' },
  { key: 'ceiling-fans', title: 'Dust ceiling fans and light fixtures', cat: 'clean',
    every: { n: 3, unit: 'm' },
    why: 'Pillowcase-over-the-blade trick keeps the dust off the bed below.' },
  { key: 'baseboards', title: 'Wipe baseboards and door frames', cat: 'clean',
    every: { n: 6, unit: 'm' },
    why: 'The thing nobody sees until guests are coming in an hour.' },
  { key: 'mattress', title: 'Rotate mattresses, wash pillows and duvets', cat: 'clean',
    every: { n: 6, unit: 'm' },
    why: 'Rotation evens wear; most pillows are machine washable and overdue.' },
  { key: 'carpet-deep', title: 'Deep clean carpets and rugs', cat: 'clean',
    windows: [[4, 6]],
    why: 'Yearly hot-water extraction, own or rented. Doubles carpet life.' },
  { key: 'grout-seal', title: 'Reseal tile grout (showers first)', cat: 'clean',
    windows: [[1, 3]], yearGap: 2,
    why: 'Unsealed grout absorbs water and grows what you spend the rest of the year scrubbing.' },
  { key: 'garage-clean', title: 'Garage sweep-out and declutter', cat: 'clean',
    windows: [[4, 5], [9, 10]], requires: { garage: true },
    why: 'Twice a year keeps it a garage instead of a storage unit the cars live outside of.' },
  { key: 'trash-cans', title: 'Wash trash and recycling bins', cat: 'clean',
    every: { n: 3, unit: 'm' },
    why: 'Hose, dish soap, stiff brush, sun. The smell does not fix itself.' },
  { key: 'dishwasher-deep', title: 'Run dishwasher cleaner cycle', cat: 'clean',
    every: { n: 3, unit: 'm' }, asset: 'dishwasher',
    why: 'Clears mineral scale and grease film from the pump and lines.' },

  // -------------------------------------------------------------------------
  // Garden & yard
  // -------------------------------------------------------------------------
  { key: 'hydrangea-prune', title: 'Prune hydrangeas', cat: 'garden',
    windows: [[2, 3]], requires: { hydrangeas: true },
    why: 'Late winter for panicle and smooth types (new-wood bloomers). Bigleaf/oakleaf bloom on old wood - for those, prune right after flowering instead and edit this window.' },
  { key: 'rose-prune', title: 'Prune roses', cat: 'garden',
    windows: [[2, 3]], requires: { roses: true },
    why: 'When forsythia blooms. Cut to outward-facing buds, remove dead and crossing canes.' },
  { key: 'fruit-prune', title: 'Prune fruit trees (dormant)', cat: 'garden',
    windows: [[1, 2]], requires: { fruitTrees: true },
    why: 'Late dormancy, before buds break. Open the center, remove water sprouts.' },
  { key: 'lawn-fert-spring', title: 'Fertilize lawn (spring)', cat: 'garden',
    windows: [[4, 5]], requires: { lawn: true },
    why: 'After the second or third mow, when the grass is actively growing.' },
  { key: 'lawn-fert-fall', title: 'Fertilize lawn (fall - the important one)', cat: 'garden',
    windows: [[9, 10]], requires: { lawn: true },
    why: 'Fall feeding builds roots for next year. If you fertilize once a year, this is the one.' },
  { key: 'pre-emergent', title: 'Apply pre-emergent weed control', cat: 'garden',
    windows: [[3, 4]], requires: { lawn: true },
    why: 'Down before soil hits 55F - when forsythia blooms - or the crabgrass wins the year.' },
  { key: 'aerate-overseed', title: 'Aerate and overseed lawn', cat: 'garden',
    windows: [[9, 10]], requires: { lawn: true },
    why: 'Core aeration plus seed in early fall: warm soil, cool air, fewer weeds competing.' },
  { key: 'mulch', title: 'Refresh mulch in beds (2-3in, off the stems)', cat: 'garden',
    windows: [[4, 5]], requires: { beds: true },
    why: 'Moisture, weed control, and the volcano-around-the-trunk look kills trees - keep it off bark.' },
  { key: 'shrub-fert', title: 'Fertilize shrubs and beds', cat: 'garden',
    windows: [[4, 5]], requires: { beds: true },
    why: 'Slow-release balanced feed as growth starts. Acid feed for hydrangeas, azaleas, hollies.' },
  { key: 'bulbs', title: 'Plant spring bulbs', cat: 'garden',
    windows: [[10, 11]], requires: { beds: true },
    why: 'After first frost, before ground freezes. Future-you will be delighted in March.' },
  { key: 'divide-perennials', title: 'Divide crowded perennials', cat: 'garden',
    windows: [[9, 10]], yearGap: 3, requires: { beds: true },
    why: 'Dead center with a ring of growth means divide me. Free plants.' },
  { key: 'tree-check', title: 'Walk trees: dead limbs, cracks, lean', cat: 'garden',
    windows: [[10, 11]],
    why: 'Look up before winter storms do the pruning for you, over your roof.' },
  { key: 'sprinkler-start', title: 'Sprinkler system startup and head check', cat: 'garden',
    windows: [[4, 5]], requires: { sprinklers: true },
    why: 'Slow-fill the mainline, then walk every zone watching for geysers and blocked heads.' },
  { key: 'sprinkler-winter', title: 'Winterize sprinklers (blow out lines)', cat: 'garden',
    windows: [[10, 11]], requires: { sprinklers: true, climate: 'freezing' },
    why: 'Water left in the lines cracks pipes and the backflow preventer. Before first hard freeze.' },
  { key: 'mower-service', title: 'Mower service: oil, blade sharpen, plug', cat: 'garden',
    windows: [[3, 4]], requires: { lawn: true },
    why: 'A dull blade tears grass and browns the lawn tips. Sharpen yearly minimum.' },

  // -------------------------------------------------------------------------
  // Pets
  // -------------------------------------------------------------------------
  { key: 'dog-hw', title: 'Dog: heartworm preventative', cat: 'pet',
    every: { n: 1, unit: 'm' }, requires: { dog: true }, asset: 'dog',
    why: 'Same day every month, year-round. Missing doses is how dogs on prevention still get heartworm.' },
  { key: 'dog-fleatick', title: 'Dog: flea & tick treatment', cat: 'pet',
    every: { n: 1, unit: 'm' }, requires: { dog: true }, asset: 'dog',
    why: 'Monthly for most topicals and chews. Check your product - some chews are every 12 weeks; edit the interval to match.' },
  { key: 'dog-vet', title: 'Dog: annual vet exam and bloodwork', cat: 'pet',
    every: { n: 1, unit: 'y' }, requires: { dog: true }, asset: 'dog',
    why: 'Heartworm test is required to refill prevention. Track vaccine due dates in the dog\u2019s Things entry.' },
  { key: 'dog-rabies', title: 'Dog: rabies booster due', cat: 'pet',
    every: { n: 3, unit: 'y' }, requires: { dog: true }, asset: 'dog',
    why: '1-year or 3-year vaccine depending on jurisdiction and history - set this task\u2019s date from the certificate.' },
  { key: 'dog-dhpp', title: 'Dog: DHPP booster due', cat: 'pet',
    every: { n: 3, unit: 'y' }, requires: { dog: true }, asset: 'dog',
    why: 'Distemper/parvo combo, typically every 3 years after the initial series.' },
  { key: 'dog-bordetella', title: 'Dog: bordetella (kennel cough) booster', cat: 'pet',
    every: { n: 1, unit: 'y' }, requires: { dog: true }, asset: 'dog',
    why: 'Yearly, or every 6 months if boarding or daycare requires it.' },
  { key: 'dog-license', title: 'Dog: renew license / registration', cat: 'pet',
    every: { n: 1, unit: 'y' }, requires: { dog: true }, asset: 'dog',
    why: 'Most municipalities want proof of current rabies with the renewal.' },
  { key: 'dog-nails', title: 'Dog: nail trim', cat: 'pet',
    every: { n: 4, unit: 'w' }, requires: { dog: true }, asset: 'dog',
    why: 'Clicking on the floor means overdue. Long nails change gait and stress joints.' },

  // -------------------------------------------------------------------------
  // Warranty (new-construction). Seeded relative to warranty start date -
  // see schedule.js seedWarrantyTasks().
  // -------------------------------------------------------------------------
];

/**
 * Builder-warranty milestones, offsets in days from the warranty START date.
 * These become one-shot (non-recurring) tasks when a warranty date is set.
 */
export const WARRANTY_MILESTONES = [
  { key: 'warr-60d', offsetDays: 55, title: 'Builder warranty: 60-day punch list walkthrough', cat: 'warr',
    why: 'Walk the house with fresh eyes: settled caulk, nail pops, sticking doors. Submit in writing.' },
  { key: 'warr-6mo', offsetDays: 175, title: 'Builder warranty: 6-month check and written follow-up', cat: 'warr',
    why: 'Confirm earlier items were fixed; document anything new after a season of settling.' },
  { key: 'warr-11mo', offsetDays: 330, title: 'Builder warranty: 11-month inspection - book an inspector NOW', cat: 'warr',
    why: 'Hire an independent inspector a month before the 1-year warranty ends, so every defect is claimed in writing while the builder still has to fix it. This is the highest-leverage $400 of the first year.' },
  { key: 'warr-end', offsetDays: 350, title: 'Builder warranty: final claim deadline - submit everything in writing', cat: 'warr',
    why: 'Claims postmarked before the anniversary are covered. The date, not your intentions, is what counts.' },
];

/** Look up a library task by key. */
export function libTask(key) {
  return LIBRARY.find((t) => t.key === key) || null;
}

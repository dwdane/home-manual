// library.js
/**
 * Content, no logic: the task libraries per subject kind, the categories,
 * the setup wizard field definitions, the builder-warranty milestones, and
 * the self-inspection item bank.
 *
 * A library entry:
 *   key       stable id used to match/reconcile on feature edits
 *   title     what appears on the list
 *   cat       category id (CATS)
 *   why       one sentence of motivation, shown in the task sheet
 *   how       optional short instructions, shown under "How to do it"
 *   every     {n, unit 'w'|'m'|'y'} for interval tasks
 *   windows   [[startMonth, endMonth], ...] for seasonal tasks
 *   yearGap   for seasonal tasks that recur less than yearly
 *   need      (features) => bool; omitted means always suggested
 *   assetHint text hinting which equipment to link
 *
 * Seasonal windows assume a temperate northern-hemisphere climate and are
 * defaults - every task's schedule is editable in the app.
 */

// --- categories ------------------------------------------------------------

export const CATS = {
  house: [
    { id: 'hvac', label: 'Air & Heat' },
    { id: 'water', label: 'Water & Plumbing' },
    { id: 'appl', label: 'Appliances' },
    { id: 'ext', label: 'Outside' },
    { id: 'safety', label: 'Safety' },
    { id: 'clean', label: 'Deep Cleaning' },
    { id: 'garden', label: 'Garden & Yard' },
    { id: 'warr', label: 'Warranty' },
    { id: 'other', label: 'Other' },
  ],
  vehicle: [
    { id: 'engine', label: 'Engine & Fluids' },
    { id: 'tires', label: 'Tires & Brakes' },
    { id: 'cabin', label: 'Cabin & Body' },
    { id: 'admin', label: 'Paperwork' },
    { id: 'other', label: 'Other' },
  ],
  pet: [
    { id: 'meds', label: 'Medicine' },
    { id: 'vet', label: 'Vet & Vaccines' },
    { id: 'care', label: 'Care' },
    { id: 'admin', label: 'Paperwork' },
    { id: 'other', label: 'Other' },
  ],
};

/** Category label lookup across kinds. */
export function catLabel(kind, id) {
  const found = (CATS[kind] || []).find((c) => c.id === id);
  return found ? found.label : 'Other';
}

// --- house library ---------------------------------------------------------

const H = [
  // Air & Heat
  { key: 'hvac-filter', title: 'Replace HVAC filter', cat: 'hvac',
    why: 'A clogged filter strains the blower and recirculates dust.',
    how: 'Arrow on the filter frame points toward the unit (direction of airflow). Write the install date on the edge with a Sharpie before sliding it in. Note the size here the first time - most returns take 1" filters; check for a second return upstairs.',
    every: { n: 3, unit: 'm' }, need: (f) => f.furnace !== 'none' || f.centralAC,
    assetHint: 'Furnace / air handler' },
  { key: 'ac-service', title: 'AC serviced before summer', cat: 'hvac',
    why: 'A pre-season check catches refrigerant and capacitor issues before the first heat wave.',
    windows: [[3, 5]], need: (f) => f.centralAC },
  { key: 'furnace-service', title: 'Furnace / heat serviced before winter', cat: 'hvac',
    why: 'Heat exchanger and ignition checks are cheap; a January failure is not.',
    windows: [[9, 10]], need: (f) => f.furnace && f.furnace !== 'none' },
  { key: 'condensate', title: 'Flush AC condensate drain line', cat: 'hvac',
    why: 'Algae clogs the line and the overflow pan is what fails next.',
    how: 'Find the PVC drain near the air handler. Pour a cup of distilled vinegar into the access tee. If there is a shop vac, pull from the outside end for 30 seconds.',
    windows: [[4, 5], [7, 8]], need: (f) => f.centralAC },
  { key: 'condenser-clean', title: 'Rinse outdoor AC condenser coils', cat: 'hvac',
    why: 'Cottonwood fluff and grass clippings choke airflow and efficiency.',
    how: 'Kill power at the disconnect box beside the unit. Rinse fins gently from the inside out with a garden hose - no pressure washer. Keep 2 ft of clearance trimmed around it.',
    windows: [[4, 6]], need: (f) => f.centralAC },
  { key: 'minisplit-clean', title: 'Wash mini-split filters', cat: 'hvac',
    why: 'The washable screens clog monthly in heavy use and the coil grows mold behind them.',
    how: 'Lift the front panel, slide the screens out, rinse, air dry fully before reinstalling.',
    every: { n: 2, unit: 'm' }, need: (f) => f.miniSplit },
  { key: 'boiler-service', title: 'Boiler serviced before heating season', cat: 'hvac',
    why: 'Bleeding radiators and checking pressure prevents cold spots and bangs.',
    windows: [[9, 10]], need: (f) => f.boiler },
  { key: 'registers', title: 'Vacuum supply and return registers', cat: 'hvac',
    why: 'Grilles collect a felt of dust that feeds back into the system.',
    every: { n: 6, unit: 'm' }, need: (f) => f.furnace !== 'none' || f.centralAC },
  { key: 'humidifier-pad', title: 'Replace humidifier pad, clean tray', cat: 'hvac',
    why: 'A scaled pad breeds bacteria and stops humidifying.',
    windows: [[9, 10]], need: (f) => f.humidifier },
  { key: 'erv-core', title: 'Clean ERV/HRV core and filters', cat: 'hvac',
    why: 'The heat-exchange core clogs quietly and airflow halves.',
    every: { n: 6, unit: 'm' }, need: (f) => f.erv },
  { key: 'ceiling-fans', title: 'Reverse & dust ceiling fans', cat: 'hvac',
    why: 'Blades hold a surprising rug of dust; winter mode (clockwise, low) pushes warm air down.',
    windows: [[4, 4], [10, 10]], need: (f) => f.ceilingFans },
  { key: 'bath-fans', title: 'Vacuum bathroom exhaust fan grilles', cat: 'hvac',
    why: 'A choked fan leaves moisture that becomes mildew and peeling paint.',
    every: { n: 6, unit: 'm' }, need: (f) => f.bathFans },
  { key: 'fireplace-gas', title: 'Gas fireplace serviced', cat: 'hvac',
    why: 'Annual service checks the burner, pilot, and (critically) CO spillage. Ventless units especially need clean burners.',
    windows: [[9, 10]], need: (f) => f.fireplace === 'gasV' || f.fireplace === 'gasVL' },
  { key: 'chimney-sweep', title: 'Chimney swept and inspected', cat: 'hvac',
    why: 'Creosote is how chimney fires start.',
    windows: [[8, 10]], need: (f) => f.fireplace === 'wood' },
  { key: 'pellet-clean', title: 'Deep-clean pellet stove & vent', cat: 'hvac',
    why: 'Ash buildup in the vent chokes the burn and can back-puff smoke.',
    windows: [[8, 10]], need: (f) => f.fireplace === 'pellet' },

  // Water & Plumbing
  { key: 'wh-flush', title: 'Flush water heater tank', cat: 'water',
    why: 'Sediment on the bottom insulates the burner and shortens tank life.',
    how: 'Turn gas to pilot (or power off). Connect a hose to the bottom drain, run it to a floor drain or outside, open the drain and a hot tap upstairs, let it run until clear.',
    windows: [[3, 5]], need: (f) => f.waterHeater === 'tank' },
  { key: 'wh-anode', title: 'Check water heater anode rod', cat: 'water',
    why: 'A $30 rod sacrifices itself so the tank does not rust; once it is gone the tank goes next.',
    windows: [[3, 5]], yearGap: 3, need: (f) => f.waterHeater === 'tank' },
  { key: 'wh-tpr', title: 'Test water heater T&P relief valve', cat: 'water',
    why: 'The valve that stops a tank becoming a rocket sticks if never exercised.',
    how: 'Put a bucket under the discharge tube. Lift the lever for two seconds; water should flow and then stop cleanly. If it dribbles afterward, replace the valve.',
    every: { n: 12, unit: 'm' }, need: (f) => f.waterHeater === 'tank' },
  { key: 'wh-descale', title: 'Descale tankless water heater', cat: 'water',
    why: 'Scale on the heat exchanger cuts efficiency and trips error codes.',
    how: 'Close the isolation valves, connect the pump kit to the service ports, circulate 2-3 gallons of white vinegar for 45-60 minutes, flush with fresh water, clean the inlet screen.',
    every: { n: 12, unit: 'm' }, need: (f) => f.waterHeater === 'tankless',
    assetHint: 'Tankless water heater' },
  { key: 'shower-filter', title: 'Replace shower hard-water filter', cat: 'water',
    why: 'A spent cartridge does nothing; note the model here so reorder is one tap.',
    how: 'Unscrew the housing, swap the cartridge, hand-tighten. Write the date on the new cartridge with a Sharpie.',
    every: { n: 6, unit: 'm' }, need: (f) => f.showerFilter, assetHint: 'Shower filter' },
  { key: 'fridge-filter', title: 'Replace fridge water filter', cat: 'water',
    why: 'Six months is the standard life; taste and flow fall off after.',
    how: 'Most twist a quarter-turn counterclockwise and pull. Push the new one in, quarter-turn back. Run 2 gallons through the dispenser to purge carbon fines. Sharpie the date on it, and reset the filter light (hold the reset button ~3 seconds).',
    every: { n: 6, unit: 'm' }, need: (f) => f.fridgeFilter, assetHint: 'Refrigerator' },
  { key: 'sediment-filter', title: 'Replace whole-house sediment filter', cat: 'water',
    why: 'A loaded cartridge drops pressure through the whole house.',
    every: { n: 3, unit: 'm' }, need: (f) => f.sedimentFilter },
  { key: 'softener-salt', title: 'Check softener salt level', cat: 'water',
    why: 'Below a third full, soft water quietly stops. Break up any salt bridge.',
    every: { n: 2, unit: 'm' }, need: (f) => f.softener, assetHint: 'Water softener' },
  { key: 'sump-test', title: 'Test sump pump', cat: 'water',
    why: 'You want to find a dead pump on a dry day, not in a storm.',
    how: 'Pour a bucket of water into the pit until the float lifts. The pump should run, drain the pit, and shut off. Check the discharge outside actually flows away from the house.',
    every: { n: 3, unit: 'm' }, need: (f) => f.sump },
  { key: 'septic-pump', title: 'Septic tank pumped', cat: 'water',
    why: 'Every 3-5 years for most households; solids overflowing into the field is a five-figure repair.',
    windows: [[4, 9]], yearGap: 3, need: (f) => f.sewage === 'septic' },
  { key: 'well-test', title: 'Well water tested (bacteria, nitrates)', cat: 'water',
    why: 'Annual testing is the only way to know; wells change.',
    windows: [[4, 6]], need: (f) => f.water === 'well' },
  { key: 'disposal-freshen', title: 'Freshen garbage disposal (ice + citrus)', cat: 'water',
    why: 'Ice knocks buildup off the impellers; citrus peel handles the smell.',
    every: { n: 1, unit: 'm' }, need: (f) => f.disposal },
  { key: 'dw-filter', title: 'Clean dishwasher filter and spray arms', cat: 'water',
    why: 'The cylinder filter in the floor of the tub is why dishes come out gritty.',
    how: 'Twist the cylinder filter out of the tub floor, rinse under hot water with a brush. Poke cleared spray-arm holes with a toothpick.',
    every: { n: 1, unit: 'm' }, need: (f) => f.dishwasher, assetHint: 'Dishwasher' },
  { key: 'washer-gasket', title: 'Wipe washer door gasket, leave door open', cat: 'water',
    why: 'Front-loader gaskets grow mildew fast; a monthly wipe and an open door prevent the smell.',
    every: { n: 1, unit: 'm' }, need: (f) => f.washer === 'front', assetHint: 'Washer' },
  { key: 'washer-clean', title: 'Run washer cleaning cycle', cat: 'water',
    every: { n: 3, unit: 'm' }, need: (f) => Boolean(f.washer), assetHint: 'Washer',
    why: 'Detergent residue builds a film the cleaning cycle strips.' },
  { key: 'washer-hoses', title: 'Inspect washer supply hoses', cat: 'water',
    why: 'A burst supply hose is a top-three cause of home water damage. Bulges or rust at the fittings mean replace now.',
    every: { n: 12, unit: 'm' } },
  { key: 'sink-leaks', title: 'Look under every sink for leaks', cat: 'water',
    why: 'Slow drips rot cabinets for months before anyone notices.',
    every: { n: 6, unit: 'm' } },
  { key: 'toilet-dye', title: 'Toilet dye test for silent leaks', cat: 'water',
    how: 'Food coloring in the tank; if color reaches the bowl in 15 minutes without flushing, the flapper leaks.',
    why: 'A silently leaking flapper wastes hundreds of gallons a day.',
    every: { n: 12, unit: 'm' } },
  { key: 'aerators', title: 'Clean faucet aerators & showerheads', cat: 'water',
    why: 'Grit and scale are why the pressure went weird.',
    how: 'Unscrew the aerator, rinse the screen. Vinegar soak overnight in a bag rubber-banded over the showerhead dissolves scale.',
    every: { n: 6, unit: 'm' } },
  { key: 'shutoffs', title: 'Exercise water shutoff valves', cat: 'water',
    why: 'Valves seize open; the night a supply line bursts is the wrong time to learn which.',
    how: 'Close and reopen every fixture stop and the main. Know where the main is - tag it.',
    every: { n: 12, unit: 'm' } },

  // Appliances
  { key: 'fridge-coils', title: 'Vacuum refrigerator coils', cat: 'appl',
    why: 'Dusty coils make the compressor run hot and long.',
    how: 'Coils are behind the bottom kick plate or on the back. Unplug, then brush attachment.',
    every: { n: 6, unit: 'm' }, assetHint: 'Refrigerator',
    need: () => true },
  { key: 'hood-filter', title: 'Degrease range hood filter', cat: 'appl',
    why: 'A saturated mesh filter stops capturing anything.',
    how: 'Drop the mesh filters into a sink of very hot water with a squirt of degreasing dish soap and a half cup of baking soda; soak 15 minutes, brush, rinse.',
    every: { n: 3, unit: 'm' }, need: (f) => f.hood === 'vented' },
  { key: 'otr-charcoal', title: 'Replace microwave charcoal filter', cat: 'appl',
    why: 'Recirculating over-the-range microwaves push kitchen air through a charcoal filter almost nobody knows exists. It cannot be washed - only replaced.',
    how: 'Grille at the top front usually releases with two screws; the charcoal filter sits behind it. Note the part number here. Wash the metal grease filter underneath while you are there.',
    every: { n: 6, unit: 'm' }, need: (f) => f.otrMicrowave && f.hood !== 'vented',
    assetHint: 'Microwave' },
  { key: 'otr-grease', title: 'Wash microwave grease filter', cat: 'appl',
    why: 'The metal mesh under the microwave loads up with grease like a hood filter.',
    every: { n: 2, unit: 'm' }, need: (f) => f.otrMicrowave },
  { key: 'oven-clean', title: 'Clean the oven', cat: 'appl',
    every: { n: 6, unit: 'm' }, need: (f) => Boolean(f.range && f.range !== 'none'),
    why: 'Carbonized drips smoke at temperature and flavor everything.' },
  { key: 'dryer-lint-deep', title: 'Vacuum inside dryer lint housing', cat: 'appl',
    why: 'The trap catches most lint; the housing below it catches the rest.',
    every: { n: 6, unit: 'm' }, assetHint: 'Dryer', need: (f) => Boolean(f.dryer) },
  { key: 'freezer-defrost', title: 'Defrost & vacuum stand-alone freezer', cat: 'appl',
    every: { n: 12, unit: 'm' }, need: (f) => f.standFreezer,
    why: 'Frost past a quarter inch makes it work hard; coils need air.' },

  // Outside
  { key: 'gutters', title: 'Clean gutters and downspouts', cat: 'ext',
    why: 'Overflowing gutters dump water at the foundation - the root of most basement leaks.',
    windows: [[4, 5], [10, 11]], need: (f) => f.gutters },
  { key: 'roof-look', title: 'Look over the roof from the ground', cat: 'ext',
    why: 'Binoculars from the yard catch lifted shingles and flashing gaps early.',
    windows: [[4, 5], [10, 11]] },
  { key: 'caulk-ext', title: 'Inspect exterior caulk and seals', cat: 'ext',
    why: 'Gaps at windows, doors, and penetrations let water into the wall assembly.',
    windows: [[4, 6]] },
  { key: 'grading', title: 'Check grading and downspout runoff', cat: 'ext',
    why: 'Soil should slope away from the house; splash blocks and extensions earn their keep.',
    windows: [[3, 5]] },
  { key: 'siding-wash', title: 'Wash siding and check for damage', cat: 'ext',
    windows: [[5, 7]],
    why: 'A rinse is also an inspection: woodpecker holes, wasp nests, failing paint.' },
  { key: 'garage-door', title: 'Lubricate garage door, test safety reverse', cat: 'ext',
    why: 'Silicone lube on rollers and hinges yearly; the reverse test is a child-safety check.',
    how: 'Lay a 2x4 flat under the door and close it - the door must reverse on contact. Wave a broom through the sensor beam while closing - it must reverse.',
    every: { n: 12, unit: 'm' }, need: (f) => f.garage && f.garage !== '0',
    assetHint: 'Garage door opener' },
  { key: 'deck-fasteners', title: 'Check deck fasteners and ledger', cat: 'ext',
    windows: [[4, 5]], need: (f) => f.deck && f.deck !== 'none',
    why: 'The ledger connection to the house is where decks fail catastrophically.' },
  { key: 'deck-seal', title: 'Reseal or stain the deck', cat: 'ext',
    windows: [[5, 6]], yearGap: 2, need: (f) => f.deck === 'wood',
    why: 'Water beading is the test; when it soaks in, it is time.' },
  { key: 'driveway-seal', title: 'Seal driveway cracks', cat: 'ext',
    windows: [[8, 9]], yearGap: 2, need: (f) => f.driveway === 'concrete' || f.driveway === 'asphalt',
    why: 'Water in cracks + freeze = spalling. Cheap caulk now beats resurfacing later.' },
  { key: 'crawl-check', title: 'Check the crawlspace', cat: 'ext',
    why: 'Standing water, hanging insulation, and pest signs are all cheaper caught early.',
    windows: [[3, 4], [10, 11]], need: (f) => f.foundation === 'crawl' },
  { key: 'basement-look', title: 'Walk the basement perimeter', cat: 'ext',
    windows: [[3, 4], [10, 11]], need: (f) => f.foundation === 'basement',
    why: 'Efflorescence and damp corners tell you about water before it becomes a flood.' },
  { key: 'pest-look', title: 'Walk the exterior for pest signs', cat: 'ext',
    windows: [[4, 5], [9, 10]],
    why: 'Mud tubes on the foundation, frass, chewed screens - ten minutes, twice a year.' },
  { key: 'hose-bibs', title: 'Disconnect hoses, winterize hose bibs', cat: 'ext',
    why: 'A hose left attached is how frost-free bibs burst inside the wall.',
    windows: [[10, 11]], need: (f) => f.climateFreeze },
  { key: 'window-weeps', title: 'Clear window weep holes', cat: 'ext',
    every: { n: 12, unit: 'm' },
    why: 'Blocked weeps let rain pool inside the frame and leak into the wall.' },
  { key: 'fence-check', title: 'Check fence posts and gates', cat: 'ext',
    windows: [[4, 5]], need: (f) => f.fence,
    why: 'Wobbly posts are easy to reset before they lean.' },
  { key: 'shed-check', title: 'Check shed roof and door seals', cat: 'ext',
    windows: [[4, 5]], need: (f) => f.shed,
    why: 'Small roofs fail quietly; everything inside pays.' },
  { key: 'pool-open', title: 'Open the pool', cat: 'ext',
    windows: [[4, 5]], need: (f) => f.pool, why: 'Balance early, fight algae never.' },
  { key: 'pool-close', title: 'Close and winterize the pool', cat: 'ext',
    windows: [[9, 10]], need: (f) => f.pool && f.climateFreeze,
    why: 'Blown lines and a good cover are the whole game.' },
  { key: 'hottub-water', title: 'Drain and refill hot tub', cat: 'ext',
    every: { n: 4, unit: 'm' }, need: (f) => f.hotTub,
    why: 'Chemistry stops working in old water; quarterly is the standard.' },

  // Safety
  { key: 'smoke-test', title: 'Test all smoke and CO detectors', cat: 'safety',
    why: 'Press the button on every unit. Thirty seconds a month.',
    every: { n: 1, unit: 'm' } },
  { key: 'smoke-batt', title: 'Replace detector batteries', cat: 'safety',
    every: { n: 12, unit: 'm' },
    why: 'Yearly on a date you remember - unless they are sealed 10-year units.' },
  { key: 'smoke-age', title: 'Check detector ages (replace at 10 years)', cat: 'safety',
    every: { n: 12, unit: 'm' },
    why: 'The manufacture date is printed on the back. Sensors die of old age while still chirping happily.' },
  { key: 'extinguisher', title: 'Check fire extinguisher gauges', cat: 'safety',
    every: { n: 6, unit: 'm' },
    why: 'Needle in the green, pin in place, no corrosion. Know where they are.' },
  { key: 'dryer-vent', title: 'Clean dryer vent duct to outside', cat: 'safety',
    why: 'Lint in the duct is a leading cause of house fires; long runs clog faster.',
    how: 'Pull the dryer out, disconnect the duct, run a brush kit through to the outside flap. Check the flap opens freely when the dryer runs.',
    every: { n: 12, unit: 'm' }, need: (f) => Boolean(f.dryer) },
  { key: 'gfci', title: 'Test GFCI outlets', cat: 'safety',
    how: 'Press TEST on each (kitchen, baths, garage, outside) - it should click dead; RESET restores. One dead GFCI can kill a whole chain of outlets.',
    every: { n: 6, unit: 'm' }, why: 'The trip mechanism wears out unexercised.' },
  { key: 'radon', title: 'Radon test', cat: 'safety',
    windows: [[11, 2]], yearGap: 2, need: (f) => f.radonArea,
    why: 'Closed-house winter conditions give the truest reading.' },
  { key: 'generator-run', title: 'Exercise the generator', cat: 'safety',
    every: { n: 1, unit: 'm' }, need: (f) => f.generator,
    why: 'Run it under a little load monthly; stale fuel and dead batteries are why generators fail in outages.' },
  { key: 'emergency-kit', title: 'Refresh emergency kit & water', cat: 'safety',
    every: { n: 12, unit: 'm' },
    why: 'Rotate the water, check flashlight batteries, restock the med kit.' },

  // Deep Cleaning
  { key: 'windows-clean', title: 'Wash windows inside and out', cat: 'clean',
    windows: [[4, 5], [9, 10]], why: 'Twice a year keeps it a chore instead of a project.' },
  { key: 'ceiling-fixtures', title: 'Dust ceiling fixtures and vents', cat: 'clean',
    every: { n: 6, unit: 'm' }, why: 'Everything up high rains back down eventually.' },
  { key: 'baseboards', title: 'Wipe baseboards and door tops', cat: 'clean',
    every: { n: 6, unit: 'm' }, why: 'The line everyone sees and nobody cleans.' },
  { key: 'mattress', title: 'Rotate mattresses, wash covers', cat: 'clean',
    every: { n: 6, unit: 'm' }, why: 'Even no-flip mattresses wear evenly only if rotated.' },
  { key: 'carpet-deep', title: 'Deep-clean carpets', cat: 'clean',
    every: { n: 12, unit: 'm' }, why: 'Extraction gets what vacuums cannot.' },
  { key: 'grout-seal', title: 'Reseal tile grout', cat: 'clean',
    every: { n: 24, unit: 'm' }, why: 'Sealed grout wipes clean; unsealed grout absorbs.' },
  { key: 'garage-clean', title: 'Clean out the garage', cat: 'clean',
    windows: [[4, 5], [9, 10]], need: (f) => f.garage && f.garage !== '0',
    why: 'Twice a year before it becomes archaeology.' },
  { key: 'bins-wash', title: 'Wash trash and recycling bins', cat: 'clean',
    every: { n: 3, unit: 'm' }, why: 'Ten minutes with a hose beats the smell all summer.' },
  { key: 'caulk-tub', title: 'Check tub/shower caulk and grout', cat: 'clean',
    every: { n: 12, unit: 'm' },
    why: 'Failed caulk at the tub line sends water into the subfloor.' },

  // Garden & Yard
  { key: 'hydrangea-prune', title: 'Prune hydrangeas', cat: 'garden',
    why: 'Panicle and smooth types: cut back hard in late winter (they bloom on new wood). Bigleaf/oakleaf bloom on OLD wood - for those, prune right after flowering instead, or you cut off next year\u2019s blooms.',
    windows: [[2, 3]], need: (f) => f.gardenBeds },
  { key: 'rose-prune', title: 'Prune roses', cat: 'garden',
    windows: [[2, 3]], need: (f) => f.gardenBeds,
    why: 'When the forsythia blooms: dead wood out, open the center, cut to outward buds.' },
  { key: 'fruit-prune', title: 'Dormant-prune fruit trees', cat: 'garden',
    windows: [[1, 3]], need: (f) => f.trees,
    why: 'Structure cuts happen while dormant; you can see the shape and disease pressure is low.' },
  { key: 'lawn-feed-spring', title: 'Feed the lawn (spring)', cat: 'garden',
    windows: [[4, 5]], need: (f) => f.yard, why: 'After the second mow, not before.' },
  { key: 'lawn-feed-fall', title: 'Feed the lawn (fall)', cat: 'garden',
    windows: [[9, 10]], need: (f) => f.yard,
    why: 'The most important feeding of the year - roots bank it for spring.' },
  { key: 'pre-emergent', title: 'Apply pre-emergent', cat: 'garden',
    windows: [[3, 4]], need: (f) => f.yard,
    why: 'Timing beats product: soil at 55\u00B0F, roughly when forsythia blooms.' },
  { key: 'aerate', title: 'Aerate and overseed', cat: 'garden',
    windows: [[9, 10]], need: (f) => f.yard,
    why: 'Fall germination without summer weed pressure.' },
  { key: 'mulch', title: 'Refresh mulch beds', cat: 'garden',
    windows: [[4, 5]], need: (f) => f.gardenBeds,
    why: 'Two to three inches, pulled back from stems and trunks.' },
  { key: 'shrub-feed', title: 'Feed shrubs and beds', cat: 'garden',
    windows: [[4, 5]], need: (f) => f.gardenBeds,
    why: 'Slow-release once in spring covers most ornamentals.' },
  { key: 'bulbs', title: 'Plant spring bulbs', cat: 'garden',
    windows: [[10, 11]], need: (f) => f.gardenBeds,
    why: 'After the first frost, before the ground hardens.' },
  { key: 'divide', title: 'Divide crowded perennials', cat: 'garden',
    windows: [[9, 10]], yearGap: 2, need: (f) => f.gardenBeds,
    why: 'Doughnut-shaped clumps are asking for it.' },
  { key: 'tree-walk', title: 'Walk trees for hazards', cat: 'garden',
    windows: [[10, 11]], need: (f) => f.trees,
    why: 'Deadwood over the roof, cracks at unions - look before winter storms.' },
  { key: 'sprinkler-start', title: 'Start up sprinkler system', cat: 'garden',
    windows: [[4, 5]], need: (f) => f.sprinklers,
    why: 'Walk every zone; heads break over winter.' },
  { key: 'sprinkler-blowout', title: 'Winterize (blow out) sprinklers', cat: 'garden',
    windows: [[10, 11]], need: (f) => f.sprinklers && f.climateFreeze,
    why: 'Water left in lines cracks fittings underground.' },
  { key: 'mower-service', title: 'Service the mower', cat: 'garden',
    windows: [[2, 3]], need: (f) => f.yard,
    why: 'Blade sharpened, oil changed, before the spring rush at the shop.' },
];

// --- warranty milestones ---------------------------------------------------

/**
 * One-shot builder-warranty tasks, offset in days from the closing date.
 * The 11-month independent inspection is the one that matters most: it is
 * the last chance to document defects while the builder still must fix them.
 */
export const WARRANTY_MILESTONES = [
  { key: 'warr-60d', title: 'Builder 60-day punch list', cat: 'warr', offsetDays: 55,
    why: 'Collect every cosmetic and settling issue into one written list while the builder expects it.' },
  { key: 'warr-6mo', title: 'Builder warranty 6-month check', cat: 'warr', offsetDays: 175,
    why: 'Walk the house against your punch list; document anything new in writing.' },
  { key: 'warr-11mo', title: '11-month warranty inspection (hire one)', cat: 'warr', offsetDays: 330,
    why: 'Pay an independent inspector before the 1-year warranty ends - their report becomes your claim list. This is the important one.' },
  { key: 'warr-1yr', title: 'Final warranty claims deadline', cat: 'warr', offsetDays: 350,
    why: 'Submit everything in writing before the anniversary. After this the builder is done.' },
];

// --- vehicle library -------------------------------------------------------

const V = [
  { key: 'oil', title: 'Oil and filter change', cat: 'engine',
    why: 'By miles or months, whichever first - log the mileage in the note when you mark it done, and put the next mileage on the windshield sticker.',
    every: { n: 6, unit: 'm' }, need: (f) => f.fuel !== 'ev' },
  { key: 'engine-air', title: 'Replace engine air filter', cat: 'engine',
    why: 'Hold it up to the light; if light barely passes, replace. Note the part number here.',
    every: { n: 12, unit: 'm' }, need: (f) => f.fuel !== 'ev' },
  { key: 'coolant', title: 'Check coolant level & condition', cat: 'engine',
    every: { n: 6, unit: 'm' },
    why: 'Cold engine only. Color should be bright, not rusty.' },
  { key: 'battery-12v', title: 'Check 12V battery terminals', cat: 'engine',
    every: { n: 6, unit: 'm' },
    why: 'Corrosion at the posts is the usual no-start. EVs have one too, and it strands the car just the same.' },
  { key: 'tire-rotate', title: 'Rotate tires', cat: 'tires',
    why: 'Front tires wear faster - EVs eat tires quicker still. Note mileage in the log.',
    how: 'Non-directional tires: cross the fronts to the rear (X pattern), rears straight forward. Directional tires: front-to-back same side only. Torque lugs to spec.',
    every: { n: 6, unit: 'm' } },
  { key: 'tire-pressure', title: 'Check tire pressures (incl. spare)', cat: 'tires',
    why: 'The right numbers are on the door-jamb sticker, not the tire sidewall.',
    every: { n: 1, unit: 'm' } },
  { key: 'tread', title: 'Check tread depth', cat: 'tires',
    how: 'Quarter test: Washington\u2019s head down in a groove - if you can see the top of his head, under 4/32" and time to shop.',
    every: { n: 6, unit: 'm' }, why: 'Wet braking falls off a cliff below 4/32".' },
  { key: 'brake-fluid', title: 'Brake fluid checked / flushed', cat: 'tires',
    every: { n: 24, unit: 'm' },
    why: 'Fluid absorbs water and quietly rusts the system from inside. Every 2-3 years.' },
  { key: 'wipers', title: 'Replace wiper blades', cat: 'cabin',
    why: 'Twice a year is cheap. Note the sizes here (driver and passenger usually differ; check for a rear blade).',
    every: { n: 6, unit: 'm' } },
  { key: 'cabin-air', title: 'Replace cabin air filter', cat: 'cabin',
    why: 'Behind the glovebox on most cars - a 5-minute job shops charge real money for. Note the part number.',
    how: 'Empty the glovebox, squeeze its side stops so it drops down, slide the filter cover off, swap the filter (airflow arrow down usually).',
    every: { n: 12, unit: 'm' } },
  { key: 'wash-wax', title: 'Wash and wax / seal', cat: 'cabin',
    every: { n: 4, unit: 'm' }, why: 'Sealant twice a year keeps clear coat alive; underside rinse after winter roads.' },
  { key: 'registration', title: 'Registration renewal', cat: 'admin',
    every: { n: 12, unit: 'm' }, why: 'Set this to your actual renewal month.' },
  { key: 'inspection', title: 'State inspection / emissions', cat: 'admin',
    every: { n: 12, unit: 'm' }, why: 'If your state requires one. Set to the due month.' },
  { key: 'insurance-review', title: 'Insurance review', cat: 'admin',
    every: { n: 12, unit: 'm' }, why: 'Rates drift; a 20-minute quote check yearly pays.' },
];

// --- pet library -----------------------------------------------------------

const P = [
  { key: 'heartworm', title: 'Heartworm preventative', cat: 'meds',
    why: 'Monthly, year-round; give with food and log the date.',
    every: { n: 1, unit: 'm' }, need: (f) => f.species === 'dog' },
  { key: 'flea-tick', title: 'Flea & tick treatment', cat: 'meds',
    every: { n: 1, unit: 'm' },
    why: 'Monthly for most products; note which product and dose in the task so refills are easy.' },
  { key: 'vet-annual', title: 'Annual vet exam', cat: 'vet',
    every: { n: 12, unit: 'm' },
    why: 'Bloodwork trends matter more than any single visit. Photograph the visit summary into Paperwork.' },
  { key: 'rabies', title: 'Rabies booster', cat: 'vet',
    every: { n: 36, unit: 'm' },
    why: 'Set to your certificate date - 1-year or 3-year depending on the vaccine. Photograph the certificate.' },
  { key: 'dhpp', title: 'DHPP booster', cat: 'vet',
    every: { n: 36, unit: 'm' }, need: (f) => f.species === 'dog',
    why: 'Core dog vaccine; set to the certificate date.' },
  { key: 'fvrcp', title: 'FVRCP booster', cat: 'vet',
    every: { n: 36, unit: 'm' }, need: (f) => f.species === 'cat',
    why: 'Core cat vaccine; set to the certificate date.' },
  { key: 'bordetella', title: 'Bordetella (kennel cough)', cat: 'vet',
    every: { n: 12, unit: 'm' }, need: (f) => f.species === 'dog',
    why: 'Required by most boarders and daycares.' },
  { key: 'license', title: 'Pet license renewal', cat: 'admin',
    every: { n: 12, unit: 'm' },
    why: 'Most cities renew annually; keep the tag number in the pet\u2019s details.' },
  { key: 'chip-check', title: 'Verify microchip registration', cat: 'admin',
    every: { n: 12, unit: 'm' },
    why: 'A chip with a stale phone number finds nobody. Keep the chip number in the pet\u2019s details.' },
  { key: 'nails', title: 'Nail trim', cat: 'care',
    every: { n: 6, unit: 'w' },
    why: 'Clicking on the floor means overdue.' },
  { key: 'teeth', title: 'Teeth brushing / dental chew check', cat: 'care',
    every: { n: 1, unit: 'w' },
    why: 'Dental disease is the most common thing vets find.' },
  { key: 'litter-deep', title: 'Deep-clean litter box', cat: 'care',
    every: { n: 1, unit: 'm' }, need: (f) => f.species === 'cat',
    why: 'Full dump, hot water wash, fresh litter.' },
  { key: 'weight', title: 'Weigh and note weight', cat: 'care',
    every: { n: 3, unit: 'm' },
    why: 'Slow drift is invisible day to day; a log makes it obvious.' },
];

export const LIBRARY = { house: H, vehicle: V, pet: P };

// --- setup wizard ----------------------------------------------------------

/**
 * House feature wizard, section by section. Field kinds:
 *   toggle  boolean checkbox row
 *   seg     one-of segmented control  {options: [{v, label}]}
 *   count   small number stepper
 *   text    free text
 *   date    date input
 */
export const HOUSE_SECTIONS = [
  { title: 'The basics', fields: [
    { key: 'name', kind: 'text', label: 'Name / address', placeholder: 'e.g. 123 Maple St' },
    { key: 'type', kind: 'seg', label: 'Type', options: [
      { v: 'house', label: 'House' }, { v: 'town', label: 'Townhome' }, { v: 'condo', label: 'Condo/Apt' }] },
    { key: 'stories', kind: 'seg', label: 'Stories', options: [
      { v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3+' }] },
    { key: 'beds', kind: 'count', label: 'Bedrooms', min: 0, max: 8 },
    { key: 'baths', kind: 'count', label: 'Bathrooms', min: 1, max: 8, step: 0.5 },
    { key: 'warrantyStart', kind: 'date', label: 'Builder warranty start (closing date, if new construction)' },
    { key: 'climateFreeze', kind: 'seg', label: 'Winters here', options: [
      { v: true, label: 'Freeze' }, { v: false, label: 'Stay mild' }] },
    { key: 'foundation', kind: 'seg', label: 'Foundation', options: [
      { v: 'slab', label: 'Slab' }, { v: 'crawl', label: 'Crawlspace' }, { v: 'basement', label: 'Basement' }] },
    { key: 'garage', kind: 'seg', label: 'Garage', options: [
      { v: '0', label: 'None' }, { v: '1', label: '1-car' }, { v: '2', label: '2-car' }, { v: '3', label: '3+' }] },
    { key: 'driveway', kind: 'seg', label: 'Driveway', options: [
      { v: 'concrete', label: 'Concrete' }, { v: 'asphalt', label: 'Asphalt' }, { v: 'gravel', label: 'Gravel' }, { v: 'none', label: 'None' }] },
  ] },
  { title: 'Air & heat', fields: [
    { key: 'furnace', kind: 'seg', label: 'Heat', options: [
      { v: 'gas', label: 'Gas furnace' }, { v: 'electric', label: 'Electric' }, { v: 'heatpump', label: 'Heat pump' }, { v: 'none', label: 'None' }] },
    { key: 'centralAC', kind: 'toggle', label: 'Central AC' },
    { key: 'miniSplit', kind: 'toggle', label: 'Mini-split unit(s)' },
    { key: 'boiler', kind: 'toggle', label: 'Boiler / radiators' },
    { key: 'humidifier', kind: 'toggle', label: 'Whole-house humidifier' },
    { key: 'erv', kind: 'toggle', label: 'ERV / HRV fresh-air system' },
    { key: 'ceilingFans', kind: 'toggle', label: 'Ceiling fans' },
    { key: 'bathFans', kind: 'toggle', label: 'Bathroom exhaust fans' },
    { key: 'atticFan', kind: 'toggle', label: 'Attic / whole-house fan' },
    { key: 'fireplace', kind: 'seg', label: 'Fireplace', options: [
      { v: 'none', label: 'None' }, { v: 'gasV', label: 'Gas' }, { v: 'gasVL', label: 'Gas ventless' }, { v: 'wood', label: 'Wood' }, { v: 'pellet', label: 'Pellet' }] },
  ] },
  { title: 'Water & plumbing', fields: [
    { key: 'waterHeater', kind: 'seg', label: 'Water heater', options: [
      { v: 'tank', label: 'Tank' }, { v: 'tankless', label: 'Tankless' }] },
    { key: 'sewage', kind: 'seg', label: 'Sewage', options: [
      { v: 'sewer', label: 'City sewer' }, { v: 'septic', label: 'Septic' }] },
    { key: 'water', kind: 'seg', label: 'Water supply', options: [
      { v: 'city', label: 'City water' }, { v: 'well', label: 'Well' }] },
    { key: 'softener', kind: 'toggle', label: 'Water softener' },
    { key: 'sedimentFilter', kind: 'toggle', label: 'Whole-house sediment filter' },
    { key: 'showerFilter', kind: 'toggle', label: 'Shower hard-water filter' },
    { key: 'sump', kind: 'toggle', label: 'Sump pump' },
  ] },
  { title: 'Kitchen & laundry', fields: [
    { key: 'fridgeFilter', kind: 'toggle', label: 'Fridge with water filter' },
    { key: 'standFreezer', kind: 'toggle', label: 'Stand-alone freezer' },
    { key: 'dishwasher', kind: 'toggle', label: 'Dishwasher' },
    { key: 'disposal', kind: 'toggle', label: 'Garbage disposal' },
    { key: 'range', kind: 'seg', label: 'Range / stove', options: [
      { v: 'gas', label: 'Gas' }, { v: 'electric', label: 'Electric' }, { v: 'induction', label: 'Induction' }] },
    { key: 'hood', kind: 'seg', label: 'Range hood vents', options: [
      { v: 'vented', label: 'Outside' }, { v: 'recirc', label: 'Recirculates' }, { v: 'none', label: 'No hood' }] },
    { key: 'otrMicrowave', kind: 'toggle', label: 'Over-the-range microwave' },
    { key: 'washer', kind: 'seg', label: 'Washer', options: [
      { v: 'front', label: 'Front-load' }, { v: 'top', label: 'Top-load' }] },
    { key: 'dryer', kind: 'seg', label: 'Dryer', options: [
      { v: 'electric', label: 'Electric' }, { v: 'gas', label: 'Gas' }] },
  ] },
  { title: 'Outside', fields: [
    { key: 'gutters', kind: 'toggle', label: 'Gutters' },
    { key: 'porch', kind: 'toggle', label: 'Porch' },
    { key: 'patio', kind: 'toggle', label: 'Patio' },
    { key: 'deck', kind: 'seg', label: 'Deck', options: [
      { v: 'none', label: 'None' }, { v: 'wood', label: 'Wood' }, { v: 'composite', label: 'Composite' }] },
    { key: 'fence', kind: 'toggle', label: 'Fence' },
    { key: 'yard', kind: 'toggle', label: 'Lawn / yard' },
    { key: 'gardenBeds', kind: 'toggle', label: 'Garden beds / shrubs' },
    { key: 'trees', kind: 'toggle', label: 'Trees' },
    { key: 'sprinklers', kind: 'toggle', label: 'Sprinkler / irrigation system' },
    { key: 'pool', kind: 'toggle', label: 'Pool' },
    { key: 'hotTub', kind: 'toggle', label: 'Hot tub' },
    { key: 'shed', kind: 'toggle', label: 'Shed / outbuilding' },
  ] },
  { title: 'Safety', fields: [
    { key: 'radonArea', kind: 'toggle', label: 'Radon-prone area' },
    { key: 'security', kind: 'toggle', label: 'Security system' },
    { key: 'generator', kind: 'toggle', label: 'Generator' },
  ] },
];

export const VEHICLE_FIELDS = [
  { key: 'name', kind: 'text', label: 'Nickname', placeholder: 'e.g. The truck' },
  { key: 'year', kind: 'text', label: 'Year', placeholder: '2022' },
  { key: 'make', kind: 'text', label: 'Make', placeholder: 'Toyota' },
  { key: 'model', kind: 'text', label: 'Model', placeholder: 'Tacoma' },
  { key: 'fuel', kind: 'seg', label: 'Power', options: [
    { v: 'gas', label: 'Gas' }, { v: 'hybrid', label: 'Hybrid' }, { v: 'ev', label: 'EV' }] },
];

export const PET_FIELDS = [
  { key: 'name', kind: 'text', label: 'Name', placeholder: 'e.g. Biscuit' },
  { key: 'species', kind: 'seg', label: 'Species', options: [
    { v: 'dog', label: 'Dog' }, { v: 'cat', label: 'Cat' }, { v: 'other', label: 'Other' }] },
  { key: 'birthday', kind: 'date', label: 'Birthday (or best guess)' },
];

/** Suggested starter specs per kind, offered in the details editor. */
export const SPEC_SUGGESTIONS = {
  vehicle: ['VIN', 'License plate', 'Tire size', 'Wiper size (driver)', 'Wiper size (passenger)',
    'Oil type & amount', 'Oil filter #', 'Engine air filter #', 'Cabin air filter #', 'Key battery type'],
  pet: ['Microchip #', 'Breed', 'Weight', 'Vet name & phone', 'Food & amount', 'Medications & doses',
    'Groomer', 'Emergency vet'],
  house: ['Total sq ft', 'Year built', 'Builder & phone', 'Paint - walls', 'Paint - trim',
    'Filter sizes', 'Wi-Fi network', 'Water main location', 'Gas shutoff location', 'Breaker panel location'],
};

// --- self-inspection bank --------------------------------------------------

/**
 * The annual walk-through. Items are grouped by area and filtered by house
 * features. Each inspection snapshots its items, so editing this bank never
 * corrupts past records.
 */
export const INSPECTION_BANK = [
  { group: 'Outside', items: [
    { key: 'i-roof', label: 'Roof from the ground: shingles flat, flashing tight, nothing lifted' },
    { key: 'i-gutters', label: 'Gutters attached, draining, downspouts discharging away', need: (f) => f.gutters },
    { key: 'i-siding', label: 'Siding/brick: no cracks, holes, peeling, or wasp nests' },
    { key: 'i-grade', label: 'Soil slopes away from foundation; no pooling spots' },
    { key: 'i-foundation', label: 'Visible foundation: no new or widening cracks' },
    { key: 'i-windows-ext', label: 'Window/door exterior caulk intact' },
    { key: 'i-deck', label: 'Deck: ledger tight, no soft boards, rails solid', need: (f) => f.deck && f.deck !== 'none' },
    { key: 'i-garagedoor', label: 'Garage door reverses on the 2x4 test and the beam test', need: (f) => f.garage && f.garage !== '0' },
    { key: 'i-hosebibs', label: 'Hose bibs: no drips, hoses off before winter', need: (f) => f.climateFreeze },
    { key: 'i-driveway', label: 'Driveway/walks: cracks sealed, no trip edges', need: (f) => f.driveway && f.driveway !== 'none' },
  ] },
  { group: 'Under & above', items: [
    { key: 'i-crawl', label: 'Crawlspace: dry, insulation up, no pests, vapor barrier intact', need: (f) => f.foundation === 'crawl' },
    { key: 'i-basement', label: 'Basement walls: no damp, efflorescence, or new cracks', need: (f) => f.foundation === 'basement' },
    { key: 'i-attic', label: 'Attic: no daylight, no stains under roof penetrations, insulation even' },
    { key: 'i-sump', label: 'Sump pit: pump runs on a bucket of water, discharge flows away', need: (f) => f.sump },
  ] },
  { group: 'Plumbing', items: [
    { key: 'i-sinks', label: 'Under every sink: dry, no stains, no soft wood' },
    { key: 'i-toilets', label: 'Toilets: no rocking, no run-on, dye test passes' },
    { key: 'i-wh', label: 'Water heater: no rust streaks or leaks, T&P discharge clear' },
    { key: 'i-washerhose', label: 'Washer hoses: no bulges or rust at fittings' },
    { key: 'i-dw', label: 'Dishwasher: no leaks at the door or under the toe kick', need: (f) => f.dishwasher },
    { key: 'i-caulk-wet', label: 'Tub/shower caulk lines unbroken, grout sound' },
    { key: 'i-pressure', label: 'Water pressure feels normal at the farthest fixture' },
  ] },
  { group: 'Air & heat', items: [
    { key: 'i-filter', label: 'HVAC filter: fresh, right size, right direction', need: (f) => f.furnace !== 'none' || f.centralAC },
    { key: 'i-condensate', label: 'Condensate line dripping outside when AC runs', need: (f) => f.centralAC },
    { key: 'i-condenser', label: 'Outdoor unit: fins clean, 2 ft clearance, level pad', need: (f) => f.centralAC },
    { key: 'i-registers', label: 'Every room: air actually moves at the register' },
    { key: 'i-thermostat', label: 'Thermostat batteries fresh, schedule sensible' },
    { key: 'i-fireplace', label: 'Fireplace: glass intact, no soot smell, CO detector nearby', need: (f) => f.fireplace && f.fireplace !== 'none' },
  ] },
  { group: 'Electrical & safety', items: [
    { key: 'i-gfci', label: 'Every GFCI trips on TEST and resets' },
    { key: 'i-panel', label: 'Breaker panel: no scorch, rust, or warm breakers; legend legible' },
    { key: 'i-smoke', label: 'Every smoke/CO detector beeps on test; none over 10 years old' },
    { key: 'i-exting', label: 'Extinguisher gauges in the green, pins in place' },
    { key: 'i-dryervent', label: 'Dryer vent flap opens when running; no lint beard outside' },
    { key: 'i-outlets', label: 'No loose, warm, or crackling outlets and switches' },
    { key: 'i-egress', label: 'Bedroom windows all open easily from inside' },
  ] },
  { group: 'Rooms', items: [
    { key: 'i-ceilings', label: 'Ceilings: no new stains (look after hard rain especially)' },
    { key: 'i-windows-op', label: 'Windows open, close, and lock; weeps clear' },
    { key: 'i-doors', label: 'Doors latch without lifting or slamming' },
    { key: 'i-floors', label: 'No new soft spots, big squeaks, or cracked tiles' },
    { key: 'i-caulk-kitchen', label: 'Countertop and backsplash caulk intact' },
  ] },
];

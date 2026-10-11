/**
 * Paragraph bank for copy-typing tasks.
 * Requirements: >= 12 paragraphs, 60-80 words each, no digits, matched difficulty.
 */

export const PARAGRAPHS = [
  // 1
  "The quiet morning air was filled with the gentle rustle of leaves as sunlight broke through the distant clouds. Birds circled above the tall oak trees while a cool breeze swept through the valley. Walking along the winding trail felt peaceful and calm, offering a welcomed moment of stillness before the busy routine of the day began in the crowded city nearby.",
  // 2
  "Fresh mountain streams cascaded down the rocky slopes into a clear blue lake surrounded by pine forests. The sound of running water created a soothing rhythm that echoed across the open meadow. Several hikers paused near the wooden bridge to admire the scenery, taking deep breaths of crisp alpine air as the mist slowly lifted from the ground.",
  // 3
  "Deep inside the library, ancient wooden shelves held thousands of leather volumes filled with forgotten knowledge. Dust motes drifted lazily through the tall arched windows where soft afternoon light illuminated long reading tables. Readers turned delicate pages in quiet concentration, completely absorbed in stories from distant lands and centuries long past without paying attention to the passage of time.",
  // 4
  "An autumn afternoon brought golden foliage to the public park where children gathered around the stone fountain. Families strolled leisurely along the paved walkway, enjoying warm drinks while leaves drifted gently onto the grass. The subtle fragrance of damp soil and fallen timber signaled the coming winter, yet the bright sunshine provided ample warmth for everyone outdoors.",
  // 5
  "The coastal village woke slowly to the sound of ocean waves breaking against the harbor wall. Fishermen prepared their small wooden boats, untangling nylon nets and checking simple navigation equipment before heading into open waters. Seagulls soared overhead, calling across the salty breeze while early morning vendors arranged fresh produce beneath colorful market awnings along the cobblestone street.",
  // 6
  "Walking through the silent botanical greenhouse revealed hundreds of exotic plants thriving in tropical warmth. Large fern fronds brushed against glass walls while delicate orchids displayed vibrant petals of purple and white. Droplets of moisture condensed on the iron roof frames, falling softly like light rain onto the rich dark earth beneath lush green canopies of tropical trees.",
  // 7
  "Sunset painted the western horizon with streaks of crimson and amber as the cool evening approached. Shadows lengthened across the rolling farm fields where wild rabbits grazed cautiously near the wooden fence. A solitary owl took flight from the barn rafters, gliding effortlessly over the wheat fields in search of evening prey while the first bright stars appeared overhead.",
  // 8
  "The artisan bakery opened long before dawn, filling the narrow alleyway with the rich aroma of freshly baked sourdough bread. Trays of golden pastries rested on wooden cooling racks as steam rose into the warm kitchen air. Skilled hands shaped flour and water into round loaves, repeating traditional techniques perfected over decades of dedicated practice and quiet craft.",
  // 9
  "Dense fog blanketed the harbor entrance, obscuring the distant lighthouse whose rhythmic beacon cut through the damp darkness. Foghorns sounded their low warning across the calm bay while small ferry boats navigated carefully between floating channel markers. On the wooden pier, lantern light reflected off wet planks as dockworkers secured mooring lines for the incoming vessel.",
  // 10
  "Spring rain tapped steadily against the windowpane, washing away the winter grime and bringing renewed life to the garden outside. Tender green shoots emerged from dark soil while tulip blossoms opened their delicate cups to catch the falling moisture. Indoors, a warm fireplace crackled softly, casting dancing amber shadows across the comfortable living room where tea brewed slowly.",
  // 11
  "High above the river canyon, a suspension bridge swayed gently beneath the mountain winds. Below, rushing rapids carved deep channels through solid granite rock, churning white foam against dark boulders. Visitors stopped midway across the walkway to photograph the dramatic vista, marveling at the raw geological forces that shaped this breathtaking landscape over millions of peaceful seasons.",
  // 12
  "The museum hall featured grand marble columns supporting a vaulted ceiling painted with classical motifs. Sculptures of ancient philosophers stood along the perimeter, their carved stone faces frozen in contemplation. Visitors moved quietly between historical exhibits, reading informative plaques and discussing the cultural achievements of civilizations that flourished in ancient river valleys thousands of miles away.",
  // 13
  "A quiet afternoon in the workshop saw wood shavings curl from the sharp edge of a hand plane. The carpenter smoothed the surface of a walnut dining table, feeling the natural grain of the timber under experienced fingers. Every joint was fitted with precision and patience, ensuring the finished piece would endure through generations of family meals and celebration.",
  // 14
  "The desert landscape appeared barren at first glance, but close inspection revealed intricate desert life adapted to dry conditions. Succulent plants stored precious moisture while small lizards darted between shady sandstone crevices. As evening approached, the scorching heat dissipated quickly, giving way to a cool breeze beneath a brilliant canopy of twinkling desert constellations."
];

export function getWordCount(text) {
  return text.trim().split(/\s+/).length;
}

export function getRandomParagraph(excludedIndices = []) {
  const available = [];
  for (let i = 0; i < PARAGRAPHS.length; i++) {
    if (!excludedIndices.includes(i)) {
      available.push(i);
    }
  }
  if (available.length === 0) {
    // If all used, allow any
    return { index: 0, text: PARAGRAPHS[0] };
  }
  const chosenIndex = available[Math.floor(Math.random() * available.length)];
  return { index: chosenIndex, text: PARAGRAPHS[chosenIndex] };
}

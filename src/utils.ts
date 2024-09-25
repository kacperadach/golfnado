export function shuffle(array) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
}

export function hexToRgb(hex) {
  // Remove the hash symbol if present
  hex = hex.replace(/^#/, "");

  // Parse the 3-character hex color like "#f00"
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  // Parse the 6-character hex color
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return { r, g, b };
}

export function interpolate(value1, value2, numpoints) {
  const result = [];
  const step = (value2 - value1) / (numpoints - 1);

  for (let i = 0; i < numpoints; i++) {
    result.push(value1 + step * i);
  }

  return result;
}

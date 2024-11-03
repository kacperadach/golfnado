import { Course, Ground, Point2D, Slope } from "../core/course";
import { Stroke } from "../core/game";
import { hexToRgb, interpolate } from "./utils";
import { PNG } from "pngjs/browser";

const { Writable } = require("stream");

const GIFEncoder = require("gifencoder");

const PADDING_LENGTH = 15;
const MAX_FRAMES = 5;
const ZOOM_RATIO = 4;
const ELEVATION_PERCENTAGE_MULTIPLIER = 5;
const BALL_HEIGHT_DIVISOR = 7;

const GROUND_TO_RGB_MAP = {
  [Ground.UNDEFINED]: { r: 0, g: 0, b: 0 },
  [Ground.BALL]: { r: 0, g: 0, b: 0 },
  [Ground.HOLE]: { r: 98, g: 93, b: 93 }, // Dark Gray
  [Ground.GREEN]: { r: 114, g: 198, b: 30 }, // Light Green
  [Ground.FAIRWAY]: { r: 112, g: 168, b: 48 }, // Fairway Green
  [Ground.ROUGH]: { r: 112, g: 64, b: 0 }, // Brown
  [Ground.WATER]: { r: 59, g: 53, b: 205 }, // Blue
  [Ground.SAND]: { r: 205, g: 205, b: 53 }, // Yellow
  [Ground.TEE_BOX]: { r: 223, g: 223, b: 223 }, // Light Gray
  default: { r: 0, g: 0, b: 0 }, // Black for unknown terrain
};

const SAND_COLORS = [
  { r: 205, g: 205, b: 53 },
  { r: 235, g: 235, b: 85 },
  { r: 229, g: 229, b: 126 },
];

export type BallPositionAndColor = {
  position: Point2D;
  color: string;
};

export async function createSwingGifBuffer(
  course: Course,
  stroke: Stroke | null,
  ballColor: string,
  otherBalls: BallPositionAndColor[]
): Buffer {
  const width = course.width * ZOOM_RATIO;
  const height = course.height * ZOOM_RATIO;

  const encoder = new GIFEncoder(width, height);
  let bufferArray = [];

  // Custom writable stream to capture the GIF data in a buffer
  const writableStream = new Writable({
    write(chunk, encoding, callback) {
      bufferArray.push(chunk);
      callback();
    },
  });

  encoder.createReadStream().pipe(writableStream);

  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(20);
  encoder.setQuality(200);

  const cachedStart = Date.now();
  // Cache the course frame (only once)
  let cachedCourseFrame = drawCourseFrame(course, width, height);

  for (const positionAndColor of otherBalls) {
    cachedCourseFrame = drawGolfBall(
      cachedCourseFrame,
      positionAndColor.position,
      0,
      positionAndColor.color,
      width,
      height
    );
  }

  function drawCourseFrame(course, width, height) {
    const frame = Buffer.alloc(width * height * 4);
    frame.fill(0);

    function getColorBasedOnElevation(color: number, elevation: number) {
      return color * (1 + (ELEVATION_PERCENTAGE_MULTIPLIER * elevation) / 100);
    }

    const terrain = course.terrain;
    for (let y = 0; y < terrain.length; y++) {
      for (let x = 0; x < terrain[y].length; x++) {
        let { r, g, b } = GROUND_TO_RGB_MAP[terrain[y][x]];

        let elevation = course.elevation[y][x].height;
        const slope: Slope = course.elevation[y][x].slope;

        for (let offsetY = 0; offsetY < ZOOM_RATIO; offsetY++) {
          for (let offsetX = 0; offsetX < ZOOM_RATIO; offsetX++) {
            let finalR = r;
            let finalG = g;
            let finalB = b;

            const drawX = x * ZOOM_RATIO + offsetX;
            const drawY = y * ZOOM_RATIO + offsetY;
            const idx = (drawY * width + drawX) * 4;

            if (idx < frame.length) {
              if (slope === "vertical") {
                let heightAbove = elevation;
                if (y + 1 < course.height) {
                  heightAbove = course.elevation[y + 1][x].height;
                }

                let heightBelow = elevation;
                if (y - 1 >= 0) {
                  heightBelow = course.elevation[y - 1][x].height;
                }

                if (heightAbove > heightBelow) {
                  heightAbove += 10;
                  heightBelow -= 10;
                } else if (heightBelow > heightAbove) {
                  heightBelow += 10;
                  heightAbove -= 10;
                }

                const interpolatedHeights = interpolate(
                  heightBelow,
                  heightAbove,
                  ZOOM_RATIO
                );

                finalR = getColorBasedOnElevation(
                  r,
                  interpolatedHeights[offsetY]
                );
                finalG = getColorBasedOnElevation(
                  g,
                  interpolatedHeights[offsetY]
                );
                finalB = getColorBasedOnElevation(
                  b,
                  interpolatedHeights[offsetY]
                );
              } else if (slope === "horizontal") {
                let heightRight = elevation;
                if (x + 1 < course.width) {
                  heightRight = course.elevation[y][x + 1].height;
                }

                let heightLeft = elevation;
                if (x - 1 >= 0) {
                  heightLeft = course.elevation[y][x - 1].height;
                }

                if (heightRight > heightLeft) {
                  heightRight += 10;
                  heightLeft -= 10;
                } else if (heightLeft > heightRight) {
                  heightLeft += 10;
                  heightRight -= 10;
                }

                const interpolatedHeights = interpolate(
                  heightLeft,
                  heightRight,
                  ZOOM_RATIO
                );

                finalR = getColorBasedOnElevation(
                  r,
                  interpolatedHeights[offsetX]
                );
                finalG = getColorBasedOnElevation(
                  g,
                  interpolatedHeights[offsetX]
                );
                finalB = getColorBasedOnElevation(
                  b,
                  interpolatedHeights[offsetX]
                );
              } else if (slope === "flat") {
                finalR = getColorBasedOnElevation(r, elevation);
                finalG = getColorBasedOnElevation(g, elevation);
                finalB = getColorBasedOnElevation(b, elevation);
              }

              if (
                terrain[y][x] === Ground.SAND ||
                terrain[y][x] === Ground.WATER ||
                terrain[y][x] === Ground.HOLE ||
                terrain[y][x] === Ground.TEE_BOX
              ) {
                finalR = r;
                finalG = g;
                finalB = b;
              }

              if (terrain[y][x] === Ground.GREEN) {
                finalG = offsetY % 2 === 0 ? finalG * 1.1 : finalG * 0.9;
                finalG = offsetX % 2 === 0 ? finalG * 1.1 : finalG * 0.9;

                if (
                  offsetX % 2 === 0 &&
                  offsetY % 2 === 0 &&
                  slope === "flat"
                ) {
                  finalR = 255;
                  finalB = 255;
                }
              } else if (terrain[y][x] === Ground.SAND) {
                const randomIndex = Math.floor(
                  Math.random() * SAND_COLORS.length
                );

                // Get the random element from the array
                const randomElement = SAND_COLORS[randomIndex];

                finalR = randomElement.r;
                finalG = randomElement.g;
                finalB = randomElement.b;
                if (offsetX === 0) {
                  // check left
                  if (x > 0 && terrain[y][x - 1] !== Ground.SAND) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetY === 0) {
                  // check up
                  if (y > 0 && terrain[y - 1][x] !== Ground.SAND) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetX === ZOOM_RATIO - 1) {
                  // check right
                  if (
                    x < course.width - 1 &&
                    terrain[y][x + 1] !== Ground.SAND
                  ) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetY === ZOOM_RATIO - 1) {
                  // check down

                  if (
                    y < course.height - 1 &&
                    terrain[y + 1][x] !== Ground.SAND
                  ) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
              }

              // if (slope === "horizontal") {
              //   finalR = 196;
              //   finalG = 0;
              //   finalB = 255;
              // } else if (slope === "vertical") {
              //   finalR = 196;
              //   finalG = 255;
              //   finalB = 0;
              // }

              frame[idx] = Math.max(0, Math.min(255, finalR));
              frame[idx + 1] = Math.max(0, Math.min(255, finalG));
              frame[idx + 2] = Math.max(0, Math.min(255, finalB));
              frame[idx + 3] = 255; // Alpha (fully opaque)
            }
          }
        }
      }
    }

    return frame;
  }

  function drawGolfBall(frame, position, ballHeight, color, width, height) {
    const frameCopy = Buffer.from(frame); // Copy the cached course frame
    const ballCenterX = Math.round(position.x * ZOOM_RATIO);
    const ballCenterY = Math.round(position.y * ZOOM_RATIO);
    const ballRadius = Math.round(
      ZOOM_RATIO / 1.5 + ballHeight / BALL_HEIGHT_DIVISOR
    );

    const ballRGB = hexToRgb(color);

    for (let y = -ballRadius; y <= ballRadius; y++) {
      for (let x = -ballRadius; x <= ballRadius; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist <= ballRadius) {
          const drawX = ballCenterX + x;
          const drawY = ballCenterY + y;
          const idx = (drawY * width + drawX) * 4;

          if (
            drawX >= 0 &&
            drawX < width &&
            drawY >= 0 &&
            drawY < height &&
            idx < frameCopy.length
          ) {
            frameCopy[idx] = ballRGB.r;
            frameCopy[idx + 1] = ballRGB.g;
            frameCopy[idx + 2] = ballRGB.b;
            frameCopy[idx + 3] = 255;
          }
        }
      }
    }

    return frameCopy;
  }

  if (stroke) {
    stroke.swingPath.forEach((swingPoint, idx) => {
      if (swingPoint === undefined) {
        return;
      }

      let repeat = 1;
      if (idx === 0) {
        repeat = 1;
      } else if (idx === stroke.swingPath.length - 1) {
        repeat = PADDING_LENGTH * 2;
      } else {
        const minSpeed = 1;
        const maxSpeed = 200;
        const minRepeat = 1;
        const maxRepeat = MAX_FRAMES;

        repeat =
          minRepeat +
          (maxRepeat - minRepeat) *
            (1 - (swingPoint.speed - minSpeed) / (maxSpeed - minSpeed));
      }

      for (let i = 0; i < repeat; i++) {
        encoder.addFrame(
          drawGolfBall(
            cachedCourseFrame,
            swingPoint.point,
            swingPoint.height,
            ballColor,
            width,
            height
          )
        );
      }
    });
  } else {
    encoder.addFrame(cachedCourseFrame);
  }

  encoder.finish();

  await new Promise((resolve, reject) => {
    writableStream.on("finish", resolve);
    writableStream.on("error", reject);
  });

  const gifBuffer = Buffer.concat(bufferArray);

  return gifBuffer;
}

export async function createCoursePngBuffer(
  course: Course,
  ballColor: string,
  otherBalls: BallPositionAndColor[]
): Buffer {
  const width = course.width * ZOOM_RATIO;
  const height = course.height * ZOOM_RATIO;

  // Create a PNG instance
  const png = new PNG({
    width,
    height,
    filterType: -1,
  });

  // Cache the course frame (only once)
  let cachedCourseFrame = drawCourseFrame(course, width, height);

  for (const positionAndColor of otherBalls) {
    cachedCourseFrame = drawGolfBall(
      cachedCourseFrame,
      positionAndColor.position,
      0,
      positionAndColor.color,
      width,
      height
    );
  }

  // Copy the course frame to the PNG data
  cachedCourseFrame.copy(png.data);

  function drawCourseFrame(course, width, height) {
    const frame = Buffer.alloc(width * height * 4);
    frame.fill(0);

    function getColorBasedOnElevation(color: number, elevation: number) {
      return color * (1 + (ELEVATION_PERCENTAGE_MULTIPLIER * elevation) / 100);
    }

    const terrain = course.terrain;
    for (let y = 0; y < terrain.length; y++) {
      for (let x = 0; x < terrain[y].length; x++) {
        let { r, g, b } = GROUND_TO_RGB_MAP[terrain[y][x]];

        let elevation = course.elevation[y][x].height;
        const slope: Slope = course.elevation[y][x].slope;

        for (let offsetY = 0; offsetY < ZOOM_RATIO; offsetY++) {
          for (let offsetX = 0; offsetX < ZOOM_RATIO; offsetX++) {
            let finalR = r;
            let finalG = g;
            let finalB = b;

            const drawX = x * ZOOM_RATIO + offsetX;
            const drawY = y * ZOOM_RATIO + offsetY;
            const idx = (drawY * width + drawX) * 4;

            if (idx < frame.length) {
              if (slope === "vertical") {
                let heightAbove = elevation;
                if (y + 1 < course.height) {
                  heightAbove = course.elevation[y + 1][x].height;
                }

                let heightBelow = elevation;
                if (y - 1 >= 0) {
                  heightBelow = course.elevation[y - 1][x].height;
                }

                if (heightAbove > heightBelow) {
                  heightAbove += 10;
                  heightBelow -= 10;
                } else if (heightBelow > heightAbove) {
                  heightBelow += 10;
                  heightAbove -= 10;
                }

                const interpolatedHeights = interpolate(
                  heightBelow,
                  heightAbove,
                  ZOOM_RATIO
                );

                finalR = getColorBasedOnElevation(
                  r,
                  interpolatedHeights[offsetY]
                );
                finalG = getColorBasedOnElevation(
                  g,
                  interpolatedHeights[offsetY]
                );
                finalB = getColorBasedOnElevation(
                  b,
                  interpolatedHeights[offsetY]
                );
              } else if (slope === "horizontal") {
                let heightRight = elevation;
                if (x + 1 < course.width) {
                  heightRight = course.elevation[y][x + 1].height;
                }

                let heightLeft = elevation;
                if (x - 1 >= 0) {
                  heightLeft = course.elevation[y][x - 1].height;
                }

                if (heightRight > heightLeft) {
                  heightRight += 10;
                  heightLeft -= 10;
                } else if (heightLeft > heightRight) {
                  heightLeft += 10;
                  heightRight -= 10;
                }

                const interpolatedHeights = interpolate(
                  heightLeft,
                  heightRight,
                  ZOOM_RATIO
                );

                finalR = getColorBasedOnElevation(
                  r,
                  interpolatedHeights[offsetX]
                );
                finalG = getColorBasedOnElevation(
                  g,
                  interpolatedHeights[offsetX]
                );
                finalB = getColorBasedOnElevation(
                  b,
                  interpolatedHeights[offsetX]
                );
              } else if (slope === "flat") {
                finalR = getColorBasedOnElevation(r, elevation);
                finalG = getColorBasedOnElevation(g, elevation);
                finalB = getColorBasedOnElevation(b, elevation);
              }

              if (
                terrain[y][x] === Ground.SAND ||
                terrain[y][x] === Ground.WATER ||
                terrain[y][x] === Ground.HOLE ||
                terrain[y][x] === Ground.TEE_BOX
              ) {
                finalR = r;
                finalG = g;
                finalB = b;
              }

              if (terrain[y][x] === Ground.GREEN) {
                finalG = offsetY % 2 === 0 ? finalG * 1.1 : finalG * 0.9;
                finalG = offsetX % 2 === 0 ? finalG * 1.1 : finalG * 0.9;

                if (
                  offsetX % 2 === 0 &&
                  offsetY % 2 === 0 &&
                  slope === "flat"
                ) {
                  finalR = 255;
                  finalB = 255;
                }
              } else if (terrain[y][x] === Ground.SAND) {
                const randomIndex = Math.floor(
                  Math.random() * SAND_COLORS.length
                );

                // Get the random element from the array
                const randomElement = SAND_COLORS[randomIndex];

                finalR = randomElement.r;
                finalG = randomElement.g;
                finalB = randomElement.b;
                if (offsetX === 0) {
                  // check left
                  if (x > 0 && terrain[y][x - 1] !== Ground.SAND) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetY === 0) {
                  // check up
                  if (y > 0 && terrain[y - 1][x] !== Ground.SAND) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetX === ZOOM_RATIO - 1) {
                  // check right
                  if (
                    x < course.width - 1 &&
                    terrain[y][x + 1] !== Ground.SAND
                  ) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
                if (offsetY === ZOOM_RATIO - 1) {
                  // check down

                  if (
                    y < course.height - 1 &&
                    terrain[y + 1][x] !== Ground.SAND
                  ) {
                    finalR = 0;
                    finalG = 0;
                    finalB = 0;
                  }
                }
              }

              // if (slope === "horizontal") {
              //   finalR = 196;
              //   finalG = 0;
              //   finalB = 255;
              // } else if (slope === "vertical") {
              //   finalR = 196;
              //   finalG = 255;
              //   finalB = 0;
              // }

              frame[idx] = Math.max(0, Math.min(255, finalR));
              frame[idx + 1] = Math.max(0, Math.min(255, finalG));
              frame[idx + 2] = Math.max(0, Math.min(255, finalB));
              frame[idx + 3] = 255; // Alpha (fully opaque)
            }
          }
        }
      }
    }

    return frame;
  }

  function drawGolfBall(frame, position, ballHeight, color, width, height) {
    const frameCopy = Buffer.from(frame); // Copy the cached course frame
    const ballCenterX = Math.round(position.x * ZOOM_RATIO);
    const ballCenterY = Math.round(position.y * ZOOM_RATIO);
    const ballRadius = Math.round(
      ZOOM_RATIO / 1.5 + ballHeight / BALL_HEIGHT_DIVISOR
    );

    const ballRGB = hexToRgb(color);

    for (let y = -ballRadius; y <= ballRadius; y++) {
      for (let x = -ballRadius; x <= ballRadius; x++) {
        const dist = Math.sqrt(x * x + y * y);
        if (dist <= ballRadius) {
          const drawX = ballCenterX + x;
          const drawY = ballCenterY + y;
          const idx = (drawY * width + drawX) * 4;

          if (
            drawX >= 0 &&
            drawX < width &&
            drawY >= 0 &&
            drawY < height &&
            idx < frameCopy.length
          ) {
            frameCopy[idx] = ballRGB.r;
            frameCopy[idx + 1] = ballRGB.g;
            frameCopy[idx + 2] = ballRGB.b;
            frameCopy[idx + 3] = 255;
          }
        }
      }
    }

    return frameCopy;
  }

  // Convert the PNG to a buffer
  const pngBuffer = await new Promise<Buffer>((resolve, reject) => {
    const bufferArray = [];
    const writableStream = new Writable({
      write(chunk, encoding, callback) {
        bufferArray.push(chunk);
        callback();
      },
    });

    png.pack().pipe(writableStream);

    writableStream.on("finish", () => resolve(Buffer.concat(bufferArray)));
    writableStream.on("error", reject);
  });

  return pngBuffer;
}

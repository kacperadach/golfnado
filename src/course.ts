import { shuffle } from "./utils";

const COURSE_HEIGHT = 100;
const COURSE_WIDTH = 80;

const MIN_COURSE_HEIGHT = 100;
const MAX_COURSE_HEIGHT = 120;

const MIN_COURSE_WIDTH = 80;
const MAX_COURSE_WIDTH = 120;

const HEIGHT_BOUND_DIVISOR = 10;
const WIDTH_BOUND_DIVISOR = 10;
const HEIGHT_LOWER_BOUND_DIVISOR = 8;
const HEIGHT_UPPER_BOUND_DIVISOR = 6;

const PATH_X_MAGNITUDE_MAX = 8;

const HOLE_SIZE = 2;
const HOLE_GREEN_RADIUS_MIN = 8;
const HOLE_GREEN_RADIUS_MAX = 12;

const ROUGH_WIDTH_MIN = 30;
const ROUGH_WIDTH_MAX = 36;
const ROUGH_START_HEIGHT = 20; // idk what this does
const ROUGH_END_HEIGHT = 20;

const TEE_BOX_RADIUS = 3;

const FAIRWAY_ANCHORS = 8;
const FAIRWAY_WIDTH_MIN = 7;
const FAIRWAY_WIDTH_MAX = 12;

const MIN_FAIRWAYS = 3;
const MAX_FAIRWAYS = 3;

const MIN_WATER = 1;
const MAX_WATER = 6;
const MIN_WATER_RADIUS = 3;
const MAX_WATER_RADIUS = 8;

const MIN_SAND = 3;
const MAX_SAND = 8;
const MIN_SAND_RADIUS = 2;
const MAX_SAND_RADIUS = 6;

const ISLAND_PERCENTAGE = 30;
const ISLAND_WATER_RADIUS_MAX = 26;
const ISLAND_WATER_RADIUS_MIN = 10;

const MAX_ELEVATION = 15;
const MIN_ELEVATION_POINTS = 5;
const MAX_ELEVATION_POINTS = 10;
const MIN_ELEVATION_POINT_DISTANCE = 8;
const SLOPE_DIFF = 0.5;

export const MAX_WIND = 0.8;

export enum Ground {
  UNDEFINED,
  HOLE,
  GREEN,
  FAIRWAY,
  ROUGH,
  SAND,
  WATER,
  BALL,
  TEE_BOX,
}

export class Point2D {
  public x: number;
  public y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  toString() {
    return `x=${this.x} y=${this.y}`;
  }

  equals(other: any) {
    if (!(other instanceof Point2D)) {
      return false;
    }
    return this.x === other.x && this.y === other.y;
  }

  public toJSON() {
    return {
      x: this.x,
      y: this.y,
    };
  }

  public static fromJSON(json: any) {
    const { x, y } = json;
    return new Point2D(x, y);
  }

  public static distance(start: Point2D, end: Point2D) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  public static pointsBetween(start: Point2D, end: Point2D): Point2D[] {
    const points: Point2D[] = [];

    let x1 = start.x;
    let y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;

    let err = dx - dy;

    while (true) {
      points.push(new Point2D(x1, y1)); // Add the current point to the list

      if (x1 === x2 && y1 === y2) break; // If we've reached the end point, stop

      const e2 = 2 * err;

      if (e2 > -dy) {
        err -= dy;
        x1 += sx;
      }

      if (e2 < dx) {
        err += dx;
        y1 += sy;
      }
    }

    if (points.length < 8) {
      const extraPointsNeeded = 8 - points.length;
      const totalPoints = points.length + extraPointsNeeded;

      // Interpolate points and insert them evenly
      const newPoints: Point2D[] = [];
      for (let i = 0; i < totalPoints; i++) {
        const t = i / (totalPoints - 1);
        const interpolatedX = start.x + t * (end.x - start.x);
        const interpolatedY = start.y + t * (end.y - start.y);
        newPoints.push(
          new Point2D(Math.round(interpolatedX), Math.round(interpolatedY))
        );
      }

      return newPoints;
    }

    return points;
  }

  public static calculateHeights(
    points: Point2D[],
    maxHeight: number
  ): number[] {
    const heights: number[] = [];
    const midpoint = Math.floor(points.length / 2); // Find the middle point index

    // Calculate height for each point
    for (let i = 0; i < points.length; i++) {
      const distanceFromMid = Math.abs(i - midpoint); // Distance from midpoint
      const maxDistance = Math.max(midpoint, points.length - 1 - midpoint);

      // Calculate height as a parabolic function (maxHeight at the midpoint, 0 at the ends)
      const height = maxHeight * (1 - (distanceFromMid / maxDistance) ** 2);
      heights.push(height);
    }

    return heights;
  }
}

class Vector2D {
  public x: number;
  public y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public normalise(): void {
    const length: number = Math.sqrt(this.x * this.x + this.y * this.y);
    if (length > 0) {
      this.x /= length;
      this.y /= length;
    }
  }
}

export type Slope = "flat" | "horizontal" | "vertical";

export type Elevation = {
  height: number;
  slope: Slope;
};

export type Wind = {
  velocity: number;
  direction: number;
};

export class Course {
  public height: number = COURSE_HEIGHT;
  public width: number = COURSE_WIDTH;
  public terrain: Ground[][] = [];
  public elevation: Elevation[][] = [];
  public teeBoxPoint: Point2D;
  public holePoint: Point2D;
  public wind: Wind;

  constructor(
    height: number = COURSE_HEIGHT,
    width: number = COURSE_WIDTH,
    terrain: Ground[][] = [],
    elevation: Elevation[][] = [],
    teeBoxPoint: Point2D = new Point2D(0, 0),
    holePoint: Point2D = new Point2D(0, 0),
    wind: Wind = { velocity: 0, direction: 0 }
  ) {
    this.height = height;
    this.width = width;
    this.terrain = terrain;
    this.elevation = elevation;
    this.teeBoxPoint = teeBoxPoint;
    this.holePoint = holePoint;
    this.wind = wind;
  }

  public isPointInSand(point: Point2D) {
    try {
      return this.terrain[point.y][point.x] === Ground.SAND;
    } catch (error) {
      return false;
    }
  }

  public isPointInWater(point: Point2D) {
    try {
      return this.terrain[point.y][point.x] === Ground.WATER;
    } catch (error) {
      return false;
    }
  }

  public isPointInHole(point: Point2D) {
    try {
      return this.terrain[point.y][point.x] === Ground.HOLE;
    } catch (error) {
      return false;
    }
  }

  public toJSON() {
    return {
      height: this.height,
      width: this.width,
      terrain: this.terrain,
      elevation: this.elevation,
      teeBoxPoint: this.teeBoxPoint.toJSON(),
      holePoint: this.holePoint.toJSON(),
      wind: this.wind,
    };
  }

  public static fromJSON(json: any) {
    const { height, width, terrain, elevation, teeBoxPoint, holePoint, wind } =
      json;
    return new Course(
      height,
      width,
      terrain,
      elevation,
      Point2D.fromJSON(teeBoxPoint),
      Point2D.fromJSON(holePoint),
      wind
    );
  }

  public initializeFairways(): Point2D[][] {
    const basePath: Point2D[] = this.generateBasePath();
    const anchors = this.getAnchors(basePath, FAIRWAY_ANCHORS);

    const rough: Spline = this.generateRough(basePath, anchors);
    const fairway: Spline = this.generateFairway(basePath, anchors);

    this.fill(rough, Ground.ROUGH);

    const paths = [basePath];
    const fairwaySplines = [];

    const numFairways = this.getRandomInt(MIN_FAIRWAYS, MAX_FAIRWAYS);

    for (let i = 0; i < numFairways - 1; i++) {
      const secondPath: Point2D[] = this.generateBasePath();
      secondPath[0] = basePath[0];
      secondPath[secondPath.length - 1] = basePath[basePath.length - 1];

      const secondAnchors = this.getAnchors(secondPath, FAIRWAY_ANCHORS);

      const secondRough: Spline = this.generateRough(secondPath, secondAnchors);
      const secondFairway: Spline = this.generateFairway(
        secondPath,
        secondAnchors
      );

      this.fill(secondRough, Ground.ROUGH);

      fairwaySplines.push(secondFairway);
      paths.push(secondPath);
    }

    fairwaySplines.forEach((spline) => this.fill(spline, Ground.FAIRWAY));
    this.fill(fairway, Ground.FAIRWAY);

    return paths;
  }

  public initializeTerrainOnPath(
    path: Point2D[],
    ground: Ground,
    min: number,
    max: number,
    minRadius: number,
    maxRadius: number
  ): void {
    const numWater = this.getRandomInt(min, max);

    for (let x = 0; x < numWater; x++) {
      const randomPoint = path[this.getRandomInt(0, path.length - 1)];
      randomPoint.x += this.getRandomInt(
        -1 * FAIRWAY_WIDTH_MAX * 1.5,
        FAIRWAY_WIDTH_MAX * 1.5
      );

      randomPoint.y += this.getRandomInt(-1 * 5, 5);

      this.generateTerrain(
        randomPoint,
        this.getRandomInt(minRadius, maxRadius),
        this.getRandomInt(minRadius, maxRadius),
        ground
      );
    }
  }

  public initializeElevation(): void {
    for (let i: number = 0; i < this.height; i++) {
      this.elevation[i] = [];
      for (let j: number = 0; j < this.width; j++) {
        this.elevation[i][j] = { slope: "flat", height: -1 };
      }
    }

    const numElevationPoints = this.getRandomInt(
      MIN_ELEVATION_POINTS,
      MAX_ELEVATION_POINTS
    );

    const elevationPoints = [];

    // prevent infinite loop
    let attempts = 0;
    while (elevationPoints.length < numElevationPoints && attempts < 100) {
      attempts += 1;
      const randomPoint = new Point2D(
        this.getRandomInt(0, this.width - 1),
        this.getRandomInt(0, this.height - 1)
      );

      if (
        elevationPoints.find(
          (p) => Point2D.distance(randomPoint, p) < MIN_ELEVATION_POINT_DISTANCE
        )
      ) {
        continue;
      }

      elevationPoints.push({
        point: randomPoint,
        height: this.getRandomInt(0, MAX_ELEVATION),
      });
    }

    for (let i: number = 0; i < this.height; i++) {
      for (let j: number = 0; j < this.width; j++) {
        const point = new Point2D(j, i);
        const closestElevation = elevationPoints.reduce(
          (closestPoint, elevationPoint) =>
            Point2D.distance(elevationPoint.point, point) <
            Point2D.distance(closestPoint.point, point)
              ? elevationPoint
              : closestPoint,
          elevationPoints[0]
        );

        this.elevation[i][j] = {
          slope: "flat",
          height: closestElevation.height,
        };
      }
    }

    const slopeOrder: Slope[] = ["horizontal", "vertical"];
    shuffle(slopeOrder);

    attempts = 0;
    let changed = true;
    while (changed && attempts < 1000) {
      attempts += 1;
      changed = false;

      for (let slope of slopeOrder) {
        if (slope === "vertical") {
          for (let i: number = 0; i < this.height; i++) {
            for (let j: number = 0; j < this.width; j++) {
              const pointHeight = this.elevation[i][j].height;

              if (i + 1 >= this.height) {
                continue;
              }

              const pointUp = this.elevation[i + 1][j];
              if (
                pointUp.slope !== "flat" ||
                Math.abs(pointHeight - pointUp.height) <= SLOPE_DIFF
              ) {
                continue;
              }

              this.elevation[i + 1][j] = {
                slope: "vertical",
                height:
                  pointUp.height > pointHeight
                    ? pointHeight + SLOPE_DIFF
                    : pointHeight - SLOPE_DIFF,
              };
              changed = true;
            }
          }
        } else if (slope === "horizontal") {
          for (let j: number = 0; j < this.width; j++) {
            for (let i: number = 0; i < this.height; i++) {
              const pointHeight = this.elevation[i][j].height;
              if (j + 1 >= this.width) {
                continue;
              }
              const pointRight = this.elevation[i][j + 1];
              if (
                pointRight.slope !== "flat" ||
                Math.abs(pointHeight - pointRight.height) <= SLOPE_DIFF
              ) {
                continue;
              }
              this.elevation[i][j + 1] = {
                slope: "horizontal",
                height:
                  pointRight.height > pointHeight
                    ? pointHeight + SLOPE_DIFF
                    : pointHeight - SLOPE_DIFF,
              };
              changed = true;
            }
          }
        }
      }
    }
  }

  public initializeWind(): void {
    this.wind = {
      // velocity: this.getRandomInt(0, MAX_WIND * 100) / 100,
      velocity: this.getRandomInt(0, MAX_WIND * 100) / 100,
      direction: this.getRandomInt(-179, 180),
    };
  }

  public addIsland(paths: Point2D[][]): void {
    const selectedPath = paths[this.getRandomInt(0, paths.length - 1)];

    if (this.getRandomInt(0, 100) <= ISLAND_PERCENTAGE) {
      const pathPoint = this.getRandomInt(
        0,
        Math.ceil(selectedPath.length / 2)
      );

      const waterRadius = this.getRandomInt(
        ISLAND_WATER_RADIUS_MIN,
        ISLAND_WATER_RADIUS_MAX
      );

      const sandRadius = waterRadius * (this.getRandomInt(50, 75) / 100);
      const fairwayRadius = sandRadius * (this.getRandomInt(70, 90) / 100);

      this.generateTerrain(
        selectedPath[pathPoint],
        waterRadius,
        waterRadius,
        Ground.WATER
      );
      this.generateTerrain(
        selectedPath[pathPoint],
        Math.round(sandRadius),
        Math.round(sandRadius),
        Ground.SAND
      );
      this.generateTerrain(
        selectedPath[pathPoint],
        Math.round(fairwayRadius),
        Math.round(fairwayRadius),
        Ground.FAIRWAY
      );
    }
  }

  public initializeCourse(): void {
    this.height = this.getRandomInt(MIN_COURSE_HEIGHT, MAX_COURSE_HEIGHT);
    this.width = this.getRandomInt(MIN_COURSE_WIDTH, MAX_COURSE_WIDTH);

    this.initializeArray();
    this.initializeElevation();
    this.initializeWind();

    const paths = this.initializeFairways();
    const basePath = paths[0];

    paths.forEach((path) =>
      this.initializeTerrainOnPath(
        path,
        Ground.WATER,
        MIN_WATER,
        MAX_WATER,
        MIN_WATER_RADIUS,
        MAX_WATER_RADIUS
      )
    );
    paths.forEach((path) =>
      this.initializeTerrainOnPath(
        path,
        Ground.SAND,
        MIN_SAND,
        MAX_SAND,
        MIN_SAND_RADIUS,
        MAX_SAND_RADIUS
      )
    );

    this.addIsland(paths);

    this.generateTerrain(
      basePath[basePath.length - 1],
      TEE_BOX_RADIUS,
      TEE_BOX_RADIUS,
      Ground.TEE_BOX
    );

    this.teeBoxPoint = basePath[basePath.length - 1];
    // this.terrain[basePath[basePath.length - 1].y][
    //   basePath[basePath.length - 1].x
    // ] = Ground.BALL;

    const greenRadius = this.getRandomInt(
      HOLE_GREEN_RADIUS_MIN,
      HOLE_GREEN_RADIUS_MAX
    );

    const path = paths[this.getRandomInt(0, paths.length - 1)];
    let holePosition = path[this.getRandomInt(0, 2)];

    holePosition = new Point2D(
      Math.min(Math.max(holePosition.x, greenRadius), this.width - greenRadius),
      holePosition.y
    );

    this.generateGreen(
      holePosition,
      this.getRandomInt(HOLE_GREEN_RADIUS_MIN, HOLE_GREEN_RADIUS_MAX)
    );

    const halfHoleSize = Math.floor(HOLE_SIZE / 2);

    for (let x = 0; x < HOLE_SIZE; x++) {
      for (let y = 0; y < HOLE_SIZE; y++) {
        this.terrain[holePosition.y + y - halfHoleSize][
          holePosition.x + x - halfHoleSize
        ] = Ground.HOLE;
      }
    }

    this.holePoint = holePosition;

    // this.terrain[basePath[0].y][basePath[0].x] = Ground.HOLE;
    // this.terrain[basePath[0].y - 1][basePath[0].x] = Ground.FLAG_BASE;
    // this.terrain[basePath[0].y - 2][basePath[0].x] = Ground.FLAG_BASE;
    // this.terrain[basePath[0].y - 2][basePath[0].x + 1] = Ground.FLAG;
  }

  private initializeArray(): void {
    for (let i: number = 0; i < this.height; i++) {
      this.terrain[i] = [];
      for (let j: number = 0; j < this.width; j++) {
        this.terrain[i][j] = Ground.UNDEFINED;
      }
    }
  }

  private generateBasePath(): Point2D[] {
    const hBound: number = this.height / HEIGHT_BOUND_DIVISOR;
    const wBound: number = this.width / WIDTH_BOUND_DIVISOR;
    const upperBound: number = this.getRandomInt(
      this.height / HEIGHT_UPPER_BOUND_DIVISOR,
      hBound
    );
    const lowerBound: number = this.getRandomInt(
      this.height / HEIGHT_LOWER_BOUND_DIVISOR,
      hBound
    );

    const path: Point2D[] = [];
    path.push(
      new Point2D(this.getRandomInt(wBound, this.width - wBound), upperBound)
    );
    let lastMove: Point2D | undefined = undefined;

    const pathXMagnitude = this.getRandomInt(0, PATH_X_MAGNITUDE_MAX);

    while (path[path.length - 1].y < this.height - lowerBound) {
      const moves: Point2D[] = [
        new Point2D(-1 * pathXMagnitude, 2),
        new Point2D(0, 1),
        new Point2D(pathXMagnitude, 2),
      ];
      let move: Point2D | undefined = undefined;

      if (path[path.length - 1].x < wBound)
        moves[0] = new Point2D(pathXMagnitude, 1);

      if (path[path.length - 1].x > this.width - wBound)
        moves[2] = new Point2D(-1 * pathXMagnitude, 1);

      if (lastMove == undefined || lastMove.x == 0) {
        move = moves[this.getRandomInt(0, 3)];
      } else if (lastMove.x < 0) {
        move = moves[this.getRandomInt(0, 2)];
      } else {
        move = moves[this.getRandomInt(1, 3)];
      }

      path.push(
        new Point2D(
          path[path.length - 1].x + move.x,
          path[path.length - 1].y + move.y
        )
      );
      lastMove = move;
    }

    return path;
  }

  private getAnchors(path: Point2D[], count: number): Point2D[] {
    const interval: number = Math.floor(path.length / count - 1);
    const anchors: Point2D[] = [];

    for (let t = 0; t < (count - 1) * interval + 1; t += interval) {
      anchors.push(path[t]);
    }

    anchors.push(path[path.length - 1]);

    return anchors;
  }

  private generateRough(path: Point2D[], anchors: Point2D[]): Spline {
    const rough: Spline = new Spline();
    let i = 0;
    anchors.forEach((anchor, j) => {
      const widthMin: number = this.getRandomInt(
        ROUGH_WIDTH_MIN,
        ROUGH_WIDTH_MAX
      );
      if (j == 0)
        rough.points.push(new Point2D(anchor.x, anchor.y - ROUGH_START_HEIGHT));

      let leftmost: Point2D = new Point2D(anchor.x - widthMin, anchor.y);
      let rightmost: Point2D = new Point2D(anchor.x + widthMin, anchor.y);

      while (!(path[i].x == anchor.x && path[i].y == anchor.y)) {
        if (path[i].x < leftmost.x) leftmost.x = path[i].x;

        if (path[i].x > rightmost.x) rightmost.x = path[i].x;

        i++;
      }

      rough.points.unshift(leftmost);
      rough.points.push(rightmost);

      if (j == anchors.length - 1)
        rough.points.push(new Point2D(anchor.x, anchor.y + ROUGH_END_HEIGHT));
    });

    return rough;
  }

  private generateFairway(path: Point2D[], anchors: Point2D[]): Spline {
    const widthMin: number = FAIRWAY_WIDTH_MIN;
    const widthMax: number = FAIRWAY_WIDTH_MAX;
    const fairway: Spline = new Spline();

    for (let i = 0; i < anchors.length; i++) {
      const widthLeft: number = this.getRandomInt(widthMin, widthMax);
      const widthRight: number = this.getRandomInt(widthMin, widthMax);
      let next: number = i + 1;
      let prev: number = i - 1;

      if (i == 0) prev = i;

      if (i == anchors.length - 1) next = i;

      const vect1: Vector2D = new Vector2D(
        anchors[next].x - anchors[i].x,
        anchors[next].y - anchors[i].y
      );
      const vect2: Vector2D = new Vector2D(
        anchors[i].x - anchors[prev].x,
        anchors[i].y - anchors[prev].y
      );
      vect1.normalise();
      vect2.normalise();

      const bisect: Vector2D = new Vector2D(
        -1 * (vect1.y + vect2.y),
        vect1.x + vect2.x
      );
      bisect.normalise();

      fairway.points.unshift(
        new Point2D(
          Math.floor(anchors[i].x - bisect.x * widthLeft),
          Math.floor(anchors[i].y - bisect.y * widthLeft)
        )
      );
      fairway.points.push(
        new Point2D(
          Math.floor(anchors[i].x + bisect.x * widthRight),
          Math.floor(anchors[i].y + bisect.y * widthRight)
        )
      );
    }

    return fairway;
  }

  private generateGreen(origin: Point2D, radius: number): void {
    for (let y: number = -radius; y <= radius; y++) {
      for (let x: number = -radius; x <= radius; x++) {
        const terrainX = origin.x + x;
        const terrainY = origin.y + y;
        if (
          terrainX < 0 ||
          terrainY < 0 ||
          terrainX >= this.width ||
          terrainY >= this.height
        ) {
          continue;
        }

        if (x * x + y * y < radius * radius) {
          if (x * x + y * y < (radius - 2) * (radius - 2)) {
            this.terrain[terrainY][terrainX] = Ground.GREEN;
          } else {
            this.terrain[terrainY][terrainX] = Ground.FAIRWAY;
          }
        }
      }
    }
  }

  private generateTerrain(
    origin: Point2D,
    xRadius: number,
    yRadius: number,
    ground: Ground
  ): void {
    for (let y: number = -yRadius; y <= yRadius; y++)
      for (let x: number = -xRadius; x <= xRadius; x++)
        if (x * x + y * y < xRadius * yRadius) {
          const terrainX = origin.x + x;
          const terrainY = origin.y + y;
          if (
            terrainX >= 0 &&
            terrainX < this.width &&
            terrainY >= 0 &&
            terrainY < this.height
          ) {
            this.terrain[terrainY][terrainX] = ground;
          }
        }
  }

  private fill(spline: Spline, ground: Ground): void {
    const outline: Point2D[] = [];
    for (let t = 0; t < spline.points.length; t += 0.005) {
      const pos: Point2D = spline.getSplinePoint(t, true);
      if (
        pos.x >= 0 &&
        pos.x < this.width &&
        pos.y >= 0 &&
        pos.y < this.height
      ) {
        this.terrain[pos.y][pos.x] = ground;
      }
      outline.push(pos);
    }

    for (let i = 0; i < this.height; i++) {
      const line: Point2D[] = outline.filter((point) => point.y == i);
      if (line.length == 0) continue;

      const leftmost: Point2D = line.reduce((prev, curr) =>
        prev.x < curr.x ? prev : curr
      );
      const rightmost: Point2D = line.reduce((prev, curr) =>
        prev.x > curr.x ? prev : curr
      );

      for (let j: number = leftmost.x; j <= rightmost.x; j++) {
        if (j >= 0 && j < this.width) {
          this.terrain[i][j] = ground;
        }
      }
    }
  }

  private getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
  }
}

// OneLoneCoder @ Github [https://github.com/OneLoneCoder/videos/blob/master/OneLoneCoder_Splines1.cpp]
class Spline {
  public points: Point2D[] = [];

  public getSplinePoint(t: number, bLooped: boolean): Point2D {
    let p0: number, p1: number, p2: number, p3: number;

    if (!bLooped) {
      p1 = Math.floor(t) + 1;
      p2 = p1 + 1;
      p3 = p2 + 1;
      p0 = p1 - 1;
    } else {
      p1 = Math.floor(t);
      p2 = (p1 + 1) % this.points.length;
      p3 = (p2 + 1) % this.points.length;
      p0 = p1 >= 1 ? p1 - 1 : this.points.length - 1;
    }

    t = t - Math.floor(t);

    const tt: number = t * t;
    const ttt: number = tt * t;

    const q1: number = -ttt + 2.0 * tt - t;
    const q2: number = 3.0 * ttt - 5.0 * tt + 2.0;
    const q3: number = -3.0 * ttt + 4.0 * tt + t;
    const q4: number = ttt - tt;

    const tx: number =
      0.5 *
      (this.points[p0].x * q1 +
        this.points[p1].x * q2 +
        this.points[p2].x * q3 +
        this.points[p3].x * q4);
    const ty: number =
      0.5 *
      (this.points[p0].y * q1 +
        this.points[p1].y * q2 +
        this.points[p2].y * q3 +
        this.points[p3].y * q4);

    return new Point2D(Math.floor(tx), Math.floor(ty));
  }
}

export function draw(terrain: Ground[][]) {
  let course = "";
  for (let y = 0; y < terrain.length; y++) {
    let row = "";
    for (let x = 0; x < terrain[y].length; x++) {
      switch (terrain[y][x]) {
        case Ground.BALL:
          row += "⚽";
          break;
        case Ground.HOLE:
          row += "⛳"; // Represent the hole with 'O'
          break;
        case Ground.GREEN:
          row += "🟩"; // Represent the green with 'G'
          break;
        case Ground.FAIRWAY:
          row += "🟢"; // Represent the fairway with 'F'
          break;
        case Ground.ROUGH:
          row += "🟫"; // Represent the rough with 'R'
          break;
        // case Ground.FOREST:
        //   row += "T"; // Represent the forest with 'T'
        //   break;
        // case Ground.FLAG_BASE:
        //   //   row += "|"; // Represent the flag base with '|'
        //   row += "🟩";
        //   break;
        // case Ground.FLAG:
        //   //   row += "^"; // Represent the flag with '^'
        //   row += "🟩";
        //   break;
        case Ground.WATER:
          // row += "\U0001F600";
          row += "🌊";
          break;
        case Ground.SAND:
          row += "🟨";
          break;
        case Ground.TEE_BOX:
          row += "⬜";
          break;
        default:
          row += "⬛";
          break;
      }
    }
    console.log(row); // Print each row to the command line
    course += row + "\n";
  }
  return course;
}

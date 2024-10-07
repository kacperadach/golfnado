import { Course, Point2D, Ground, Elevation } from "./course";

const MAX_STROKES = 10;
const MAX_INACCURACY_DEGREES = 15;
const NUM_HOLES = 9;

const GRAVITY = 2;
const AIR_RESISTANCE_DRAG_RATIO = 0.05;
const MIN_VELOCITY = 0.1;
const BOUNCE_THRESHOLD = 4;
const VELOCITY_POSITION_DELTA_DIVISOR = 10;
const SLOPE_VELOCITY = 0.6;
const SLOPE_THRESHOLD = 1;
const WIND_HEIGHT_THRESHOLD = 3;

const BALL_COLORS = {
  white: "#FFFFFF",
  red: "#FF0000",
  orange: "#FFAB00",
  purple: "#FF00EF",
  teal: "#00FFE6",
  yellow: "#F7FF00",
  blue: "#00A2FF",
};

export enum GameState {
  NOT_STARTED,
  STARTED,
  GAME_OVER,
}

export enum Club {
  DRIVER,
  IRON,
  WEDGE,
  PUTTER,
}

const CLUB_BOUNCE_VELOCITY_DIVISOR = {
  [Club.DRIVER]: 15,
  [Club.IRON]: 12,
  [Club.WEDGE]: 5,
  [Club.PUTTER]: 1, // irrelevant
};

const CLUB_ACCURACY_RATIO = {
  [Club.DRIVER]: 0.7,
  [Club.IRON]: 0.9,
  [Club.WEDGE]: 0.95,
  [Club.PUTTER]: 1,
};

const GROUND_ACCURACY_RATIO = {
  [Ground.TEE_BOX]: 1,
  [Ground.GREEN]: 1,
  [Ground.FAIRWAY]: 1,
  [Ground.SAND]: 0.95,
  [Ground.ROUGH]: 0.85,

  // irrelevant
  [Ground.BALL]: 1,
  [Ground.UNDEFINED]: 1,
  [Ground.HOLE]: 1,
  [Ground.WATER]: 1,
};

const CLUB_TERRAIN_POWER_RATIO = {
  [Club.DRIVER]: {
    [Ground.TEE_BOX]: 0.4,
    [Ground.GREEN]: 0.3,
    [Ground.FAIRWAY]: 0.3,
    [Ground.ROUGH]: 0.1,
    [Ground.SAND]: 0.01,
    // irrelevant
    [Ground.UNDEFINED]: 1,
    [Ground.HOLE]: 1,
    [Ground.WATER]: 1,
    [Ground.BALL]: 1,
  },
  [Club.IRON]: {
    [Ground.TEE_BOX]: 0.325,
    [Ground.GREEN]: 0.275,
    [Ground.FAIRWAY]: 0.275,
    [Ground.ROUGH]: 0.13,
    [Ground.SAND]: 0.08,
    // irrelevant
    [Ground.UNDEFINED]: 1,
    [Ground.HOLE]: 1,
    [Ground.WATER]: 1,
    [Ground.BALL]: 1,
  },
  [Club.WEDGE]: {
    [Ground.TEE_BOX]: 0.18,
    [Ground.GREEN]: 0.18,
    [Ground.FAIRWAY]: 0.18,
    [Ground.ROUGH]: 0.16,
    [Ground.SAND]: 0.15,
    // irrelevant
    [Ground.UNDEFINED]: 1,
    [Ground.HOLE]: 1,
    [Ground.WATER]: 1,
    [Ground.BALL]: 1,
  },
  [Club.PUTTER]: {
    [Ground.TEE_BOX]: 0.08,
    [Ground.GREEN]: 0.08,
    [Ground.FAIRWAY]: 0.08,
    [Ground.ROUGH]: 0.02,
    [Ground.SAND]: 0.01,

    // irrelevant
    [Ground.UNDEFINED]: 1,
    [Ground.HOLE]: 1,
    [Ground.WATER]: 1,
    [Ground.BALL]: 1,
  },
};

// const CLUB_TERRAIN_POWER_RATIO = {
//   [Club.DRIVER]: {
//     [Ground.TEE_BOX]: 0.4,
//     [Ground.GREEN]: 0.25,
//     [Ground.FAIRWAY]: 0.25,
//     [Ground.ROUGH]: 0.1,
//     [Ground.SAND]: 0.01,
//     // irrelevant
//     [Ground.UNDEFINED]: 1,
//     [Ground.HOLE]: 1,
//     [Ground.WATER]: 1,
//     [Ground.BALL]: 1,
//   },
//   [Club.IRON]: {
//     [Ground.TEE_BOX]: 0.3,
//     [Ground.GREEN]: 0.25,
//     [Ground.FAIRWAY]: 0.25,
//     [Ground.ROUGH]: 0.1,
//     [Ground.SAND]: 0.08,
//     // irrelevant
//     [Ground.UNDEFINED]: 1,
//     [Ground.HOLE]: 1,
//     [Ground.WATER]: 1,
//     [Ground.BALL]: 1,
//   },
//   [Club.WEDGE]: {
//     [Ground.TEE_BOX]: 0.18,
//     [Ground.GREEN]: 0.18,
//     [Ground.FAIRWAY]: 0.18,
//     [Ground.ROUGH]: 0.16,
//     [Ground.SAND]: 0.15,
//     // irrelevant
//     [Ground.UNDEFINED]: 1,
//     [Ground.HOLE]: 1,
//     [Ground.WATER]: 1,
//     [Ground.BALL]: 1,
//   },
//   [Club.PUTTER]: {
//     [Ground.TEE_BOX]: 0.08,
//     [Ground.GREEN]: 0.08,
//     [Ground.FAIRWAY]: 0.08,
//     [Ground.ROUGH]: 0.02,
//     [Ground.SAND]: 0.01,

//     // irrelevant
//     [Ground.UNDEFINED]: 1,
//     [Ground.HOLE]: 1,
//     [Ground.WATER]: 1,
//     [Ground.BALL]: 1,
//   },
// };

const GROUND_SPEED_SUBTRACTION = {
  [Ground.WATER]: 1,
  [Ground.SAND]: 1,
  [Ground.UNDEFINED]: 1,
  [Ground.BALL]: 1,
  [Ground.HOLE]: 0.8,
  [Ground.ROUGH]: 0.9,
  [Ground.FAIRWAY]: 0.25,
  [Ground.GREEN]: 0.06,
  [Ground.TEE_BOX]: 0,
};

const CLUB_Z_ANGLE = {
  [Club.DRIVER]: 20,
  [Club.IRON]: 30,
  [Club.WEDGE]: 60,
  [Club.PUTTER]: 0,
};

const GROUND_BOUNCE_RATIO = {
  [Ground.GREEN]: 0.3,
  [Ground.FAIRWAY]: 0.25,
  [Ground.ROUGH]: 0.1,
  [Ground.WATER]: 0,
  [Ground.SAND]: 0,
  [Ground.UNDEFINED]: 0,
  [Ground.HOLE]: 0,
  [Ground.BALL]: 0,
};

function adjustDirection(
  originalDirection: number,
  club: Club,
  ground: Ground
): number {
  if (ground === undefined) {
    ground = Ground.UNDEFINED;
  }
  // Calculate the maximum deviation based on the club's accuracy ratio
  const maxDeviation =
    MAX_INACCURACY_DEGREES *
    (1 - CLUB_ACCURACY_RATIO[club] * GROUND_ACCURACY_RATIO[ground]);

  // Generate a random deviation within the range [-maxDeviation, maxDeviation]
  const randomDeviation = Math.random() * 2 * maxDeviation - maxDeviation;

  // Adjust the original direction by the random deviation
  const adjustedDirection = originalDirection + randomDeviation;

  return adjustedDirection;
}

type SwingPoint = {
  point: Point2D;
  height: number;
  speed: number;
};

export class Swing {
  public club: Club;
  public power: number;
  public direction: number;

  constructor(club: Club, power: number, direction: number) {
    this.club = club;
    this.power = power;
    this.direction = direction;
  }

  public toJSON() {
    return {
      club: this.club,
      power: this.power,
      direction: this.direction,
    };
  }

  public static fromJSON(json: any) {
    const { club, power, direction } = json;
    return new Swing(club, power, direction);
  }
}

export class Stroke {
  public swing: Swing;
  public start: Point2D;
  public end: Point2D;
  public swingPath: SwingPoint[];

  constructor(
    swing: Swing,
    start: Point2D,
    end: Point2D,
    swingPath: SwingPoint[]
  ) {
    this.swing = swing;
    this.start = start;
    this.end = end;
    this.swingPath = swingPath;
  }

  public toJSON() {
    return {
      swing: this.swing.toJSON(),
      start: this.start.toJSON(),
      end: this.end.toJSON(),
      swingPath: this.swingPath,
    };
  }

  public static fromJSON(json: any) {
    const { swing, start, end, swingPath } = json;
    return new Stroke(
      Swing.fromJSON(swing),
      Point2D.fromJSON(start),
      Point2D.fromJSON(end),
      swingPath
    );
  }
}

export class Player {
  public id: string;
  public color: string;

  constructor(id: string, color: string) {
    this.id = id;
    this.color = color;
  }

  public toJSON() {
    return {
      id: this.id,
      color: this.color,
    };
  }

  public static fromJSON(json: any): Player {
    const { id, color } = json;
    return new Player(id, color);
  }
}

export class Hole {
  public course: Course;
  public strokes: Stroke[][] = [];

  constructor(course: Course, strokes: Stroke[][]) {
    this.course = course;
    this.strokes = strokes;
  }

  public toJSON() {
    return {
      course: this.course.toJSON(),
      strokes: this.strokes.map((s) => s.map((stroke) => stroke.toJSON())),
    };
  }

  public static fromJSON(json: any): Hole {
    const { course, strokes } = json;
    return new Hole(
      Course.fromJSON(course),
      strokes.map((s) => s.map((stroke) => Stroke.fromJSON(stroke)))
    );
  }

  public getCurrentBallLocation(playerIndex: number): Point2D {
    return Hole.getCurrentBallLocation(this.strokes[playerIndex], this.course);
  }

  public static getCurrentBallLocation(
    strokes: Stroke[],
    course: Course
  ): Point2D {
    if (strokes.length === 0) {
      return course.teeBoxPoint;
    }

    const lastStroke = strokes[strokes.length - 1];

    let endGround;
    try {
      endGround = Ground[course.terrain[lastStroke.end.y][lastStroke.end.x]];
    } catch (error) {}

    if (endGround === undefined) {
      endGround = "UNDEFINED";
    }

    // JS enums are assnado
    if (endGround === "WATER" || endGround === "UNDEFINED") {
      return Hole.getCurrentBallLocation(
        strokes.slice(0, strokes.length - 1),
        course
      );
    }

    return strokes[strokes.length - 1].end;
  }
}

class Vector3D {
  constructor(public x: number, public y: number, public z: number) {}

  // Scalar multiplication
  multiplyScalar(scalar: number): Vector3D {
    return new Vector3D(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  // Add vectors
  add(other: Vector3D): Vector3D {
    return new Vector3D(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  // Normalize vector (to keep movement consistent in direction)
  normalize(): Vector3D {
    const magnitude = Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
    return new Vector3D(
      this.x / magnitude,
      this.y / magnitude,
      this.z / magnitude
    );
  }

  // Move the ball by 1 unit in the direction of its velocity
  move(): Vector3D {
    return this.normalize(); // Moves 1 unit in the current direction
  }
}

function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export class Golfnado {
  public gameState: GameState = GameState.NOT_STARTED;
  public players: Player[] = [];
  public holes: Hole[] = [];
  public maxStrokes: number = MAX_STROKES;
  public holePlayerOrder: number[][] = [];

  constructor(
    gameState: GameState,
    players: Player[],
    holes: Hole[],
    maxStrokes: number,
    holePlayerOrder: number[][]
  ) {
    this.gameState = gameState;
    this.players = players;
    this.holes = holes;
    this.maxStrokes = maxStrokes;
    this.holePlayerOrder = holePlayerOrder;
  }

  public static newGame(userId: string) {
    return new Golfnado(
      GameState.NOT_STARTED,
      [new Player(userId, Object.values(BALL_COLORS)[0])],
      [],
      MAX_STROKES,
      []
    );
  }

  public toJSON() {
    return {
      gameState: this.gameState,
      players: this.players.map((player) => player.toJSON()), // Assuming Player has a toJSON method
      holes: this.holes.map((hole) => hole.toJSON()),
      maxStrokes: this.maxStrokes,
      holePlayerOrder: this.holePlayerOrder,
    };
  }

  public static fromJSON(json: any): Golfnado {
    const { gameState, players, holes, maxStrokes, holePlayerOrder } = json;
    return new Golfnado(
      gameState,
      players.map((playerJson: any) => Player.fromJSON(playerJson)), // Assuming Player has a fromJSON method
      holes.map((holeJson: any) => Hole.fromJSON(holeJson)),
      maxStrokes,
      holePlayerOrder
    );
  }

  public concedeHole(playerId: string): void {
    const currentHoleIndex = this.getCurrentHoleIndex();
    if (currentHoleIndex === null) {
      return;
    }

    const playerIndex = this.players.findIndex((p) => p.id === playerId);

    const maxStrokes = [];
    for (let i = 0; i < this.maxStrokes; i++) {
      maxStrokes.push(null);
    }

    this.holes[currentHoleIndex].strokes[playerIndex] = maxStrokes;
  }

  public addPlayer(id: string): void {
    if (this.players.find((p) => p.id === id)) {
      return;
    }
    this.players.push(
      new Player(id, Object.values(BALL_COLORS)[this.players.length])
    );
  }

  public startGame(numHoles = NUM_HOLES): void {
    this.gameState = GameState.STARTED;

    Array.from({ length: numHoles }, (_, i) => {
      const strokes = [];
      Array.from({ length: this.players.length }, (_, i) => {
        strokes.push([]);
      });
      const course = new Course();
      course.initializeCourse();
      this.holes.push(new Hole(course, strokes));
      if (i === 0) {
        this.holePlayerOrder.push(
          Array.from({ length: this.players.length }, (_, index) => index)
        );
      } else {
        this.holePlayerOrder.push([]);
      }
    });
  }

  public getCurrentHoleIndex(): number | null {
    for (let holeNum = 0; holeNum < this.holes.length; holeNum++) {
      const hole = this.holes[holeNum];

      for (let strokes of hole.strokes) {
        if (strokes.length === 0) {
          return holeNum;
        }
        if (strokes.length >= this.maxStrokes) {
          continue;
        }

        if (hole.course.isPointInHole(strokes[strokes.length - 1].end)) {
          continue;
        }

        return holeNum;
      }
    }
    return null;
  }

  public getCurrentHole(): Hole | null {
    return this.holes[this.getCurrentHoleIndex()];
  }

  public swing(
    playerId: string,
    swing: Swing
  ):
    | {
        stroke: Stroke;
        hole: Hole;
        endGround: Ground;
        gameState: GameState;
      }
    | undefined {
    const currentHoleIndex = this.getCurrentHoleIndex();
    if (currentHoleIndex === null) {
      return;
    }

    const currentHole = this.holes[currentHoleIndex];
    const currentPlayerIndex = this.getCurrentPlayerIndex(
      currentHole,
      this.holePlayerOrder[currentHoleIndex]
    );

    if (
      currentPlayerIndex === null ||
      this.players[currentPlayerIndex].id !== playerId
    ) {
      return;
    }

    const currentPlayerStrokes = currentHole.strokes[currentPlayerIndex];

    const stroke = this.calculateStroke(
      swing,
      currentHole.course,
      currentPlayerStrokes
    );

    currentHole.strokes[currentPlayerIndex].push(stroke);

    const nextHoleIndex = this.getCurrentHoleIndex();

    if (nextHoleIndex === null) {
      this.gameState = GameState.GAME_OVER;
    } else if (nextHoleIndex != currentHoleIndex) {
      // calculate order of best to worst scores by player

      const totalPlayerScores = [];
      for (let i = 0; i < this.players.length; i++) {
        totalPlayerScores.push(0);
      }

      for (let i = 0; i < nextHoleIndex; i++) {
        for (const [playerIndex, strokes] of this.holes[i].strokes.entries()) {
          totalPlayerScores[playerIndex] += strokes.length;
        }
      }

      const holePlayerOrder = [];

      for (let i = 0; i < this.players.length; i++) {
        // find max index of totalPlayerScores
        const minIndex = totalPlayerScores.reduce(
          (minIdx, currentValue, currentIndex, arr) =>
            currentValue < arr[minIdx] ? currentIndex : minIdx,
          0
        );

        holePlayerOrder.push(minIndex);
        totalPlayerScores[minIndex] = this.maxStrokes * this.holes.length + 1;
      }

      this.holePlayerOrder[nextHoleIndex] = holePlayerOrder;
    }

    return {
      stroke,
      hole: currentHole,
      endGround:
        (currentHole.course.terrain[stroke.end.y] ?? [])[stroke.end.x] ??
        Ground.UNDEFINED,
      gameState: this.gameState,
    };
  }

  public getCurrentPlayer(): Player | null {
    if (this.gameState !== GameState.STARTED) {
      return null;
    }

    const currentHoleIndex = this.getCurrentHoleIndex();
    if (currentHoleIndex === null) {
      return null;
    }

    const currentHole = this.holes[currentHoleIndex];
    const currentPlayerIndex = this.getCurrentPlayerIndex(
      currentHole,
      this.holePlayerOrder[currentHoleIndex]
    );
    return this.players[currentPlayerIndex];
  }

  public getCurrentPlayerIndex(
    hole: Hole,
    playerOrder: number[]
  ): number | null {
    if (hole.strokes.length === 0) {
      return playerOrder[0];
    }

    let minimum: number | null = null;
    for (let x = 0; x < playerOrder.length; x++) {
      const playerIndex = playerOrder[x];

      const playerStrokes = hole.strokes[playerIndex];
      if (playerStrokes.length === 0) {
        return playerIndex;
      }

      if (playerStrokes.length >= this.maxStrokes) {
        continue;
      }

      const currentBallPosition = playerStrokes[playerStrokes.length - 1].end;
      if (hole.course.isPointInHole(currentBallPosition)) {
        continue;
      }

      if (
        minimum === null ||
        hole.strokes[minimum].length > playerStrokes.length
      ) {
        minimum = playerIndex;
      }
    }

    return minimum;
  }

  private calculateStroke(
    swing: Swing,
    course: Course,
    strokes: Stroke[]
  ): Stroke {
    const startLocation = Hole.getCurrentBallLocation(strokes, course);
    const startGround = course.terrain[startLocation.y][startLocation.x];
    const startElevation = course.elevation[startLocation.y][startLocation.x];

    const adjustedDirection = adjustDirection(
      swing.direction,
      swing.club,
      startGround
    );

    const swingPower = Math.max(
      CLUB_TERRAIN_POWER_RATIO[swing.club][startGround] * swing.power,
      1
    );

    const yDiff =
      -1 * Math.cos(degreesToRadians(adjustedDirection)) * swingPower;
    const xDiff = Math.sin(degreesToRadians(adjustedDirection)) * swingPower;

    // const zDiff =
    //   Math.tan(degreesToRadians(CLUB_Z_ANGLE[swing.club])) / swingPower;

    // console.log(`zDiff: ${zDiff} `);

    // tan(zAngle) = zdiff/ x * y magnitude
    // tan(zAngle) / x* y magnitude = zdiff

    const zDiff =
      Math.sin(degreesToRadians(CLUB_Z_ANGLE[swing.club])) * swingPower;

    // technically zDiff should be cos(Z_ANGLE) = magniture of x and y / zDiff
    // so Zdeff = magnitude x and y / cos(Z_ANGLE)

    // console.log(`zDIFF:${zDiff}`);

    let ballPositionVector = new Vector3D(
      startLocation.x,
      startLocation.y,
      startElevation.height
    );

    let ballVelocityVector = new Vector3D(xDiff, yDiff, zDiff);

    function getBallSwingPoint(
      course: Course,
      positionVector: Vector3D,
      velocityVector: Vector3D
    ) {
      const xyVelocityMagnitude = Math.sqrt(
        velocityVector.x ** 2 + velocityVector.y ** 2
      );

      const newX = Math.round(positionVector.x);
      const newY = Math.round(positionVector.y);

      let elevation = 0;
      if (
        newX >= 0 &&
        newX < course.width &&
        newY >= 0 &&
        newY < course.height
      ) {
        elevation = course.elevation[newY][newX].height;
      }

      return {
        point: new Point2D(positionVector.x, positionVector.y),
        height: Math.max(positionVector.z, elevation),
        speed: xyVelocityMagnitude,
      };
    }

    const swingPath: SwingPoint[] = [];
    swingPath.push(
      getBallSwingPoint(course, ballPositionVector, ballVelocityVector)
    );

    function getForceVector(
      course: Course,
      ballPosition: Vector3D,
      ballVelocity: Vector3D
    ) {
      const newX = Math.round(ballPosition.x);
      const newY = Math.round(ballPosition.y);

      let newGround = Ground.UNDEFINED;
      let newElevation = { slope: "flat", height: 0 };

      if (
        newX >= 0 &&
        newX < course.width &&
        newY >= 0 &&
        newY < course.height
      ) {
        newGround = course.terrain[newY][newX];
        newElevation = course.elevation[newY][newX];
      }

      let windVector = new Vector3D(0, 0, 0);
      let slopeVector = new Vector3D(0, 0, 0);
      let frictionVector = new Vector3D(0, 0, 0);
      let bounceVector = new Vector3D(0, 0, 0);
      let airVector = new Vector3D(0, 0, 0);

      if (ballPosition.z > newElevation.height) {
        // console.log("air resistance");
        airVector.x = -1 * ballVelocity.x * AIR_RESISTANCE_DRAG_RATIO;
        airVector.y = -1 * ballVelocity.y * AIR_RESISTANCE_DRAG_RATIO;
        airVector.z -= GRAVITY; // gravity

        if (ballPosition.z - newElevation.height > WIND_HEIGHT_THRESHOLD) {
          // console.log("wind");
          const wind = course.wind;

          windVector = new Vector3D(
            Math.sin(degreesToRadians(wind.direction)) * wind.velocity,
            -1 * Math.cos(degreesToRadians(wind.direction)) * wind.velocity,
            0
          );
        }
      } else {
        // if (slopeVector.x === 0 && slopeVector.y === 0 && slopeVector.z === 0) {
        frictionVector = new Vector3D(
          -1 * ballVelocity.x * GROUND_SPEED_SUBTRACTION[newGround],
          -1 * ballVelocity.y * GROUND_SPEED_SUBTRACTION[newGround],
          0
        );

        // }

        if (newGround !== Ground.HOLE) {
          const slopeVelocityMagnitude = SLOPE_VELOCITY;
          // const slopeVelocityMagnitude =
          //   SLOPE_VELOCITY -
          //   SLOPE_VELOCITY * GROUND_SPEED_SUBTRACTION[newGround];
          if (newElevation.slope == "horizontal") {
            let leftHeight = newElevation.height;
            let rightHeight = newElevation.height;

            if (newX - 1 >= 0) {
              leftHeight = course.elevation[newY][newX - 1].height;
            }

            if (newX + 1 < course.width) {
              rightHeight = course.elevation[newY][newX + 1].height;
            }

            if (leftHeight > rightHeight) {
              // move right
              // console.log("slope right");
              slopeVector = new Vector3D(slopeVelocityMagnitude, 0, 0);
            } else if (rightHeight > leftHeight) {
              // move left
              // console.log("slope left");
              slopeVector = new Vector3D(-slopeVelocityMagnitude, 0, 0);
            }
          } else if (newElevation.slope == "vertical") {
            let upHeight = newElevation.height;
            let downHeight = newElevation.height;

            if (newY - 1 >= 0) {
              upHeight = course.elevation[newY - 1][newX].height;
            }

            if (newY + 1 < course.width) {
              downHeight = course.elevation[newY + 1][newX].height;
            }

            if (upHeight > downHeight) {
              // move down
              slopeVector = new Vector3D(0, slopeVelocityMagnitude, 0);
            } else if (downHeight > upHeight) {
              // move left
              slopeVector = new Vector3D(0, -slopeVelocityMagnitude, 0);
            }
          }
        }

        if (ballVelocity.z < 0) {
          if (Math.abs(ballVelocity.z) >= BOUNCE_THRESHOLD) {
            bounceVector.z =
              -1 *
              (ballVelocity.z +
                ballVelocity.z * GROUND_BOUNCE_RATIO[newGround]);
            // z =
            // -1 *
            // (ballVelocity.z +
            //   ballVelocity.z * GROUND_BOUNCE_RATIO[newGround]);
          } else {
            bounceVector.z = -1 * ballVelocity.z;
            // z = -1 * ballVelocity.z;
          }

          // only slow down from bounce if not in water/sand/undefined
          if (GROUND_SPEED_SUBTRACTION[newGround] !== 1) {
            bounceVector.x =
              -1 * (ballVelocity.x / CLUB_BOUNCE_VELOCITY_DIVISOR[swing.club]);
            bounceVector.y =
              -1 * (ballVelocity.y / CLUB_BOUNCE_VELOCITY_DIVISOR[swing.club]);
            // x =
            //   -1 * (ballVelocity.x / CLUB_BOUNCE_VELOCITY_DIVISOR[swing.club]);
            // y =
            //   -1 * (ballVelocity.y / CLUB_BOUNCE_VELOCITY_DIVISOR[swing.club]);
          }
        }
      }

      return new Vector3D(
        windVector.x +
          slopeVector.x +
          frictionVector.x +
          bounceVector.x +
          airVector.x,
        windVector.y +
          slopeVector.y +
          frictionVector.y +
          bounceVector.y +
          airVector.y,
        windVector.z +
          slopeVector.z +
          frictionVector.z +
          bounceVector.z +
          airVector.z
      );
    }

    let iterations = 0;
    while (
      iterations < 1000 &&
      (ballVelocityVector.x !== 0 ||
        ballVelocityVector.y !== 0 ||
        ballVelocityVector.z !== 0)
    ) {
      iterations += 1;
      ballPositionVector.x +=
        ballVelocityVector.x / VELOCITY_POSITION_DELTA_DIVISOR;
      ballPositionVector.y +=
        ballVelocityVector.y / VELOCITY_POSITION_DELTA_DIVISOR;
      ballPositionVector.z += ballVelocityVector.z;

      let newElevation: Elevation = { slope: "flat", height: 0 };
      try {
        newElevation =
          course.elevation[Math.round(ballPositionVector.y)][
            Math.round(ballPositionVector.x)
          ];
      } catch (error) {}

      ballPositionVector.z = Math.max(
        ballPositionVector.z,
        newElevation?.height || 0
      );

      if (ballVelocityVector.z === 0) {
        // ball has no z velocity so it is rolling, move it to the new elevation of ground
        ballPositionVector.z = newElevation?.height || 0;
      }

      const forceVector = getForceVector(
        course,
        ballPositionVector,
        ballVelocityVector
      );

      const newBallPoint = getBallSwingPoint(
        course,
        ballPositionVector,
        ballVelocityVector
      );
      swingPath.push(newBallPoint);

      ballVelocityVector.x += forceVector.x;
      ballVelocityVector.y += forceVector.y;
      ballVelocityVector.z += forceVector.z;

      if (
        Math.abs(ballVelocityVector.x) < MIN_VELOCITY &&
        Math.abs(ballVelocityVector.y) < MIN_VELOCITY &&
        Math.abs(ballVelocityVector.z) < MIN_VELOCITY
      ) {
        ballVelocityVector = new Vector3D(0, 0, 0);
      }
    }

    // filter swing path duplicate points
    const finalSwingPath = [];
    let count = 0;
    let lastX = null;
    let lastY = null;
    let lastZ = null;
    for (let swing of swingPath) {
      if (
        !lastX ||
        !lastY ||
        !lastZ ||
        swing.point.x != lastX ||
        swing.point.y != lastY ||
        swing.height != lastZ
      ) {
        lastX = swing.point.x;
        lastY = swing.point.y;
        lastZ = swing.height;
        finalSwingPath.push(swing);
        continue;
      }
      count++;

      if (count < 2) {
        finalSwingPath.push(swing);
      }
    }

    const endPoint = finalSwingPath[finalSwingPath.length - 1].point;

    return new Stroke(
      swing,
      startLocation,
      new Point2D(Math.round(endPoint.x), Math.round(endPoint.y)),
      finalSwingPath
    );
  }

  public static parseSwing(swing: string): Swing | null {
    const split = swing.trim().split(/\s+/);

    if (split.length != 4) {
      return null;
    }

    let club;
    const clubString = split[1];
    if (clubString.toLowerCase() === "driver") {
      club = Club.DRIVER;
    } else if (clubString.toLowerCase() === "iron") {
      club = Club.IRON;
    } else if (clubString.toLowerCase() === "wedge") {
      club = Club.WEDGE;
    } else if (clubString.toLowerCase() === "putter") {
      club = Club.PUTTER;
    }

    if (club === undefined) {
      return null;
    }

    const power = parseInt(split[2]);
    if (Number.isNaN(power) || power <= 0 || power > 100) {
      return null;
    }

    const direction = parseInt(split[3]);
    if (Number.isNaN(direction)) {
      return null;
    }

    return new Swing(club, power, direction);
  }
}

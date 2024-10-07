import { Point2D } from "./course";
import { Golfnado, Hole } from "./game";

type NumberAndPlayerId = {
  value: number;
  playerId: string;
};

export type GolfnadoStats = {
  games: NumberAndPlayerId;
  holes: NumberAndPlayerId;
  wins: NumberAndPlayerId;
  totalStrokes: NumberAndPlayerId;
  bestHole: NumberAndPlayerId;
  bestRound: NumberAndPlayerId;
  averageStrokes: NumberAndPlayerId;
  maxStrokesReached: NumberAndPlayerId;
  timesLandedInWater: NumberAndPlayerId;
  timesLandedInSand: NumberAndPlayerId;
  longestHoleIn: NumberAndPlayerId;
};

function getBetterStat(
  statOne: NumberAndPlayerId,
  statTwo: NumberAndPlayerId,
  useLowest: boolean
): NumberAndPlayerId {
  if (!statTwo) {
    return statOne;
  }

  if (useLowest) {
    return statOne.value <= statTwo.value ? statOne : statTwo;
  } else {
    return statOne.value >= statTwo.value ? statOne : statTwo;
  }
}

export function gatherBestStats(allStats: GolfnadoStats[]): GolfnadoStats {
  return {
    games: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.games, false),
      allStats[0].games
    ),
    holes: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.holes, false),
      allStats[0].holes
    ),
    wins: allStats.reduce(
      (bestStat, playerStat) => getBetterStat(bestStat, playerStat.wins, false),
      allStats[0].wins
    ),
    totalStrokes: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.totalStrokes, false),
      allStats[0].totalStrokes
    ),
    bestHole: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.bestHole, true),
      allStats[0].bestHole
    ),
    bestRound: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.bestRound, true),
      allStats[0].bestRound
    ),
    averageStrokes: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.averageStrokes, true),
      allStats[0].averageStrokes
    ),
    maxStrokesReached: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.maxStrokesReached, false),
      allStats[0].maxStrokesReached
    ),
    timesLandedInWater: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.timesLandedInWater, false),
      allStats[0].timesLandedInWater
    ),
    timesLandedInSand: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.timesLandedInSand, false),
      allStats[0].timesLandedInSand
    ),
    longestHoleIn: allStats.reduce(
      (bestStat, playerStat) =>
        getBetterStat(bestStat, playerStat.longestHoleIn, false),
      allStats[0].longestHoleIn
    ),
  };
}

export function gatherPlayerStats(
  game: Golfnado,
  playerIndex: number
): GolfnadoStats {
  const playerId = game.players[playerIndex].id;

  let bestHole = game.maxStrokes;
  let bestRound = game.maxStrokes * game.holes.length;
  let maxStrokesReached = 0;
  let timesLandedInSand = 0;
  let timesLandedInWater = 0;
  let longestHoleIn = 0;

  const playerScores = new Array(game.players.length).fill(0);

  game.holes.forEach((hole: Hole) => {
    hole.strokes.forEach((strokes, idx) => {
      playerScores[idx] += strokes.length;
    });

    if (hole.strokes[playerIndex].length < bestHole) {
      bestHole = hole.strokes[playerIndex].length;
    }

    bestRound += hole.strokes[playerIndex].length;

    if (
      hole.strokes[playerIndex].length === game.maxStrokes &&
      !hole.course.isPointInHole(
        hole.strokes[playerIndex][game.maxStrokes - 1].end
      )
    ) {
      maxStrokesReached += 1;
    }

    const lastStroke =
      hole.strokes[playerIndex][hole.strokes[playerIndex].length - 1];

    if (hole.course.isPointInHole(lastStroke.end)) {
      const lastStrokeDistance = Point2D.distance(
        lastStroke.start,
        lastStroke.end
      );
      if (longestHoleIn === undefined) {
        longestHoleIn = lastStrokeDistance;
      } else if (longestHoleIn < lastStrokeDistance) {
        longestHoleIn = lastStrokeDistance;
      }
    }

    hole.strokes[playerIndex].forEach((stroke) => {
      if (hole.course.isPointInSand(stroke.end)) {
        timesLandedInSand += 1;
      }

      if (hole.course.isPointInWater(stroke.end)) {
        timesLandedInWater += 1;
      }
    });
  });

  return {
    games: { value: 1, playerId },
    holes: { value: game.holes.length, playerId },
    wins: {
      value: playerScores[playerIndex] === Math.min(...playerScores) ? 1 : 0,
      playerId,
    },
    totalStrokes: { value: playerScores[playerIndex], playerId },
    bestHole: { value: bestHole, playerId },
    bestRound: { value: bestRound, playerId },
    averageStrokes: {
      value: playerScores[playerIndex] / game.holes.length,
      playerId,
    },
    maxStrokesReached: { value: maxStrokesReached, playerId },
    timesLandedInWater: { value: timesLandedInWater, playerId },
    timesLandedInSand: { value: timesLandedInSand, playerId },
    longestHoleIn: { value: longestHoleIn, playerId },
  };
}

function addStats(statOne: NumberAndPlayerId, statTwo: NumberAndPlayerId) {
  return {
    playerId: statOne.playerId,
    value: statOne.value + statTwo.value,
  };
}

export function mergeStats(
  allTimeStats: GolfnadoStats,
  lastGameStats: GolfnadoStats
): GolfnadoStats {
  const playerId = allTimeStats.games.playerId;
  const newTotalHoles = allTimeStats.holes.value + lastGameStats.holes.value;
  const newTotalStrokes =
    allTimeStats.totalStrokes.value + lastGameStats.totalStrokes.value;
  return {
    games: addStats(allTimeStats.games, lastGameStats.games),
    holes: addStats(allTimeStats.holes, lastGameStats.holes),
    wins: addStats(allTimeStats.wins, lastGameStats.wins),
    totalStrokes: addStats(
      allTimeStats.totalStrokes,
      lastGameStats.totalStrokes
    ),
    bestHole: {
      value: Math.min(
        allTimeStats.bestHole.value,
        lastGameStats.bestHole.value
      ),
      playerId,
    },
    bestRound: {
      value: Math.min(
        allTimeStats.bestRound.value || Number.MAX_VALUE,
        lastGameStats.bestRound.value
      ),
      playerId,
    },
    averageStrokes: { value: newTotalStrokes / newTotalHoles, playerId },
    maxStrokesReached: addStats(
      allTimeStats.maxStrokesReached,
      lastGameStats.maxStrokesReached
    ),
    timesLandedInWater: addStats(
      allTimeStats.timesLandedInWater,
      lastGameStats.timesLandedInWater
    ),
    timesLandedInSand: addStats(
      allTimeStats.timesLandedInSand,
      lastGameStats.timesLandedInSand
    ),
    longestHoleIn: {
      value: Math.max(
        allTimeStats.longestHoleIn.value,
        lastGameStats.longestHoleIn.value
      ),
      playerId,
    },
  };
}

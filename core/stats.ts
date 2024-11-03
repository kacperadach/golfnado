import { Point2D } from "../core/course";
import { Golfnado, Hole } from "../core/game";

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

  if (!statOne) {
    return statTwo;
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
  let bestRound = 0;
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
  if (!statTwo) {
    return { ...statOne };
  }

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
    games: addStats(lastGameStats.games, allTimeStats.games),
    holes: addStats(lastGameStats.holes, allTimeStats.holes),
    wins: addStats(lastGameStats.wins, allTimeStats.wins),
    totalStrokes: addStats(
      lastGameStats.totalStrokes,
      allTimeStats.totalStrokes
    ),
    bestHole: {
      value: Math.min(
        lastGameStats.bestHole.value,
        allTimeStats.bestHole.value
      ),
      playerId,
    },
    bestRound: {
      value: Math.min(
        lastGameStats.bestRound.value,
        allTimeStats.bestRound.value || Number.MAX_VALUE
      ),
      playerId,
    },
    averageStrokes: { value: newTotalStrokes / newTotalHoles, playerId },
    maxStrokesReached: addStats(
      lastGameStats.maxStrokesReached,
      allTimeStats.maxStrokesReached
    ),
    timesLandedInWater: addStats(
      lastGameStats.timesLandedInWater,
      allTimeStats.timesLandedInWater
    ),
    timesLandedInSand: addStats(
      lastGameStats.timesLandedInSand,
      allTimeStats.timesLandedInSand
    ),
    longestHoleIn: {
      value: Math.max(
        lastGameStats.longestHoleIn.value,
        allTimeStats.longestHoleIn.value
      ),
      playerId,
    },
  };
}

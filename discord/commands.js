export const NEW_GOLFNADO_COMMAND = {
  name: "newgolfnado",
  description: "Start a new game!",
};

export const ABORT_GOLFNADO_COMMAND = {
  name: "abort",
  description: "Abort the current game!"
}

export const JOIN_GOLFNADO_COMMAND = {
  name: "join",
  description: "Join the current game!"
}

export const START_GOLFNADO_COMMAND = {
  name: "start",
  description: "Start the current game!"
}

export const SWING_COMMAND = {
  name: "swing",
  description: "Swing when it's your turn!",
  options: [
    {
      name: "club",
      description: "Driver, Iron, Wedge or Putter",
      type: 3, // STRING type
      required: true
    },
    {
      name: "power",
      description: "Power from 1-100",
      type: 4, // INTEGER type
      required: true
    },
    {
      name: "direction",
      description: "Direction in degrees",
      type: 4, // BOOLEAN type
      required: true
    }
  ]
};

export const MY_SWINGS_COMMAND = {
  name: "myswings",
  description: "Show my swings on this hole.",
}

export const RANK_COMMAND = {
  name: "rank",
  description: "Show the ranking of the current game."
}

export const WIND_COMMAND = {
  name: "wind",
  description: "Show wind on current hole."
}

export const HELP_COMMAND = {
  name: "help",
  description: "Show all Golfnado commands."
}

export const MY_STATS_COMMAND = {
  name: "mystats",
  description: "Show your stats."
}

export const STATS_COMMAND = {
  name: "stats",
  description: "Show this channel's stats."
}

export const COURSE_COMMAND = {
  name: "course",
  description: "Show the current course."
}



export const ALL_COMMANDS = [
  NEW_GOLFNADO_COMMAND,
  ABORT_GOLFNADO_COMMAND,
  JOIN_GOLFNADO_COMMAND,
  START_GOLFNADO_COMMAND,
  SWING_COMMAND,
  MY_SWINGS_COMMAND,
  RANK_COMMAND,
  WIND_COMMAND,
  HELP_COMMAND,
  MY_STATS_COMMAND,
  STATS_COMMAND,
  COURSE_COMMAND
];
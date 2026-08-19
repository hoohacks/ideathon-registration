import React from "react";
import { Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";

/**
 * One judging assignment.
 *
 * Props:
 * - teamId: the database key. Team names are not unique, so scoring keys off
 *   this rather than the name.
 */
function ScheduleCard({
  teamId = null,
  teamName = "Team",
  room = "TBD",
  time = "TBD",
  onButtonClick = () => {},
  disabled = false,
}) {
  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent
        sx={{
          p: 2,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          "&:last-child": { pb: 2 },
        }}
      >
        <Stack spacing={0.75}>
          <Typography variant="h5" sx={{ lineHeight: 1.3 }}>
            {teamName}
          </Typography>
          <Stack direction="row" spacing={0.75}>
            <Chip label={time} size="small" variant="outlined" />
            <Chip label={room} size="small" variant="outlined" />
          </Stack>
        </Stack>

        <Button
          fullWidth
          variant={disabled ? "outlined" : "contained"}
          disabled={disabled}
          onClick={(e) => {
            if (!disabled) onButtonClick({ teamId, teamName, room, time, event: e });
          }}
          sx={{ mt: "auto" }}
        >
          {disabled ? "Scored" : "Score team"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ScheduleCard;

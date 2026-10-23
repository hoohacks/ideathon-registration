import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import {
  Alert, Box, Button, Card, Chip, Divider, Stack, Tab, Tabs, Typography,
} from "@mui/material";
import { onValue, ref } from "firebase/database";
import { database } from "../../../firebase";
import Layout from "../../Layout";
import { PageHeader } from "../adminUi";
import { SCORE_MAX_TOTAL } from "../../judge/scoreRubric";
import usePageTitle from "../../../usePageTitle";
import { finalSlotTime, subscribeToFinalRoundTiming } from "../../judge/finalRoundTiming";
import {
  finalStandings, firstRoundStandings, leadersOf, panelsFrom, placesOf, standingsState,
} from "./standings";

/**
 * The result of the event, in both rounds.
 *
 * There was no screen for this. The standings were written at activation, never
 * read, and carried the first round's averages -- so the only way to find out
 * who won was to export the final round's raw cards and add them up. On the one
 * night of the year it matters, with a room waiting.
 *
 * The page is careful about two distinctions.
 *
 * - **A running total is not a result.** The standings are on screen the whole
 *   time, with the team on top marked as leading, but they only say "winner"
 *   once every judge who is scoring has scored every finalist -- or once the
 *   round is closed and nothing more can come in. Judges who step out without
 *   scoring anybody are not waited on (see standings.js); they are named, so
 *   an organizer can tell a judge who left from one still writing.
 * - **A tie is not a win.** Teams on the same average share the place, and a
 *   shared first place says so and leaves it to organizers rather than letting
 *   fundable votes or the alphabet decide.
 *
 * **The final tab shows the latest final round, open or closed.** Closing the
 * round withdraws the judges' assignments but keeps the standings, so the
 * result is still here after the round is closed. Publishing a new final round
 * replaces them.
 *
 * The rounds are tabs rather than two pages because the question an organizer
 * asks is the same one twice: who is on top, and is it settled yet. The tab is
 * in the URL, so the standings that are being read off a screen can be linked
 * to rather than described.
 */

const ROUNDS = [
  { id: "final", label: "Final round" },
  { id: "first", label: "First round" },
];

export default function Results() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("round");
  // Final by default: this page exists to answer who won, and the first round
  // is a step on the way to that rather than the thing being announced.
  const round = ROUNDS.some((entry) => entry.id === requested) ? requested : "final";
  const final = round === "final";

  const [teams, setTeams] = useState({});
  const [firstScores, setFirstScores] = useState({});
  const [finalRoundTeams, setFinalRoundTeams] = useState(null);
  const [finalScores, setFinalScores] = useState({});
  const [judges, setJudges] = useState({});
  const [active, setActive] = useState(false);
  // the same live times teams and judges are shown, so "Slot 2" here reads as
  // the 6:08 PM everyone in the room is going by
  const [timing, setTiming] = useState(null);

  usePageTitle("Results");

  useEffect(() => subscribeToFinalRoundTiming((next) => setTiming(next.timing)), []);

  useEffect(() => {
    const stop = [
      onValue(ref(database, "teams"), (s) => setTeams(s.val() ?? {})),
      onValue(ref(database, "scores/first"), (s) => setFirstScores(s.val() ?? {})),
      onValue(ref(database, "finalRound/teams"), (s) => setFinalRoundTeams(s.exists() ? s.val() : null)),
      onValue(ref(database, "scores/final"), (s) => setFinalScores(s.val() ?? {})),
      onValue(ref(database, "judges"), (s) => setJudges(s.val() ?? {})),
      onValue(ref(database, "finalRound/active"), (s) => setActive(s.val() === true)),
    ];
    return () => stop.forEach((fn) => fn());
  }, []);

  const finalRanking = useMemo(
    () => finalStandings({
      finalRoundTeams: finalRoundTeams ?? {},
      finalScores,
      panels: panelsFrom(judges),
    }),
    [finalRoundTeams, finalScores, judges]
  );

  const firstRanking = useMemo(
    () => firstRoundStandings({ teams, firstScores }),
    [teams, firstScores]
  );

  const standings = placesOf(final ? finalRanking : firstRanking);
  const state = standingsState(standings);
  // Only the final round crowns anybody. A first round that is fully scored is
  // a complete ranking, not a winner -- the finalists are drawn off the top of
  // it and the night is still to come.
  const leaders = final ? leadersOf(standings) : [];
  // closed means nothing more can come in, so what is there is the result
  const anyCards = standings.some((team) => team.cardsFiled > 0);
  const decided = final && anyCards && (state.settled || !active);
  const nameOf = (judgeId) => judgeNameOf(judges[judgeId]);

  return (
    <Layout maxWidth="md">
      <PageHeader
        title="Results"
        stats={
          final
            ? [
                { label: "finalists", singular: "finalist", value: standings.length },
                { label: "cards in", value: `${state.cards}/${state.expected}` },
              ]
            : [
                { label: "teams ranked", singular: "team ranked", value: standings.length },
                { label: "cards in", value: `${state.cards}/${state.expected}` },
              ]
        }
      />

      <Tabs
        value={round}
        onChange={(_, next) => setParams(next === "final" ? {} : { round: next }, { replace: true })}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
      >
        {ROUNDS.map((entry) => (
          <Tab key={entry.id} value={entry.id} label={entry.label} />
        ))}
      </Tabs>

      {final && !finalRoundTeams && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No final round has been published, so there is nobody to rank.{" "}
          <Button size="small" component={RouterLink} to="/user/admin/schedule?round=final">
            Plan the final round
          </Button>
        </Alert>
      )}

      {!final && standings.length === 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No first round scores have been filed yet.{" "}
          <Button size="small" component={RouterLink} to="/user/admin/judging">
            Watch judging progress
          </Button>
        </Alert>
      )}

      {standings.length > 0 && (final ? !decided : !state.settled) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {!anyCards
            ? `No ${final ? "final" : "first"} round scores have been filed yet.`
            : final
              ? <FinalWaiting state={state} nameOf={nameOf} />
              : `Still scoring. Waiting on ${state.waitingOn
                  .map((team) => `${team.missing} card${team.missing === 1 ? "" : "s"} for ${team.name}`)
                  .join(", ")}. This is a running total, not the result.`}
        </Alert>
      )}

      {decided && state.partialJudges.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {state.partialJudges
            .map((judge) => `${nameOf(judge.judgeId)} scored ${judge.scored} of ${judge.of} finalists`)
            .join("; ")}
          . Their cards count for the teams they scored and not the rest, so those averages are
          over different judges.
        </Alert>
      )}

      {final && leaders.length > 0 && (
        <LeaderCard
          leaders={leaders}
          decided={decided}
          closed={!active}
          notScoring={state.notScoring.map(nameOf)}
        />
      )}

      {standings.length > 0 && (
        <Card>
          <Box sx={{ px: 2.5, pt: 2, pb: 0.5 }}>
            <Typography variant="overline" component="p">
              {final ? "Final round standings" : "First round standings"}
            </Typography>
          </Box>
          <Stack divider={<Divider />} sx={{ px: 2.5, pb: 1 }}>
            {standings.map((team) => (
              <StandingRow key={team.teamId} team={team} final={final} timing={timing} />
            ))}
          </Stack>
        </Card>
      )}

      {standings.length > 0 && (
        <Typography variant="caption" component="p" sx={{ mt: 2 }}>
          Ranked on the {final ? "final" : "first"} round only, by average. Teams on the same
          average share a place{final ? ", and a tie for first is for organizers to decide." : "."}{" "}
          {final
            ? active
              ? "The final round is still open."
              : "The final round is closed."
            : "The finalists are drawn off the top of this."}
        </Typography>
      )}
    </Layout>
  );
}

/**
 * One place in the table.
 *
 * The second line is what the round was decided against: for the final that is
 * the first-round average the cut was made on, so a team that led all day and
 * came second on the night can be seen doing it. For the first round it is
 * where and when they presented, which is what an organizer checking a
 * surprising score wants next.
 */
function StandingRow({ team, final, timing = null }) {
  const scored = typeof team.averageScore === "number";

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 2 }}
      sx={{
        alignItems: { sm: "center" },
        py: 1.5
      }}>
      <Typography
        variant="data"
        aria-label={team.tied ? `tied for place ${team.place}` : undefined}
        sx={{ width: 32, color: "text.secondary" }}
      >
        {scored ? `${team.tied ? "T" : ""}${team.place}` : "-"}
      </Typography>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 600 }}>{team.name}</Typography>
        <Typography variant="caption" component="p">
          {final ? (
            <>
              First round{" "}
              {typeof team.firstRound.averageScore === "number"
                ? team.firstRound.averageScore.toFixed(1)
                : "-"}{" "}
              · {team.timeslot ? finalSlotTime(team.timeslot, timing) : "no slot"} ·{" "}
              {team.room ?? "no room"} ·{" "}
              {team.fundableVotes} fundable
            </>
          ) : (
            <>
              {team.batch ? `Batch ${team.batch}` : "no batch"} · {team.timeslot ?? "no slot"} ·{" "}
              {team.room ?? "no room"}
            </>
          )}
        </Typography>
      </Box>

      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Box sx={{ textAlign: "right", minWidth: 64 }}>
          <Typography variant="data" sx={{ fontSize: "1rem", fontWeight: 600 }}>
            {scored ? team.averageScore.toFixed(1) : "-"}
          </Typography>
          <Typography variant="caption" component="p">
            of {SCORE_MAX_TOTAL}
          </Typography>
        </Box>

        <Chip
          size="small"
          variant="outlined"
          color={team.complete ? "default" : "warning"}
          label={`${team.received}/${team.expected} in`}
          sx={{ "& .MuiChip-label": (t) => ({ ...t.typography.data }) }}
        />
      </Stack>
    </Stack>
  );
}

function judgeNameOf(judge) {
  return [judge?.firstName, judge?.lastName].filter(Boolean).join(" ").trim() || "A judge";
}

function listOf(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What the final round is still waiting on, by judge rather than by team: on
 * the night the useful question is who to go and find, and whether the teams
 * they have scored have an average the others do not.
 */
function FinalWaiting({ state, nameOf }) {
  return (
    <Stack spacing={0.5}>
      <span>Still scoring. This is a running total, not the result.</span>
      {state.partialJudges.map((judge) => (
        <span key={judge.judgeId}>
          {nameOf(judge.judgeId)} has scored {judge.scored} of {judge.of} finalists and still
          owes {listOf(judge.missing)}.
        </span>
      ))}
      {state.partialJudges.length > 0 && (
        <span>
          If they have left, close the final round from the judge page and this becomes the
          result.
        </span>
      )}
    </Stack>
  );
}

/**
 * The top of the final round: who is winning, and how sure that is.
 *
 * "Leading" while cards are still due, "Winner" once they are in. A tie for
 * first names every team on it and claims nothing -- fundable votes and the
 * alphabet are not how a winner is picked.
 */
function LeaderCard({ leaders, decided, closed, notScoring }) {
  const tied = leaders.length > 1;
  const [top] = leaders;
  const heading = tied
    ? decided ? "Tied for first" : "Tied for the lead"
    : decided ? "Winner" : "Leading";

  let detail;
  if (tied) {
    detail = `Fundable votes: ${leaders
      .map((team) => `${team.name} ${team.fundableVotes}`)
      .join(", ")}. Organizers decide the order.`;
  } else if (!decided) {
    detail = "Cards are still coming in.";
  } else {
    detail = closed
      ? "The final round is closed."
      : "Every judge who is scoring has scored every finalist.";
  }

  return (
    <Card sx={{ mb: 2, borderColor: decided ? "primary.main" : "divider" }}>
      <Box sx={{ p: 2.5 }}>
        <Typography
          variant="overline"
          component="p"
          sx={{ color: decided ? "primary.main" : "text.secondary" }}
        >
          {heading}
        </Typography>
        <Typography variant="h1" sx={{ mt: 0.5 }}>
          {listOf(leaders.map((team) => team.name))}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          <Typography variant="data" component="span">
            {top.averageScore.toFixed(1)}
          </Typography>{" "}
          of {SCORE_MAX_TOTAL}
          {tied
            ? " each. "
            : ` across ${top.cardsFiled} ${top.cardsFiled === 1 ? "judge" : "judges"}. `}
          {detail}
        </Typography>
        {notScoring.length > 0 && (
          <Typography variant="caption" component="p" sx={{ mt: 1 }}>
            Not counted: {listOf(notScoring)}, who {notScoring.length === 1 ? "has" : "have"} not
            scored any finalist.
          </Typography>
        )}
      </Box>
    </Card>
  );
}

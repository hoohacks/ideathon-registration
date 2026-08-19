import { onValue, ref, get } from "firebase/database";
import { database } from "../../firebase";
import {
  calculateAverageScore,
  countFundableVotes,
  scoreCard,
  SCORE_FIELDS,
  SCORE_MAX_TOTAL,
} from "../judge/finalRoundService";

import React, { useEffect, useMemo, useState } from "react";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { IoChevronDown } from "react-icons/io5";
import Layout from "../Layout";
import { memberIds } from "../team/teamMembers";
import { PageHeader, FilterBar, SearchField, RowList, Row } from "./adminUi";

function ScoreSummary({ label, scores }) {
  const judgeIds = Object.keys(scores ?? {});
  if (!judgeIds.length) return null;

  const average = calculateAverageScore(scores);
  const fundable = countFundableVotes(scores);

  return (
    <Accordion disableGutters elevation={0} sx={{ "&:before": { display: "none" }, bgcolor: "transparent" }}>
      <AccordionSummary expandIcon={<IoChevronDown />} sx={{ px: 0, minHeight: 40 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
          <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
            {label}
          </Typography>
          <Typography variant="body2">
            {average === null ? "not scored" : `${average.toFixed(1)} / ${SCORE_MAX_TOTAL}`}
            {" · "}
            {judgeIds.length} judge{judgeIds.length === 1 ? "" : "s"}
            {" · "}
            {fundable} fundable
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        <Stack spacing={1.25}>
          {judgeIds.map((judgeId) => {
            const scoreObj = scores[judgeId];
            const card = scoreCard(scoreObj);
            return (
              <Box key={judgeId} sx={{ pl: 1.5, borderLeft: 2, borderColor: "divider" }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                  {card === null ? "—" : `${card.toFixed(1)} / ${SCORE_MAX_TOTAL}`}
                  <Box component="span" sx={{ fontWeight: 400, color: "text.secondary" }}>
                    {"  "}judge {judgeId.slice(0, 8)}
                  </Box>
                </Typography>
                <Typography variant="body2">
                  {Object.entries(SCORE_FIELDS)
                    .map(
                      ([criterion, max]) =>
                        `${criterion.replace(/_/g, " ")} ${scoreObj?.[criterion] ?? "—"}/${max}`
                    )
                    .join(" · ")}
                  {scoreObj?.fundable ? " · fundable" : ""}
                </Typography>
                {scoreObj?.notes && (
                  <Typography variant="body2" sx={{ fontStyle: "italic", mt: 0.25 }}>
                    “{scoreObj.notes}”
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function TeamSearch() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [teams, setTeams] = useState({});
  const [submittedCount, setSubmittedCount] = useState(0);

  const teamCount = Object.keys(teams).length;
  const percentSubmitted = teamCount ? (submittedCount / teamCount) * 100 : 0;

  useEffect(() => {
    const unsubscribe = onValue(ref(database, "/teams/"), async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setTeams({});
        setSubmittedCount(0);
        return;
      }

      let submitted = 0;
      const resolved = {};

      for (const key in data) {
        const team = { ...data[key] };
        if (team.submitted) submitted += 1;

        const members = memberIds(team.members);
        team.memberNames = await Promise.all(
          members.map(async (uid) => {
            const userSnapshot = await get(ref(database, `competitors/${uid}`));
            if (userSnapshot.exists()) {
              const userInfo = userSnapshot.val();
              return `${userInfo.firstName} ${userInfo.lastName}`;
            }
            return "Unknown user";
          })
        );

        resolved[key] = team;
      }

      setSubmittedCount(submitted);
      setTeams(resolved);
    });

    return () => unsubscribe();
  }, []);

  const visibleTeams = useMemo(() => {
    const needle = query.toLowerCase();
    const keys = Object.keys(teams).filter((key) => {
      const team = teams[key];
      return (
        (team?.name ?? "").toLowerCase().includes(needle) ||
        (team?.submission?.ideaName ?? "").toLowerCase().includes(needle)
      );
    });

    const first = (key) => calculateAverageScore(teams[key]?.scores) ?? -1;
    const final = (key) => calculateAverageScore(teams[key]?.scores_final_round) ?? -1;

    return keys.sort((a, b) => {
      if (sortBy === "score") return first(b) - first(a);
      if (sortBy === "finalScore") return final(b) - final(a);
      return (teams[a]?.name ?? "").localeCompare(teams[b]?.name ?? "");
    });
  }, [teams, query, sortBy]);

  return (
    <Layout maxWidth="lg">
      <PageHeader
        title="Teams"
        progress={percentSubmitted}
        stats={[
          { label: "teams", value: teamCount },
          { label: "submitted", value: submittedCount },
          { label: "of teams", value: `${percentSubmitted.toFixed(0)}%` },
        ]}
      />

      <FilterBar>
        <SearchField
          placeholder="Search team or idea name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <TextField
          select
          label="Sort by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="score">First round score</MenuItem>
          <MenuItem value="finalScore">Final round score</MenuItem>
        </TextField>
      </FilterBar>

      <RowList empty="No teams match those filters.">
        {visibleTeams.map((key) => {
          const team = teams[key];
          const submission = team.submission;

          return (
            <Row key={key} accent={Boolean(team.submitted)}>
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography sx={{ fontWeight: 600 }}>{team.name || "Unnamed team"}</Typography>
                  <Chip
                    label={team.submitted ? "submitted" : "not submitted"}
                    size="small"
                    variant={team.submitted ? "filled" : "outlined"}
                    color={team.submitted ? "primary" : "default"}
                  />
                  {team.schedule && (
                    <Chip
                      label={`${team.schedule.time} · ${team.schedule.room}`}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Stack>

                <Typography variant="body2">
                  {team.memberNames?.length
                    ? team.memberNames.join(", ")
                    : "No members"}
                </Typography>

                {team.submitted && submission && (
                  <Box sx={{ mt: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "text.primary" }}>
                        {submission.ideaName}
                      </Typography>
                      {submission.pitchDeckURL && (
                        <Link
                          href={submission.pitchDeckURL}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="body2"
                        >
                          Pitch deck
                        </Link>
                      )}
                    </Stack>
                    <Typography variant="body2">{submission.problemStatement}</Typography>
                    <Typography variant="body2">Industry: {submission.targetIndustry}</Typography>
                  </Box>
                )}

                <ScoreSummary label="First round" scores={team.scores} />
                <ScoreSummary label="Final round" scores={team.scores_final_round} />
              </Stack>
            </Row>
          );
        })}
      </RowList>
    </Layout>
  );
}

export default TeamSearch;

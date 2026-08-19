import { Box, Card, LinearProgress, Stack, TextField, Typography } from "@mui/material";

/**
 * Shared furniture for the three admin dashboards. They used to each carry
 * their own copy of a page title, a stats line, a progress bar and a filter
 * row, all sized with inline styles that had drifted apart.
 */

export function PageHeader({ title, stats = [], progress, children }) {
    return (
        <Box sx={{ mb: 2 }}>
            <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={1}
            >
                <Typography variant="h1">{title}</Typography>
                {children}
            </Stack>

            {stats.length > 0 && (
                <Stack
                    direction="row"
                    spacing={2.5}
                    sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}
                >
                    {stats.map(({ label, value }) => (
                        <Stack key={label} direction="row" spacing={0.75} alignItems="baseline">
                            <Typography sx={{ fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                                {value}
                            </Typography>
                            <Typography variant="body2">{label}</Typography>
                        </Stack>
                    ))}
                </Stack>
            )}

            {typeof progress === "number" && progress > 0 && (
                <LinearProgress
                    variant="determinate"
                    value={Math.min(100, Math.max(0, progress))}
                    sx={{
                        mt: 1.5,
                        height: 6,
                        borderRadius: 3,
                        bgcolor: "divider",
                        "& .MuiLinearProgress-bar": { borderRadius: 3 },
                    }}
                />
            )}
        </Box>
    );
}

export function FilterBar({ children }) {
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mb: 2 }}
        >
            {children}
        </Stack>
    );
}

export function SearchField(props) {
    return <TextField sx={{ flex: 1, minWidth: 200 }} {...props} />;
}

/** A flat list of hairline-separated rows, not a stack of 30px-padded boxes. */
export function RowList({ children, empty = "Nothing to show." }) {
    const items = Array.isArray(children) ? children.filter(Boolean) : children;
    const isEmpty = Array.isArray(items) ? items.length === 0 : !items;

    if (isEmpty) {
        return (
            <Card sx={{ p: 3 }}>
                <Typography variant="body2" align="center">
                    {empty}
                </Typography>
            </Card>
        );
    }

    return (
        <Card>
            <Box
                sx={{
                    "& > *:not(:last-child)": { borderBottom: 1, borderColor: "divider" },
                }}
            >
                {items}
            </Box>
        </Card>
    );
}

export function Row({ children, accent = false }) {
    return (
        <Box
            sx={{
                px: 2,
                py: 1.5,
                borderLeft: accent ? 2 : 0,
                borderLeftColor: "primary.main",
            }}
        >
            {children}
        </Box>
    );
}
